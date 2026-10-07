import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PhotoViewport from '../../src/client/PhotoViewport';

let viewport = { width: 600, height: 400, left: 0, top: 0 };
let resize: () => void;
let disconnect: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resize = () => {};
  disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resize = () => callback([], this as unknown as ResizeObserver); }
    observe = vi.fn();
    disconnect = disconnect;
  });
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  });
  viewport = { width: 600, height: 400, left: 0, top: 0 };
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('viewer__stage')
      ? { ...viewport, x: viewport.left, y: viewport.top, right: viewport.left + viewport.width, bottom: viewport.top + viewport.height, toJSON: () => ({}) }
      : { width: 0, height: 0, left: 0, top: 0, x: 0, y: 0, right: 0, bottom: 0, toJSON: () => ({}) };
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function openPhoto() {
  const previous = vi.fn();
  const next = vi.fn();
  const close = vi.fn();
  const rendered = render(<div onClick={close}><PhotoViewport src="/display.jpg" alt="Gallery photo" onPrevious={previous} onNext={next} /></div>);
  const image = screen.getByRole('img') as HTMLImageElement;
  Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 800 } });
  fireEvent.load(image);
  const stage = image.parentElement!;
  const captures = new Set<number>();
  stage.setPointerCapture = vi.fn((id: number) => { captures.add(id); });
  stage.hasPointerCapture = vi.fn((id: number) => captures.has(id));
  stage.releasePointerCapture = vi.fn((id: number) => { captures.delete(id); });
  return { ...rendered, image, stage, previous, next, close };
}

function pointer(element: HTMLElement, type: string, id: number, x: number, y: number, pointerType = 'touch', button = 0) {
  fireEvent(element, new PointerEvent(type, { pointerId: id, pointerType, clientX: x, clientY: y, button, bubbles: true }));
}

function transform(image: HTMLImageElement) {
  const match = image.style.transform.match(/translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/);
  if (!match) throw new Error(`Unexpected image transform: ${image.style.transform}`);
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}

