import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrameApi, type Job } from './frame-api';

const TOKEN = 'b'.repeat(64);
const BRIDGE = 'http://192.168.50.178:8088';
const FRAME = 'http://192.168.50.178:8090';
const JOB: Job = {
  state: 'ready', message: 'ready', file_name: 'sample.mp4', input_bytes: 20,
  output_name: 'sample-smartframe.mp4', received_bytes: 0,
  expires_at: Date.now() + 60_000, remote_path: '',
};

type RequestMessage = {
  type: string;
  id: string;
  operation: string;
  start?: number;
  end?: number;
};

function bridgedApi(onRequest?: (message: RequestMessage) => Record<string, unknown>) {
  let receive: ((event: MessageEvent) => void) | undefined;
  const opener = {
    closed: false,
    postMessage: vi.fn((message: RequestMessage, targetOrigin: string) => {
      const payload = onRequest?.(message) ?? { job: JOB };
      receive?.({
        source: opener,
        origin: targetOrigin,
        data: { type: 'smartframe-transcode-response', id: message.id, ok: true, ...payload },
      } as unknown as MessageEvent);
    }),
  };
  vi.stubGlobal('window', {
    opener,
    addEventListener: (_type: string, listener: (event: MessageEvent) => void) => { receive = listener; },
    setTimeout,
    clearTimeout,
  });
  return { api: new FrameApi({ frameUrl: FRAME, bridgeUrl: BRIDGE, token: TOKEN }), opener };
}

afterEach(() => vi.unstubAllGlobals());

describe('FrameApi management-page bridge', () => {
  it('loads a job through the opener instead of the LAN converter port', async () => {
    const { api, opener } = bridgedApi();
    await expect(api.job()).resolves.toEqual(JOB);
    expect(opener.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'smartframe-transcode-request', operation: 'job', token: TOKEN,
    }), BRIDGE, []);
  });

  it('adapts range reads to bridge messages with valid HTTP range responses', async () => {
    const { api } = bridgedApi((message) => ({
      buffer: new ArrayBuffer((message.end ?? 0) - (message.start ?? 0) + 1),
    }));
    const fetchInput = api.inputFetch(20);
    const response = await fetchInput!('unused', { headers: { Range: 'bytes=8-' } });
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 8-19/20');
    expect((await response.arrayBuffer()).byteLength).toBe(12);
  });
});
