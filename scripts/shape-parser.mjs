/**
 * Pure SVG -> Shape[] parsing and mapping validation, split out of
 * build-shapes.mjs so tests can import it without writing to disk.
 *
 * The source SVGs use <rect> and <path>, plus three exporter extras:
 *   1. `rotate(angle cx cy)` on some <rect>s, always a multiple of 90 degrees:
 *      converted to the equivalent axis-aligned rect at build time.
 *   2. `<g clip-path>` wrappers whose clip equals the viewBox: a no-op, so the
 *      <g> is stripped and its children kept.
 *   3. A base64 PNG glyph as `<rect fill="url(#pattern)">`: dropped, since Shape
 *      has no raster kind. The glyph exists as a PNG (src/data/icons.ts) and is
 *      drawn over the vector art; build-shapes.mjs prints one summary line.
 * No gradients, masks, transforms on <path>, or text appear in the sources.
 */

/** 1 grid cell = 12 viewBox units in every file (a 1x3 file is 12x36).
 * Rects are divided at build time; path `d` strings are scaled by the
 * renderer using this value from the built JSON (see src/core/types.ts). */
export const DIVISOR = 12;

/**
 * Every shape in the source SVGs is rendered as drawn, including the blue
 * side-rail frame (`#044ABE`) and the direction arrow. Do not filter artwork
 * content here.
 */

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
/** The non-hex colour keywords the source files use. Anything else stops the
 * build; widen this list only when a drawing needs it. */
const NAMED_COLORS = new Set(['black', 'white']);

function assertColor(value, filename, context) {
  if (HEX_COLOR.test(value) || NAMED_COLORS.has(value)) return value;
  throw new Error(
    `build-shapes: ${filename}: unrecognised colour "${value}" in ${context} — expected a hex colour or one of ${[...NAMED_COLORS].join(', ')}`,
  );
}

function getAttr(attrs, name) {
  const m = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : undefined;
}

/** SVG `rotate(a, cx, cy)` for multiples of 90. Rounding removes float
 * noise such as cos(90deg) = 6.1e-17. */
