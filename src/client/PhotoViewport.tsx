import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { clampTransform, fitImage, zoomAt } from './viewer-geometry';
import type { PhotoTransform, Point, Size } from './viewer-geometry';

type Props = { src: string; alt: string; onPrevious: () => void; onNext: () => void };
const centered: PhotoTransform = { scale: 1, x: 0, y: 0 };

export default function PhotoViewport({ src, alt, onPrevious, onNext }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [fitted, setFitted] = useState<Size>({ width: 0, height: 0 });
  const dimensions = useRef({ fitted: { width: 0, height: 0 }, viewport: { width: 0, height: 0 } });
  const [transform, setTransform] = useState(centered);
  const transformRef = useRef(centered);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<{ distance: number; anchor: Point; transform: PhotoTransform } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = stage.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1);
      const anchor = { x: event.clientX - bounds.left - bounds.width / 2, y: event.clientY - bounds.top - bounds.height / 2 };
      updateTransform(zoomAt(transformRef.current, transformRef.current.scale * Math.exp(-delta * 0.002), anchor, dimensions.current.fitted, dimensions.current.viewport));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => { stage.removeEventListener('wheel', onWheel); clearGesture(stage, false); };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    measure();
    return () => observer.disconnect();
  }, []);

  function updateTransform(next: PhotoTransform) {
    transformRef.current = next;
    setTransform(next);
  }

  function zoom(scale: number) {
    updateTransform(zoomAt(transformRef.current, scale, { x: 0, y: 0 }, dimensions.current.fitted, dimensions.current.viewport));
  }

  function clearGesture(stage = stageRef.current, updateDragging = true) {
    const ids = [...pointers.current.keys()];
    pointers.current.clear();
    swipe.current = null;
    pinch.current = null;
    for (const id of ids) if (stage?.hasPointerCapture?.(id)) stage.releasePointerCapture(id);
    if (updateDragging) setDragging(false);
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointers.current.has(event.pointerId)) clearGesture();
  }

  function pinchCoordinates() {
    const [first, second] = [...pointers.current.values()];
    const bounds = stageRef.current!.getBoundingClientRect();
    return {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      anchor: { x: (first.x + second.x) / 2 - bounds.left - bounds.width / 2, y: (first.y + second.y) / 2 - bounds.top - bounds.height / 2 },
    };
  }

  function rebasePinch() {
    pinch.current = pointers.current.size === 2 ? { ...pinchCoordinates(), transform: transformRef.current } : null;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && (event.button !== 0 || transformRef.current.scale === 1)) return;
    if (pointers.current.size === 0 && event.pointerType === 'touch' && transformRef.current.scale === 1) swipe.current = { x: event.clientX, y: event.clientY };
    else swipe.current = null;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    rebasePinch();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(transformRef.current.scale > 1);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const old = pointers.current.get(event.pointerId);
    if (!old) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size > 1) {
      if (pointers.current.size !== 2) return;
      const start = pinch.current;
      if (!start || start.distance === 0) { rebasePinch(); return; }
      const { distance, anchor } = pinchCoordinates();
      updateTransform(zoomAt(start.transform, start.transform.scale * distance / start.distance, start.anchor, dimensions.current.fitted, dimensions.current.viewport, anchor));
      return;
    }
    const current = transformRef.current;
    if (current.scale > 1) {
      swipe.current = null;
      updateTransform(clampTransform({ ...current, x: current.x + event.clientX - old.x, y: current.y + event.clientY - old.y }, dimensions.current.fitted, dimensions.current.viewport));
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    const start = swipe.current;
    swipe.current = null;
    pointers.current.delete(event.pointerId);
    rebasePinch();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(pointers.current.size > 0 && transformRef.current.scale > 1);
    if (start && pointers.current.size === 0 && transformRef.current.scale === 1) {
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) onNext();
        else onPrevious();
      }
    }
  }

  function measure() {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image) return;
    const viewport = stage.getBoundingClientRect();
    const fitted = fitImage({ width: image.naturalWidth, height: image.naturalHeight }, viewport);
    const previous = dimensions.current;
    if (previous.viewport.width === viewport.width && previous.viewport.height === viewport.height && previous.fitted.width === fitted.width && previous.fitted.height === fitted.height) return;
    clearGesture();
    dimensions.current = { viewport, fitted };
    setFitted(fitted);
    updateTransform(clampTransform(transformRef.current, fitted, viewport));
  }

  return <><div className={`viewer__stage${transform.scale > 1 ? ' viewer__stage--zoomed' : ''}${dragging ? ' viewer__stage--dragging' : ''}`} ref={stageRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onLostPointerCapture={onPointerCancel} onClick={(event) => event.stopPropagation()}>
    <img className="viewer__image" ref={imageRef} src={src} alt={alt} draggable={false} onLoad={measure} style={{ width: fitted.width || undefined, height: fitted.height || undefined, transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }} />
  </div><div className="viewer__zoom" role="group" aria-label="Photo zoom controls" onClick={(event) => event.stopPropagation()}>
    <button type="button" aria-label="Zoom out" title="Zoom out" disabled={transform.scale === 1} onClick={() => zoom(transformRef.current.scale - 0.5)}>−</button>
    <button type="button" aria-label="Reset zoom" title="Reset zoom" onClick={() => { clearGesture(); updateTransform(centered); }}>Reset</button>
    <button type="button" aria-label="Zoom in" title="Zoom in" disabled={transform.scale === 4} onClick={() => zoom(transformRef.current.scale + 0.5)}>+</button>
  </div></>;
}
