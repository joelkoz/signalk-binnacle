import { type Rgba, rasterIcon } from '$shared/map';

export const VESSEL_ICON_ID = 'binnacle-vessel';

// Drawn at 2x for retina crispness; the overlay adds the image with pixelRatio 2, so the
// on-screen size is half this. The hull is laid out in a 64-unit design space and scaled
// to fill the canvas.
const PX = 80;
const DESIGN = 64;

function rgba(color: Rgba, alpha: number = color.a): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${(alpha / 255).toFixed(3)})`;
}

function darken(color: Rgba, factor: number): Rgba {
  return {
    r: Math.round(color.r * factor),
    g: Math.round(color.g * factor),
    b: Math.round(color.b * factor),
    a: color.a,
  };
}

// A top-down boat hull pointing up (north at 0 rotation), so the symbol layer's
// icon-rotate by heading turns the bow to the vessel's heading. The pointed bow and the
// flat transom make the heading unambiguous. Drawn with the 2D canvas for clean edges;
// falls back to a filled triangle where there is no canvas (the node test environment).
export function vesselIconImage(color: Rgba): ImageData {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = PX;
    canvas.height = PX;
    const ctx = canvas.getContext('2d');
    if (ctx) return drawHull(ctx, color);
  }
  return fallbackTriangle(color);
}

function drawHull(ctx: CanvasRenderingContext2D, color: Rgba): ImageData {
  const outline = rgba(darken(color, 0.5));
  ctx.clearRect(0, 0, PX, PX);
  ctx.scale(PX / DESIGN, PX / DESIGN);
  // A sleek, elongated hull: a sharp bow at the top carries the heading, tapering to a
  // flat transom at the bottom. No interior lines, so the silhouette reads cleanly.
  ctx.beginPath();
  ctx.moveTo(32, 4); // sharp bow
  ctx.quadraticCurveTo(44, 24, 43, 44); // starboard bow shoulder to beam to quarter
  ctx.quadraticCurveTo(42, 53, 38, 57); // to the transom corner
  ctx.lineTo(26, 57); // flat transom
  ctx.quadraticCurveTo(22, 53, 21, 44); // port quarter
  ctx.quadraticCurveTo(20, 24, 32, 4); // port side back to the bow
  ctx.closePath();
  ctx.fillStyle = rgba(color);
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = outline;
  ctx.stroke();
  return ctx.getImageData(0, 0, PX, PX);
}

// The triangle half-width at row y is y / this divisor, which sets the apex angle: a larger divisor
// draws a narrower, taller-looking triangle.
const HALF_WIDTH_DIVISOR = 2.4;

function fallbackTriangle(color: Rgba): ImageData {
  return rasterIcon(PX, color, (x, y, center) => {
    const halfWidth = y / HALF_WIDTH_DIVISOR;
    return y > 6 && Math.abs(x - center) <= halfWidth;
  });
}
