// Decode SVG text through an Image, then hand the decoded element and a fresh 2D canvas context to
// `draw`, which sizes the canvas, rasterizes the image, and returns the pixels (an ImageData, or a
// richer record for a caller that also needs the drawn dimensions). createImageBitmap does not
// reliably decode SVG blobs across browsers, but Image plus drawImage does. Browser only: the node
// test environment has no document, so this returns null, which callers treat as the degrade signal.
// Any decode failure resolves to null.
export async function decodeSvgToImageData<T>(
  svg: string,
  draw: (img: HTMLImageElement, ctx: CanvasRenderingContext2D) => T | null,
): Promise<T | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  try {
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('svg decode failed'));
      img.src = url;
    });
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return null;
    return draw(img, ctx);
  } catch {
    return null;
  }
}
