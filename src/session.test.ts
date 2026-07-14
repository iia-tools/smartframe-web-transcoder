import { describe, expect, it } from 'vitest';
import { parseLaunchSession } from './session';

const TOKEN = 'a'.repeat(64);

describe('parseLaunchSession', () => {
  it('accepts a same-device management-page bridge', () => {
    expect(parseLaunchSession(`#frame=http%3A%2F%2F192.168.50.178%3A8090&bridge=http%3A%2F%2F192.168.50.178%3A8088&token=${TOKEN}`))
      .toEqual({
        frameUrl: 'http://192.168.50.178:8090',
        bridgeUrl: 'http://192.168.50.178:8088',
        token: TOKEN,
      });
  });

  it.each([
    `#frame=http%3A%2F%2F192.168.50.178%3A8090&token=${TOKEN}`,
    `#frame=http%3A%2F%2F192.168.50.178%3A8090&bridge=http%3A%2F%2F192.168.50.179%3A8088&token=${TOKEN}`,
    `#frame=http%3A%2F%2F192.168.50.178%3A8090&bridge=https%3A%2F%2F192.168.50.178%3A8088&token=${TOKEN}`,
  ])('rejects an unrelated bridge', (fragment) => {
    expect(() => parseLaunchSession(fragment)).toThrow();
  });

  it.each([
    `#frame=https%3A%2F%2F192.168.1.2&token=${TOKEN}`,
    `#frame=http%3A%2F%2Fexample.com&token=${TOKEN}`,
    '#frame=http%3A%2F%2F192.168.1.2&token=short',
  ])('rejects an unsafe launch fragment', (fragment) => {
    expect(() => parseLaunchSession(fragment)).toThrow();
  });
});
