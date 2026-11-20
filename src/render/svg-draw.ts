import type { Draw2D } from './renderer';

/**
 * A `Draw2D` that writes SVG instead of painting a canvas, so the server draws a shared layout's
 * picture with the same `drawScene` as the editor.
 * Transforms are applied per primitive, as a matrix on a wrapping `<g>`, rather than by nesting
 * groups on save/restore, so the output cannot fall out of step with the caller's bracketing.
 */

/** A 2D affine transform, in the order SVG writes it: a b c d e f. */
type Matrix = readonly [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `outer` applied after `inner`, the way a canvas composes transforms. */
function multiply(outer: Matrix, inner: Matrix): Matrix {
  const [a, b, c, d, e, f] = outer;
  const [A, B, C, D, E, F] = inner;
  return [
    a * A + c * B,
    b * A + d * B,
    a * C + c * D,
    b * C + d * D,
    a * E + c * F + e,
    b * E + d * F + f,
  ];
}

const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Trims float noise: canvas coordinates land on things like 31.999999997. */
const n = (value: number): string => (Math.round(value * 100) / 100).toString();

export interface SvgDraw extends Draw2D {
  /** The finished document, `width` by `height` on `background`. */
  toSvg(width: number, height: number, background: string): string;
}

export function createSvgDraw(): SvgDraw {
  const parts: string[] = [];
  let stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  let clips: (string | null)[] = [];
  let clip: string | null = null;
  let clipCount = 0;

  let fillStyle = '#000000';
  let strokeStyle = '#000000';
  let lineWidth = 1;
  let globalAlpha = 1;
  let lineCap: 'round' | 'butt' = 'butt';
  let font = '10px sans-serif';
  let textAlign: 'left' | 'center' | 'right' = 'left';
  let textBaseline: 'top' | 'middle' | 'bottom' = 'top';

  /** The path being built by beginPath/moveTo/lineTo. */
  let path: string[] = [];

  const wrap = (body: string): void => {
    const transform = ctm === IDENTITY ? '' : ` transform="matrix(${ctm.map(n).join(' ')})"`;
    const clipped = clip ? ` clip-path="url(#${clip})"` : '';
    const alpha = globalAlpha >= 1 ? '' : ` opacity="${n(globalAlpha)}"`;
    parts.push(`<g${transform}${clipped}${alpha}>${body}</g>`);
  };

  /** Font size out of a CSS font string, for text positioning. */
  const fontSize = (): number => Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 10);

  return {
    get fillStyle() { return fillStyle; },
    set fillStyle(v: string) { fillStyle = v; },
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(v: string) { strokeStyle = v; },
    get lineWidth() { return lineWidth; },
    set lineWidth(v: number) { lineWidth = v; },
    get globalAlpha() { return globalAlpha; },
    set globalAlpha(v: number) { globalAlpha = v; },
    get lineCap() { return lineCap; },
    set lineCap(v: 'round' | 'butt') { lineCap = v; },
    get font() { return font; },
    set font(v: string) { font = v; },
    get textAlign() { return textAlign; },
    set textAlign(v: 'left' | 'center' | 'right') { textAlign = v; },
    get textBaseline() { return textBaseline; },
    set textBaseline(v: 'top' | 'middle' | 'bottom') { textBaseline = v; },

    fillRect(x, y, w, h) {
      wrap(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${escapeAttr(fillStyle)}"/>`);
    },
    strokeRect(x, y, w, h) {
      wrap(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="none"`
        + ` stroke="${escapeAttr(strokeStyle)}" stroke-width="${n(lineWidth)}"/>`);
    },

    beginPath() { path = []; },
    moveTo(x, y) { path.push(`M${n(x)} ${n(y)}`); },
    lineTo(x, y) { path.push(`L${n(x)} ${n(y)}`); },
    closePath() { path.push('Z'); },
    fill() {
      if (path.length > 0) wrap(`<path d="${path.join('')}" fill="${escapeAttr(fillStyle)}"/>`);
    },
    stroke() {
      if (path.length === 0) return;
      wrap(`<path d="${path.join('')}" fill="none" stroke="${escapeAttr(strokeStyle)}"`
        + ` stroke-width="${n(lineWidth)}" stroke-linecap="${lineCap}"/>`);
    },

    fillPath(d) { wrap(`<path d="${escapeAttr(d)}" fill="${escapeAttr(fillStyle)}"/>`); },
    strokePath(d) {
      wrap(`<path d="${escapeAttr(d)}" fill="none" stroke="${escapeAttr(strokeStyle)}"`
        + ` stroke-width="${n(lineWidth)}" stroke-linecap="${lineCap}"/>`);
    },

    fillText(text, x, y) {
      const anchor = textAlign === 'center' ? 'middle' : textAlign === 'right' ? 'end' : 'start';
      // SVG has no `bottom`/`top` baseline; these are the usual equivalents,
      // and the rulers are the only text drawn at all.
      const dy = textBaseline === 'middle' ? fontSize() * 0.35
        : textBaseline === 'top' ? fontSize() * 0.9
        : 0;
      wrap(`<text x="${n(x)}" y="${n(y + dy)}" fill="${escapeAttr(fillStyle)}"`
        + ` font-family="sans-serif" font-size="${n(fontSize())}" text-anchor="${anchor}">`
        + `${escapeAttr(text)}</text>`);
    },

    save() { stack.push(ctm); clips.push(clip); },
    restore() {
      ctm = stack.pop() ?? IDENTITY;
      clip = clips.pop() ?? null;
    },
    translate(x, y) { ctm = multiply(ctm, [1, 0, 0, 1, x, y]); },
    scale(x, y) { ctm = multiply(ctm, [x, 0, 0, y, 0, 0]); },
    rotate(radians) {
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      ctm = multiply(ctm, [cos, sin, -sin, cos, 0, 0]);
    },
    clipRect(x, y, w, h) {
      const id = `c${clipCount++}`;
      // Declared in the current transform, like the canvas does, by carrying
      // the same matrix on the clipPath's own child.
      parts.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse">`
        + `<rect transform="matrix(${ctm.map(n).join(' ')})" x="${n(x)}" y="${n(y)}"`
        + ` width="${n(w)}" height="${n(h)}"/></clipPath>`);
      clip = id;
    },

    // Icons are PNG files on disk. A card is drawn far from a browser, so
    // rather than teach this to read them, they are simply left out: they are
    // a few pixels of detail on a picture seen at thumbnail size, and their
    // absence costs nothing a viewer would notice.
    drawImage() {},

    toSvg(width, height, background) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`
        + ` viewBox="0 0 ${width} ${height}">`
        + `<rect width="${width}" height="${height}" fill="${escapeAttr(background)}"/>`
        + parts.join('')
        + '</svg>';
    },
  };
}
