import type { LaunchSession } from './session';

export type Job = {
  state: string;
  message: string;
  file_name: string;
  input_bytes: number;
  output_name: string;
  received_bytes: number;
  expires_at: number;
  remote_path: string;
};

type ApiResponse = { ok: boolean; message?: string; error?: string; job?: Job };

type BridgeResponse = {
  type: 'smartframe-transcode-response';
  id: string;
  ok: boolean;
  error?: string;
  job?: Job;
  buffer?: ArrayBuffer;
};

const BRIDGE_CHUNK_BYTES = 8 * 1024 * 1024;
const BRIDGE_TIMEOUT_MS = 60_000;

class OpenerBridge {
  private sequence = 0;
  private readonly pending = new Map<string, {
    resolve: (response: BridgeResponse) => void;
    reject: (error: Error) => void;
    timer: number;
  }>();

  constructor(
    private readonly session: LaunchSession & { bridgeUrl: string },
    private readonly opener: Window,
  ) {
    window.addEventListener('message', this.receive);
  }

  static create(session: LaunchSession): OpenerBridge | null {
    if (!session.bridgeUrl || !window.opener) return null;
    return new OpenerBridge(session as LaunchSession & { bridgeUrl: string }, window.opener);
  }

  request(operation: string, payload: Record<string, unknown> = {}, transfer: Transferable[] = []): Promise<BridgeResponse> {
    if (this.opener.closed) return Promise.reject(new Error('스마트프레임 관리 페이지가 닫혔습니다. 관리 페이지에서 변환을 다시 시작해 주세요.'));
    const id = `${Date.now().toString(36)}-${(++this.sequence).toString(36)}`;
    return new Promise<BridgeResponse>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('스마트프레임 관리 페이지의 응답 시간이 초과됐습니다.'));
      }, BRIDGE_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.opener.postMessage({
        type: 'smartframe-transcode-request', id, operation,
        token: this.session.token, ...payload,
      }, this.session.bridgeUrl, transfer);
    });
  }

  private readonly receive = (event: MessageEvent<BridgeResponse>): void => {
    if (event.source !== this.opener || event.origin !== this.session.bridgeUrl) return;
    const response = event.data;
    if (!response || response.type !== 'smartframe-transcode-response' || typeof response.id !== 'string') return;
    const request = this.pending.get(response.id);
    if (!request) return;
    this.pending.delete(response.id);
    window.clearTimeout(request.timer);
    if (!response.ok) {
      request.reject(new Error(response.error || '스마트프레임 중계 요청에 실패했습니다.'));
      return;
    }
    request.resolve(response);
  };
}

export class FrameApi {
  private readonly bridge: OpenerBridge | null;

  constructor(private readonly session: LaunchSession) {
    this.bridge = OpenerBridge.create(session);
  }

  inputUrl(): string {
    return `${this.session.frameUrl}/api/browser-transcode/input`;
  }

  requestInit(extra: RequestInit = {}): RequestInit {
    const request: RequestInit & { targetAddressSpace?: 'local' } = {
      ...extra,
      headers: {
        'X-SmartFrame-Job-Token': this.session.token,
        ...(extra.headers ?? {}),
      },
    };
    if (location.origin !== this.session.frameUrl) {
      // Chrome uses this hint to show its Local Network Access permission prompt.
      request.targetAddressSpace = 'local';
    }
    return request as RequestInit;
  }

  async job(): Promise<Job> {
    if (this.bridge) return this.bridgeJob('job');
    return this.request('/api/browser-transcode/job', { method: 'GET' });
  }

  inputFetch(inputBytes: number): typeof fetch | undefined {
    if (!this.bridge) return undefined;
    if (!Number.isSafeInteger(inputBytes) || inputBytes <= 0 || inputBytes > 512 * 1024 * 1024) {
      throw new Error('변환할 영상 크기가 올바르지 않습니다.');
    }
    return (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      const range = headers.get('Range') || '';
      const match = /^bytes=(\d+)-/.exec(range);
      const start = match ? Number(match[1]) : 0;
      if (!Number.isSafeInteger(start) || start < 0 || start >= inputBytes) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${inputBytes}` } });
      }
      const end = Math.min(inputBytes - 1, start + BRIDGE_CHUNK_BYTES - 1);
      const response = await this.bridge!.request('input-range', { start, end });
      if (!(response.buffer instanceof ArrayBuffer) || response.buffer.byteLength !== end - start + 1) {
        throw new Error('스마트프레임에서 영상 조각을 완전하게 읽지 못했습니다.');
      }
      return new Response(response.buffer, {
        status: 206,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(response.buffer.byteLength),
          'Content-Range': `bytes ${start}-${end}/${inputBytes}`,
          'Content-Type': 'video/mp4',
        },
      });
    }) as typeof fetch;
  }

  async uploadChunk(offset: number, chunk: Uint8Array): Promise<Job> {
    if (this.bridge) {
      const buffer = chunk.slice().buffer;
      const response = await this.bridge.request('upload-chunk', { offset, buffer }, [buffer]);
      if (!response.job) throw new Error('스마트프레임의 저장 진행 상태가 없습니다.');
      return response.job;
    }
    return this.request('/api/browser-transcode/chunk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-SmartFrame-Chunk-Offset': String(offset),
      },
      body: chunk as BodyInit,
    });
  }

  async complete(): Promise<Job> {
    if (this.bridge) return this.bridgeJob('complete');
    return this.request('/api/browser-transcode/complete', { method: 'POST' });
  }

  async cancel(): Promise<void> {
    try {
      if (this.bridge) {
        await this.bridgeJob('cancel');
        return;
      }
      await this.request('/api/browser-transcode/cancel', { method: 'POST' });
    } catch {
      // The capability may already have expired; local cancellation still succeeds.
    }
  }

  private async bridgeJob(operation: 'job' | 'complete' | 'cancel'): Promise<Job> {
    if (!this.bridge) throw new Error('스마트프레임 변환 중계를 사용할 수 없습니다.');
    const response = await this.bridge.request(operation);
    if (!response.job) throw new Error('스마트프레임의 변환 작업 정보가 없습니다.');
    return response.job;
  }

  private async request(path: string, init: RequestInit): Promise<Job> {
    let response: Response;
    try {
      response = await fetch(`${this.session.frameUrl}${path}`, this.requestInit(init));
    } catch {
      throw new Error('스마트프레임에 연결하지 못했습니다. 같은 Wi-Fi인지 확인하고, 브라우저 주소창의 로컬 네트워크 접근 요청을 허용해 주세요.');
    }
    let data: ApiResponse;
    try {
      data = await response.json() as ApiResponse;
    } catch {
      throw new Error('스마트프레임 응답을 읽지 못했습니다. 같은 Wi-Fi인지 확인해 주세요.');
    }
    if (!response.ok || !data.ok || !data.job) {
      throw new Error(data.message || data.error || `스마트프레임 요청에 실패했습니다 (${response.status}).`);
    }
    return data.job;
  }
}