function rotatePoint(x, y, cx, cy, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/**
 * Applies `rotate(angle cx cy)` (angle a multiple of 90) to a rect, returning
 * the bounding box of its rotated corners in raw viewBox units. Throws on any
 * other transform rather than misplacing the rect.
 */
function applyRectTransform(x, y, w, h, transform, filename) {
  const m = transform.match(/^rotate\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/);
  if (!m) {
    throw new Error(
      `build-shapes: ${filename}: unsupported transform "${transform}" — only rotate(angle cx cy) is handled`,
    );
  }
  const angle = ((Number(m[1]) % 360) + 360) % 360;
  if (angle % 90 !== 0) {
    throw new Error(
      `build-shapes: ${filename}: unsupported rotation angle ${m[1]} — only multiples of 90 degrees are handled`,
    );
  }
  const cx = Number(m[2]);
  const cy = Number(m[3]);
  const corners = [
    rotatePoint(x, y, cx, cy, angle),
    rotatePoint(x + w, y, cx, cy, angle),
    rotatePoint(x, y + h, cx, cy, angle),
    rotatePoint(x + w, y + h, cx, cy, angle),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

/**
 * Parses one SVG into Shape[], keeping source order (paint order). Throws on
 * anything it cannot represent, apart from the cases in the module doc.
 */
export function parseSvg(svgText, filename) {
  const viewBoxMatch = svgText.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (!viewBoxMatch) throw new Error(`build-shapes: ${filename}: no "viewBox=\"0 0 W H\"" found`);
  const vbWidth = Number(viewBoxMatch[1]);
  if (vbWidth !== DIVISOR) {
    throw new Error(`build-shapes: ${filename}: expected a ${DIVISOR}-wide viewBox, got ${vbWidth}`);
  }

  // <defs> only holds patterns, clip paths and images, never geometry.
  let body = svgText.replace(/<defs>[\s\S]*?<\/defs>/g, '');
  // Unwrap the no-op clip groups, keeping their children.
  body = body.replace(/<g[^>]*>/g, '').replace(/<\/g>/g, '');

  const inner = body.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

  const leftoverTag = inner.match(/<(?!rect\b|path\b)([a-zA-Z][a-zA-Z0-9]*)/);
  if (leftoverTag) {
    throw new Error(
      `build-shapes: ${filename}: unexpected <${leftoverTag[1]}> element — only <rect> and <path> are supported here`,
    );
  }

  const shapes = [];
  const elementPattern = /<(rect|path)\b([^>]*)\/>/g;
  let match;
  while ((match = elementPattern.exec(inner))) {
    const tag = match[1];
    const attrs = match[2];

    if (tag === 'rect') {
      const fill = getAttr(attrs, 'fill');
      if (fill === undefined) throw new Error(`build-shapes: ${filename}: <rect> with no fill`);
      if (fill.startsWith('url(')) {
        // Raster glyph, dropped on purpose (point 3 in the module doc).
        continue;
      }
      assertColor(fill, filename, 'a <rect> fill');

      let x = Number(getAttr(attrs, 'x') ?? 0);
      let y = Number(getAttr(attrs, 'y') ?? 0);
      let w = Number(getAttr(attrs, 'width'));
      let h = Number(getAttr(attrs, 'height'));
      const transform = getAttr(attrs, 'transform');
      if (transform) {
        ({ x, y, w, h } = applyRectTransform(x, y, w, h, transform, filename));
      }
      // Rects are divided here; rewriting every number in a path `d` string
      // would be error-prone, so paths are scaled at draw time.
      shapes.push({ kind: 'rect', x: x / DIVISOR, y: y / DIVISOR, w: w / DIVISOR, h: h / DIVISOR, fill });
      continue;
    }

    const d = getAttr(attrs, 'd');
    if (!d) throw new Error(`build-shapes: ${filename}: <path> with no d`);
    const fill = getAttr(attrs, 'fill');
    const stroke = getAttr(attrs, 'stroke');
    if (fill !== undefined && stroke !== undefined) {
      throw new Error(`build-shapes: ${filename}: <path> has both fill and stroke — only one is supported`);
    }
    if (fill !== undefined) {
      assertColor(fill, filename, 'a <path> fill');
      shapes.push({ kind: 'path', d, fill });
    } else if (stroke !== undefined) {
      assertColor(stroke, filename, 'a <path> stroke');
      const cap = getAttr(attrs, 'stroke-linecap');
      // Defaults to 1 like SVG, but an explicit stroke-width is honoured.
      const strokeWidthAttr = getAttr(attrs, 'stroke-width');
      const strokeWidth = strokeWidthAttr === undefined ? 1 : Number(strokeWidthAttr);
      const shape = { kind: 'path', d, stroke, strokeWidth };
      if (cap === 'round' || cap === 'butt') shape.cap = cap;
      else if (cap !== undefined) {
        throw new Error(`build-shapes: ${filename}: unsupported stroke-linecap "${cap}"`);
      }
      shapes.push(shape);
    } else {
      throw new Error(`build-shapes: ${filename}: <path> with neither fill nor stroke`);
    }
  }
  return shapes;
}

/**
 * Throws on an unmapped file, a mapping to a missing file or catalogue id, or
 * two files claiming the same id and variant.
 */
export function validateMapping(mapping, svgFilenames, catalogueIds, idOf, keyOf) {
  const filenameSet = new Set(svgFilenames);
  const mappedFilenames = Object.keys(mapping);

  for (const filename of svgFilenames) {
    if (!(filename in mapping)) {
      throw new Error(`build-shapes: "${filename}" has no entry in scripts/svg-shape-map.mjs`);
    }
  }
  for (const filename of mappedFilenames) {
    if (!filenameSet.has(filename)) {
      throw new Error(`build-shapes: scripts/svg-shape-map.mjs maps "${filename}", but that file does not exist in assets/shapes/`);
    }
    const id = idOf(mapping[filename]);
    if (!catalogueIds.has(id)) {
      throw new Error(`build-shapes: "${filename}" maps to "${id}", which is not in src/data/generated/catalogue.json`);
    }
  }

  // Keyed on id + variant: variants (racks fr/en, elevator bas/haut) share an id.
  const seen = new Map();
  for (const [filename, entry] of Object.entries(mapping)) {
    const key = keyOf(entry);
    const earlier = seen.get(key);
    if (earlier) {
      throw new Error(`build-shapes: both "${earlier}" and "${filename}" map to "${key}" — each catalogue id/variant may have at most one SVG`);
    }
    seen.set(key, filename);
  }
}
