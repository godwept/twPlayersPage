import { describe, expect, it } from 'vitest';
import { fitImage, clampTransform, zoomAt } from '../../src/client/viewer-geometry';

describe('viewer geometry', () => {
  it('fits landscape, portrait, and smaller images without distortion or upscaling', () => {
    expect(fitImage({ width: 1200, height: 800 }, { width: 600, height: 600 })).toEqual({ width: 600, height: 400 });
    expect(fitImage({ width: 800, height: 1200 }, { width: 600, height: 600 })).toEqual({ width: 400, height: 600 });
    expect(fitImage({ width: 200, height: 100 }, { width: 600, height: 600 })).toEqual({ width: 200, height: 100 });
  });

  it('bounds zoom and pan and centers axes smaller than the viewport', () => {
    const fitted = { width: 600, height: 400 };
    const viewport = { width: 600, height: 600 };
    expect(clampTransform({ scale: 2, x: 9999, y: -9999 }, fitted, viewport)).toEqual({ scale: 2, x: 300, y: -100 });
    expect(clampTransform({ scale: 2, x: -9999, y: 9999 }, fitted, viewport)).toEqual({ scale: 2, x: -300, y: 100 });
    expect(clampTransform({ scale: 0, x: 100, y: 100 }, fitted, viewport)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(clampTransform({ scale: 9, x: 0, y: 0 }, fitted, viewport)).toEqual({ scale: 4, x: 0, y: 0 });
    expect(clampTransform({ scale: 2, x: 100, y: 100 }, { width: 100, height: 100 }, viewport)).toEqual({ scale: 2, x: 0, y: 0 });
  });

  it('remains finite and centered before dimensions are available', () => {
    expect(fitImage({ width: 0, height: 0 }, { width: 600, height: 600 })).toEqual({ width: 0, height: 0 });
    expect(fitImage({ width: 1200, height: 800 }, { width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
    expect(clampTransform({ scale: 2, x: 9999, y: 9999 }, { width: 0, height: 0 }, { width: 0, height: 0 })).toEqual({ scale: 2, x: 0, y: 0 });
  });

  it('keeps the image point beneath the zoom focal point fixed', () => {
    const size = { width: 600, height: 400 };
    expect(zoomAt({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 0 }, size, size)).toEqual({ scale: 2, x: -100, y: 0 });
    const old = { scale: 2, x: -50, y: 30 };
    const anchor = { x: 100, y: -40 };
    const next = zoomAt(old, 3, anchor, size, size);
    expect((anchor.x - next.x) / next.scale).toBe((anchor.x - old.x) / old.scale);
    expect((anchor.y - next.y) / next.scale).toBe((anchor.y - old.y) / old.scale);
  });

  it('uses the clamped zoom ratio and bounds the resulting pan', () => {
    const size = { width: 600, height: 400 };
    expect(zoomAt({ scale: 2, x: 0, y: 0 }, 9, { x: 100, y: 0 }, size, size)).toEqual({ scale: 4, x: -100, y: 0 });
    expect(zoomAt({ scale: 2, x: 100, y: 100 }, 0, { x: 100, y: 100 }, size, size)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(zoomAt({ scale: 1, x: 0, y: 0 }, 2, { x: 9999, y: 9999 }, size, size)).toEqual({ scale: 2, x: -300, y: -200 });
  });

  it('keeps the focal image point under a moving pinch midpoint', () => {
    const size = { width: 600, height: 400 };
    expect(zoomAt({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 0 }, size, size, { x: 150, y: 50 })).toEqual({ scale: 2, x: -50, y: 50 });
  });
});
