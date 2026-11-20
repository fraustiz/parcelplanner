import { createPathCache } from './path-cache';
import type { Draw2D } from './renderer';

/**
 * The browser side of drawing: a real canvas behind the renderer's `Draw2D`, and the icon images.
 * Shared by the editor and the image export, so a saved picture matches the screen, icons included.
 */

/**
 * Every path in the artwork, built once per page. Module level because the shape sheet is a
 * build-time constant (90 distinct paths), so the cache is bounded by the artwork.
 */
const path2D = createPathCache((d: string) => new Path2D(d));

/**
 * Adapts a CanvasRenderingContext2D to `Draw2D`, so the renderer stays DOM-free and testable.
 * - Fill and stroke styles are tracked locally: a real context types them wider than `string`.
 * - `fillPath`/`strokePath` take an SVG `d` string and wrap it in `Path2D`.
 * - `drawImage` takes an icon path that `getImage` resolves (see useImageCache in GridCanvas);
 *   an image not loaded yet draws nothing.
 */
export function toDraw2D(ctx: CanvasRenderingContext2D, getImage: (path: string) => CanvasImageSource | undefined): Draw2D {
  let fillStyle = '';
  let strokeStyle = '';
  return {
    get fillStyle() { return fillStyle; },
    set fillStyle(v: string) { fillStyle = v; ctx.fillStyle = v; },
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(v: string) { strokeStyle = v; ctx.strokeStyle = v; },
    get lineWidth() { return ctx.lineWidth; },
    set lineWidth(v: number) { ctx.lineWidth = v; },
    get globalAlpha() { return ctx.globalAlpha; },
    set globalAlpha(v: number) { ctx.globalAlpha = v; },
    get lineCap() { return ctx.lineCap as 'round' | 'butt'; },
    set lineCap(v: 'round' | 'butt') { ctx.lineCap = v; },
    get font() { return ctx.font; },
    set font(v: string) { ctx.font = v; },
    get textAlign() { return ctx.textAlign as 'left' | 'center' | 'right'; },
    set textAlign(v: 'left' | 'center' | 'right') { ctx.textAlign = v; },
    get textBaseline() { return ctx.textBaseline as 'top' | 'middle' | 'bottom'; },
    set textBaseline(v: 'top' | 'middle' | 'bottom') { ctx.textBaseline = v; },
    fillRect: (x, y, w, h) => ctx.fillRect(x, y, w, h),
    strokeRect: (x, y, w, h) => ctx.strokeRect(x, y, w, h),
    beginPath: () => ctx.beginPath(),
    moveTo: (x, y) => ctx.moveTo(x, y),
    lineTo: (x, y) => ctx.lineTo(x, y),
    closePath: () => ctx.closePath(),
    fill: () => ctx.fill(),
    stroke: () => ctx.stroke(),
    fillText: (text, x, y) => ctx.fillText(text, x, y),
    save: () => ctx.save(),
    restore: () => ctx.restore(),
    translate: (x, y) => ctx.translate(x, y),
    scale: (x, y) => ctx.scale(x, y),
    rotate: (radians) => ctx.rotate(radians),
    clipRect: (x, y, w, h) => { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); },
    fillPath: (d) => ctx.fill(path2D(d)),
    strokePath: (d) => ctx.stroke(path2D(d)),
    drawImage: (path, x, y, w, h) => {
      const img = getImage(path);
      if (!img) return; // missing or still loading: draw nothing this frame
      ctx.drawImage(img, x, y, w, h);
    },
  };
}

/**
 * Recolours every opaque pixel of `img` to black, keeping its alpha. The game's icon PNGs are
 * white glyphs that vanish on the light-grey scanner artwork; `source-in` changes colour, never shape.
 */
export function blackenIcon(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas; // canvas 2D unsupported: falls back to a blank (fully transparent) icon
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * One icon, loaded and ready to stamp, blackened unless it keeps its own colours (see blackenIcon).
 * For a picture drawn once, where drawing nothing until the image arrives would leave holes.
 * A failed load resolves to undefined so one missing glyph does not fail the export.
 */
export function loadIcon(path: string, keepOwnColours: boolean): Promise<CanvasImageSource | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(keepOwnColours ? img : blackenIcon(img));
    img.onerror = () => resolve(undefined);
    img.src = path;
  });
}