describe('photo viewport', () => {
  it('refits and bounds pan when the viewport resizes, cancelling active gestures', () => {
    const { image, stage, next, unmount } = openPhoto();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    pointer(stage, 'pointerdown', 1, 300, 200);
    pointer(stage, 'pointermove', 1, 9999, 9999);
    expect(transform(image)).toEqual({ scale: 2, x: 300, y: 200 });
    viewport = { width: 400, height: 600, left: 0, top: 0 };
    act(() => resize());
    expect(image.style.width).toBe('400px');
    expect(Number.parseFloat(image.style.height)).toBeCloseTo(800 / 3);
    expect(transform(image)).toEqual({ scale: 2, x: 200, y: 0 });
    pointer(stage, 'pointermove', 1, 10, 10);
    pointer(stage, 'pointerup', 1, 10, 10);
    expect(transform(image)).toEqual({ scale: 2, x: 200, y: 0 });
    expect(next).not.toHaveBeenCalled();
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('keeps fitted images centered on resize and prevents stale swipe navigation', () => {
    const { image, stage, next } = openPhoto();
    pointer(stage, 'pointerdown', 1, 300, 200);
    viewport = { width: 400, height: 600, left: 0, top: 0 };
    act(() => resize());
    pointer(stage, 'pointerup', 1, 100, 200);
    expect(image.style.width).toBe('400px');
    expect(transform(image)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['pointercancel', 'lostpointercapture'])('cancels %s without navigation and accepts a fresh gesture', (eventType) => {
    const { stage, next, previous } = openPhoto();
    pointer(stage, 'pointerdown', 1, 300, 200);
    pointer(stage, 'pointermove', 1, 100, 200);
    pointer(stage, eventType, 1, 100, 200);
    pointer(stage, 'pointerup', 1, 100, 200);
    expect(next).not.toHaveBeenCalled();
    expect(previous).not.toHaveBeenCalled();
    pointer(stage, 'pointerdown', 2, 300, 200);
    pointer(stage, 'pointerup', 2, 100, 200);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('keeps gesture clicks inside the viewer and clears active gestures on reset', () => {
    const { image, stage, close, next } = openPhoto();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    pointer(stage, 'pointerdown', 1, 300, 200);
    pointer(stage, 'pointermove', 1, 350, 230);
    pointer(stage, 'pointerup', 1, 350, 230);
    fireEvent.click(stage);
    fireEvent.click(image);
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }));
    expect(transform(image)).toEqual({ scale: 1, x: 0, y: 0 });
    pointer(stage, 'pointerdown', 2, 300, 200);
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }));
    pointer(stage, 'pointerup', 2, 100, 200);
    expect(next).not.toHaveBeenCalled();
  });

  it('releases active pointer capture on unmount', () => {
    const { stage, unmount } = openPhoto();
    pointer(stage, 'pointerdown', 1, 300, 200);
    unmount();
    expect(stage.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it('never swipes after a pinch returns to fitted size until a new gesture begins', () => {
    const { image, stage, next, previous } = openPhoto();
    pointer(stage, 'pointerdown', 1, 250, 200);
    pointer(stage, 'pointerdown', 2, 350, 200);
    pointer(stage, 'pointermove', 2, 450, 200);
    pointer(stage, 'pointermove', 2, 350, 200);
    expect(transform(image).scale).toBe(1);
    pointer(stage, 'pointerup', 2, 350, 200);
    pointer(stage, 'pointermove', 1, 100, 200);
    pointer(stage, 'pointerup', 1, 100, 200);
    expect(next).not.toHaveBeenCalled();
    expect(previous).not.toHaveBeenCalled();
    pointer(stage, 'pointerdown', 3, 300, 200);
    pointer(stage, 'pointerup', 3, 100, 200);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('continues one-finger panning smoothly after lifting a pinch finger', () => {
    const { image, stage, next } = openPhoto();
    pointer(stage, 'pointerdown', 1, 250, 200);
    pointer(stage, 'pointerdown', 2, 350, 200);
    pointer(stage, 'pointermove', 1, 200, 200);
    pointer(stage, 'pointermove', 2, 400, 200);
    pointer(stage, 'pointerup', 2, 400, 200);
    expect(stage).toHaveClass('viewer__stage--dragging');
    pointer(stage, 'pointermove', 1, 210, 210);
    expect(transform(image)).toEqual({ scale: 2, x: 10, y: 10 });
    pointer(stage, 'pointerup', 1, 210, 210);
    expect(next).not.toHaveBeenCalled();
    expect(stage).not.toHaveClass('viewer__stage--dragging');
  });

  it('suppresses three-finger gestures and rebases when returning to two fingers', () => {
    const { image, stage, next, previous } = openPhoto();
    pointer(stage, 'pointerdown', 1, 250, 200);
    pointer(stage, 'pointerdown', 2, 350, 200);
    pointer(stage, 'pointerdown', 3, 300, 200);
    pointer(stage, 'pointermove', 3, 100, 200);
    expect(transform(image).scale).toBe(1);
    pointer(stage, 'pointerup', 3, 100, 200);
    pointer(stage, 'pointermove', 1, 200, 200);
    pointer(stage, 'pointermove', 2, 400, 200);
    expect(transform(image)).toEqual({ scale: 2, x: 0, y: 0 });
    pointer(stage, 'pointerup', 1, 200, 200);
    pointer(stage, 'pointerup', 2, 400, 200);
    expect(next).not.toHaveBeenCalled();
    expect(previous).not.toHaveBeenCalled();
  });

  it('pinches around the fingers, follows their midpoint, and bounds zoom', () => {
    const { image, stage, previous, next } = openPhoto();
    pointer(stage, 'pointerdown', 1, 350, 200);
    pointer(stage, 'pointerdown', 2, 450, 200);
    pointer(stage, 'pointermove', 1, 300, 200);
    pointer(stage, 'pointermove', 2, 500, 200);
    expect(transform(image)).toEqual({ scale: 2, x: -100, y: 0 });
    pointer(stage, 'pointermove', 1, 350, 200);
    pointer(stage, 'pointermove', 2, 550, 200);
    expect(transform(image)).toEqual({ scale: 2, x: -50, y: 0 });
    pointer(stage, 'pointermove', 2, 9999, 200);
    expect(transform(image).scale).toBe(4);
    pointer(stage, 'pointermove', 2, 360, 200);
    expect(transform(image)).toEqual({ scale: 1, x: 0, y: 0 });
    pointer(stage, 'pointerup', 1, 350, 200);
    pointer(stage, 'pointerup', 2, 360, 200);
    expect(previous).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rebases a coincident pinch without non-finite transforms', () => {
    const { image, stage } = openPhoto();
    pointer(stage, 'pointerdown', 1, 300, 200);
    pointer(stage, 'pointerdown', 2, 300, 200);
    pointer(stage, 'pointermove', 2, 400, 200);
    expect(Object.values(transform(image)).every(Number.isFinite)).toBe(true);
    pointer(stage, 'pointermove', 2, 500, 200);
    expect(transform(image).scale).toBe(2);
  });

  it('swipes once per fitted touch gesture and ignores short and vertical gestures', () => {
    const { stage, previous, next } = openPhoto();
    pointer(stage, 'pointerdown', 1, 300, 200);
    pointer(stage, 'pointermove', 1, 100, 200);
    pointer(stage, 'pointerup', 1, 100, 200);
    pointer(stage, 'pointerup', 1, 100, 200);
    expect(next).toHaveBeenCalledTimes(1);
    pointer(stage, 'pointerdown', 2, 100, 200);
    pointer(stage, 'pointerup', 2, 200, 200);
    expect(previous).toHaveBeenCalledTimes(1);
    pointer(stage, 'pointerdown', 3, 100, 200);
    pointer(stage, 'pointerup', 3, 125, 200);
    pointer(stage, 'pointerdown', 4, 300, 100);
    pointer(stage, 'pointerup', 4, 100, 350);
    expect(next).toHaveBeenCalledTimes(1);
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('pans an enlarged photo with one finger without navigating', () => {
    const { image, stage, previous, next } = openPhoto();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    pointer(stage, 'pointerdown', 1, 300, 200);
    pointer(stage, 'pointermove', 1, 400, 250);
    pointer(stage, 'pointerup', 1, 400, 250);
    expect(transform(image)).toEqual({ scale: 1.5, x: 100, y: 50 });
    expect(previous).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('pans an enlarged image with a primary mouse drag and clamps extreme movement', () => {
    const { image, stage, previous, next } = openPhoto();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    pointer(stage, 'pointerdown', 1, 300, 200, 'mouse');
    expect(stage.setPointerCapture).toHaveBeenCalledWith(1);
    pointer(stage, 'pointermove', 1, 350, 230, 'mouse');
    expect(transform(image)).toEqual({ scale: 2, x: 50, y: 30 });
    pointer(stage, 'pointermove', 1, 9999, -9999, 'mouse');
    expect(transform(image)).toEqual({ scale: 2, x: 300, y: -200 });
    pointer(stage, 'pointerup', 1, 9999, -9999, 'mouse');
    expect(stage.releasePointerCapture).toHaveBeenCalledWith(1);
    pointer(stage, 'pointermove', 1, 10, 10, 'mouse');
    expect(transform(image)).toEqual({ scale: 2, x: 300, y: -200 });
    expect(previous).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(image).toHaveAttribute('draggable', 'false');
  });

  it('ignores fitted mouse drags and non-primary mouse buttons', () => {
    const { image, stage, next } = openPhoto();
    pointer(stage, 'pointerdown', 1, 300, 200, 'mouse');
    pointer(stage, 'pointermove', 1, 100, 200, 'mouse');
    pointer(stage, 'pointerup', 1, 100, 200, 'mouse');
    expect(transform(image)).toEqual({ scale: 1, x: 0, y: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    pointer(stage, 'pointerdown', 2, 300, 200, 'mouse', 2);
    pointer(stage, 'pointermove', 2, 100, 200, 'mouse', 2);
    pointer(stage, 'pointerup', 2, 100, 200, 'mouse', 2);
    expect(transform(image)).toEqual({ scale: 1.5, x: 0, y: 0 });
    expect(next).not.toHaveBeenCalled();
  });

  it('zooms around the mouse pointer and prevents wheel scrolling only inside the stage', () => {
    const { image, stage, container } = openPhoto();
    viewport.left = 100;
    viewport.top = 50;
    const wheel = new WheelEvent('wheel', { deltaY: -100, clientX: 500, clientY: 250, bubbles: true, cancelable: true });
    fireEvent(stage, wheel);
    expect(wheel.defaultPrevented).toBe(true);
    const next = transform(image);
    expect(next.scale).toBeGreaterThan(1);
    expect((100 - next.x) / next.scale).toBeCloseTo(100);
    expect(next.y).toBe(0);
    const outside = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    fireEvent(container, outside);
    expect(outside.defaultPrevented).toBe(false);
    expect(transform(image)).toEqual(next);
    fireEvent.wheel(stage, { deltaY: 100, clientX: 500, clientY: 250 });
    expect(transform(image).scale).toBeCloseTo(1);
  });

  it('normalizes wheel modes, bounds zoom, and removes the wheel listener on unmount', () => {
    const { image, stage, unmount } = openPhoto();
    fireEvent.wheel(stage, { deltaY: -2, deltaMode: 1, clientX: 300, clientY: 200 });
    expect(transform(image).scale).toBeGreaterThan(1);
    fireEvent.wheel(stage, { deltaY: -100, deltaMode: 2, clientX: 300, clientY: 200 });
    expect(transform(image).scale).toBe(4);
    fireEvent.wheel(stage, { deltaY: 100000, clientX: 300, clientY: 200 });
    expect(transform(image)).toEqual({ scale: 1, x: 0, y: 0 });
    unmount();
    const wheel = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
    stage.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
  });

  it('zooms with accessible controls, respects limits, and resets without closing', () => {
    const { image, close } = openPhoto();
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    expect(zoomOut).toBeDisabled();
    fireEvent.click(zoomIn);
    expect(transform(image).scale).toBe(1.5);
    fireEvent.click(zoomOut);
    expect(transform(image).scale).toBe(1);
    for (let i = 0; i < 10; i++) fireEvent.click(zoomIn);
    expect(transform(image).scale).toBe(4);
    expect(zoomIn).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }));
    expect(transform(image)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(close).not.toHaveBeenCalled();
  });

  it('fits and centers the display image after load', () => {
    const { image } = openPhoto();
    expect(image).toHaveAttribute('src', '/display.jpg');
    expect(image).toHaveAccessibleName('Gallery photo');
    expect(image.style.width).toBe('600px');
    expect(image.style.height).toBe('400px');
    expect(transform(image)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('stays centered before image dimensions are available', () => {
    render(<PhotoViewport src="/display.jpg" alt="Gallery photo" onPrevious={vi.fn()} onNext={vi.fn()} />);
    expect(transform(screen.getByRole('img') as HTMLImageElement)).toEqual({ scale: 1, x: 0, y: 0 });
  });
});
