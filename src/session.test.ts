import { describe, expect, it } from 'vitest';
import { parseLaunchSession } from './session';

const TOKEN = 'a'.repeat(64);

describe('parseLaunchSession', () => {
  it('accepts only private LAN HTTP frame URLs', () => {
    expect(parseLaunchSession(`#frame=http%3A%2F%2F192.168.50.178%3A8088&token=${TOKEN}`))
      .toEqual({ frameUrl: 'http://192.168.50.178:8088', token: TOKEN });
  });

  it.each([
    `#frame=https%3A%2F%2F192.168.1.2&token=${TOKEN}`,
    `#frame=http%3A%2F%2Fexample.com&token=${TOKEN}`,
    '#frame=http%3A%2F%2F192.168.1.2&token=short',
  ])('rejects an unsafe launch fragment', (fragment) => {
    expect(() => parseLaunchSession(fragment)).toThrow();
  });
});
