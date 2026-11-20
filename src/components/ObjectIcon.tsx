'use client';

import type { Shape } from '@/core/types';

/**
 * An object's palette icon, rendered as inline SVG from
 * `src/data/generated/shapes.json`, the same data `drawShapeGroup` paints on
 * the canvas.
 *
 * `rect` fields are in cell units and `path` strings in raw viewBox units (see
 * `Shape` in src/core/types.ts), so with a `w*divisor × h*divisor` viewBox
 * paths go in verbatim and only rects are multiplied by `divisor`.
 */
export default function ObjectIcon({
  shapes,
  divisor,
  footprint,
  /** The object's identifying glyph (a criteria scanner's weight/country/…
   * logo), laid over the artwork as the renderer does. The six criteria
   * scanners share a drawing and differ only by this logo. */
  iconPath,
  label,
  className,
}: {
  shapes: readonly Shape[];
  divisor: number;
  footprint: { w: number; h: number };
  iconPath?: string;
  /** Left out where a visible name sits beside the icon, so it is not read twice. */
  label?: string;
  className?: string;
}) {
  const vbW = footprint.w * divisor;
  const vbH = footprint.h * divisor;
  // Matches ICON_SCALE in src/render/renderer.ts: a fraction of one cell, so
  // the glyph fits a single cell however long the object is.
  const glyph = divisor * 0.55;

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      // Default preserveAspectRatio ("meet") letterboxes a long object into
      // the square slot rather than squashing it.
      className={className}
    >
      {shapes.map((shape, i) => {
        if (shape.kind === 'rect') {
          return (
            <rect
              key={i}
              x={shape.x * divisor}
              y={shape.y * divisor}
              width={shape.w * divisor}
              height={shape.h * divisor}
              fill={shape.fill}
            />
          );
        }
        if ('fill' in shape) {
          return <path key={i} d={shape.d} fill={shape.fill} />;
        }
        return (
          <path
            key={i}
            d={shape.d}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth}
            strokeLinecap={shape.cap ?? 'butt'}
            fill="none"
          />
        );
      })}
      {iconPath && (
        <image
          href={iconPath}
          x={(vbW - glyph) / 2}
          y={(vbH - glyph) / 2}
          width={glyph}
          height={glyph}
          // Solid black like the canvas icons (see blackenIcon in
          // GridCanvas.tsx): `brightness(0)` zeroes colour and keeps alpha.
          style={{ filter: 'brightness(0)' }}
        />
      )}
    </svg>
  );
}
