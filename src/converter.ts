import {
  ALL_FORMATS,
  AppendOnlyStreamTarget,
  Conversion,
  ConversionCanceledError,
  Input,
  Mp4OutputFormat,
  Output,
  UrlSource,
  type ConversionVideoOptions,
} from 'mediabunny';
import { FrameApi, type Job } from './frame-api';

const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

export type ConversionProgress = {
  phase: 'checking' | 'converting' | 'saving' | 'complete';
  progress: number;
  processedSeconds: number;
  uploadedBytes: number;
  job: Job;
};

class ChunkUploader {
  private pending = new Uint8Array(0);
  private offset = 0;

  constructor(
    private readonly api: FrameApi,
    private readonly onUploaded: (bytes: number) => void,
  ) {}

  stream(): WritableStream<Uint8Array> {
    return new WritableStream<Uint8Array>({
      write: async (chunk) => this.push(chunk),
      close: async () => this.flush(true),
    });
  }

  private async push(chunk: Uint8Array): Promise<void> {
    const merged = new Uint8Array(this.pending.length + chunk.length);
    merged.set(this.pending);
    merged.set(chunk, this.pending.length);
    this.pending = merged;
    await this.flush(false);
  }

  private async flush(all: boolean): Promise<void> {
    while (this.pending.length >= UPLOAD_CHUNK_BYTES || (all && this.pending.length > 0)) {
      const length = all ? Math.min(UPLOAD_CHUNK_BYTES, this.pending.length) : UPLOAD_CHUNK_BYTES;
      const next = this.pending.slice(0, length);
      this.pending = this.pending.slice(length);
      await this.api.uploadChunk(this.offset, next);
      this.offset += next.length;
      this.onUploaded(this.offset);
    }
  }
}

export class BrowserConverter {
  private conversion: Conversion | null = null;
  private canceled = false;

  constructor(
    private readonly api: FrameApi,
    private readonly onProgress: (progress: ConversionProgress) => void,
  ) {}

  async run(): Promise<Job> {
    if (typeof VideoDecoder === 'undefined' || typeof VideoEncoder === 'undefined') {
      throw new Error('이 브라우저에서는 영상 변환 기능(WebCodecs)을 사용할 수 없습니다. HTTPS로 열린 최신 Chrome 또는 Edge에서 다시 시도해 주세요.');
    }
    const job = await this.api.job();
    this.emit(job, 'checking', 0, 0, 0);
    let uploadedBytes = 0;
    const uploader = new ChunkUploader(this.api, (bytes) => {
      uploadedBytes = bytes;
      this.emit(job, 'saving', this.lastProgress, this.lastSeconds, uploadedBytes);
    });
    const input = new Input({
      formats: ALL_FORMATS,
      source: new UrlSource(this.api.inputUrl(), {
        requestInit: this.api.requestInit(),
        maxCacheSize: 48 * 1024 * 1024,
        parallelism: 2,
      }),
    });
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 1 }),
      target: new AppendOnlyStreamTarget(uploader.stream()),
    });
    try {
      this.conversion = await Conversion.init({
        input,
        output,
        tracks: 'primary',
        video: async (track): Promise<ConversionVideoOptions> => {
          const width = await track.getSquarePixelWidth();
          const height = await track.getSquarePixelHeight();
          const resize = Math.max(width, height) > 1280
            ? (width >= height ? { width: 1280 } : { height: 1280 })
            : {};
          return {
            ...resize,
            codec: 'avc',
            bitrate: 4_000_000,
            keyFrameInterval: 2,
            hardwareAcceleration: 'prefer-hardware',
            forceTranscode: true,
          };
        },
        audio: { codec: 'aac', bitrate: 192_000 },
        showWarnings: false,
      });
      if (!this.conversion.isValid) {
        const reasons = this.conversion.discardedTracks.map((item) => item.reason).join(', ');
        throw new Error(`이 브라우저가 영상 코덱을 해독하거나 H.264로 인코딩하지 못합니다${reasons ? ` (${reasons})` : ''}.`);
      }
      this.conversion.onProgress = (progress, seconds) => {
        this.lastProgress = progress;
        this.lastSeconds = seconds;
        this.emit(job, 'converting', progress, seconds, uploadedBytes);
      };
      await this.conversion.execute();
      if (this.canceled) throw new ConversionCanceledError();
      this.emit(job, 'saving', 1, this.lastSeconds, uploadedBytes);
      const complete = await this.api.complete();
      this.emit(complete, 'complete', 1, this.lastSeconds, complete.received_bytes);
      return complete;
    } catch (error) {
      if (!(error instanceof ConversionCanceledError)) await this.api.cancel();
      throw error;
    } finally {
      input.dispose();
      this.conversion = null;
    }
  }

  private lastProgress = 0;
  private lastSeconds = 0;

  async cancel(): Promise<void> {
    this.canceled = true;
    await this.conversion?.cancel();
    await this.api.cancel();
  }

  private emit(job: Job, phase: ConversionProgress['phase'], progress: number,
    processedSeconds: number, uploadedBytes: number): void {
    this.onProgress({ phase, progress, processedSeconds, uploadedBytes, job });
  }
}
