import { describe, expect, it } from 'vitest';
import { fitWithinLongEdge } from './converter';

describe('fitWithinLongEdge', () => {
  it('keeps a landscape frame within 1280 pixels', () => {
    expect(fitWithinLongEdge(3840, 2160, 0)).toEqual({ width: 1280 });
  });

  it('uses display orientation for a rotated portrait frame', () => {
    expect(fitWithinLongEdge(3840, 2160, 90)).toEqual({ height: 1280 });
    expect(fitWithinLongEdge(3840, 2160, 270)).toEqual({ height: 1280 });
  });

  it('does not upscale smaller frames', () => {
    expect(fitWithinLongEdge(640, 480, 0)).toEqual({});
  });
});
