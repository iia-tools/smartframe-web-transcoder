export type LaunchSession = {
  frameUrl: string;
  token: string;
};

const PRIVATE_V4 = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export function parseLaunchSession(fragment: string): LaunchSession {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const token = params.get('token')?.trim() ?? '';
  const rawFrame = params.get('frame')?.trim() ?? '';
  if (!/^[a-f0-9]{64}$/.test(token)) {
    throw new Error('변환 권한이 없거나 올바르지 않습니다. 스마트프레임 파일 관리자에서 다시 시작해 주세요.');
  }
  let frame: URL;
  try {
    frame = new URL(rawFrame);
  } catch {
    throw new Error('스마트프레임 주소가 올바르지 않습니다.');
  }
  const allowedHost = frame.hostname === 'localhost' || PRIVATE_V4.test(frame.hostname);
  if (frame.protocol !== 'http:' || !allowedHost || frame.username || frame.password || frame.pathname !== '/') {
    throw new Error('같은 LAN에 있는 스마트프레임 주소만 사용할 수 있습니다.');
  }
  return { frameUrl: frame.origin, token };
}
