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

export class FrameApi {
  constructor(private readonly session: LaunchSession) {}

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
    return this.request('/api/browser-transcode/job', { method: 'GET' });
  }

  async uploadChunk(offset: number, chunk: Uint8Array): Promise<Job> {
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
    return this.request('/api/browser-transcode/complete', { method: 'POST' });
  }

  async cancel(): Promise<void> {
    try {
      await this.request('/api/browser-transcode/cancel', { method: 'POST' });
    } catch {
      // The capability may already have expired; local cancellation still succeeds.
    }
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
