export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type PhotoTransform = Point & { scale: number };

export function fitImage(image: Size, viewport: Size): Size {
  if (image.width <= 0 || image.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return { width: 0, height: 0 };
  const ratio = Math.min(1, viewport.width / image.width, viewport.height / image.height);
  return { width: image.width * ratio, height: image.height * ratio };
}

export function clampTransform(transform: PhotoTransform, fitted: Size, viewport: Size): PhotoTransform {
  const scale = Math.max(1, Math.min(4, transform.scale));
  const maxX = scale === 1 ? 0 : Math.max(0, (fitted.width * scale - viewport.width) / 2);
  const maxY = scale === 1 ? 0 : Math.max(0, (fitted.height * scale - viewport.height) / 2);
  return {
    scale,
    x: maxX === 0 ? 0 : Math.max(-maxX, Math.min(maxX, transform.x)),
    y: maxY === 0 ? 0 : Math.max(-maxY, Math.min(maxY, transform.y)),
  };
}

export function zoomAt(current: PhotoTransform, requestedScale: number, anchor: Point, fitted: Size, viewport: Size, destination: Point = anchor): PhotoTransform {
  const scale = Math.max(1, Math.min(4, requestedScale));
  const ratio = scale / current.scale;
  return clampTransform({ scale, x: destination.x - (anchor.x - current.x) * ratio, y: destination.y - (anchor.y - current.y) * ratio }, fitted, viewport);
}
