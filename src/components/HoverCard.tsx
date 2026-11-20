'use client';

import { displayColumn, displayRow, rotatedFootprint, warehouseDimensions } from '@/core/grid';
import type { CatalogEntry, Placement } from '@/core/types';
import { WAREHOUSES } from '@/data/warehouses';
import { formatMoney, t, type Locale } from '@/i18n';

/** A zone's size as it lies on the grid, turned or not (`W×H`). */
export const sizeOf = (entry: CatalogEntry, placement: Placement): string => {
  const { w, h } = rotatedFootprint(entry.footprint, placement.rotation);
  return `${w}×${h}`;
};

/** Offset from the pointer, so the card never sits under the cursor itself. */
const GAP = 14;
/** Estimated card size, to keep it inside the viewport near an edge (see
 * ContextMenu's constants). */
const CARD_W = 220;
const CARD_H = 110;

/**
 * The plain-text card shown while the pointer rests over a placed object. A
 * canvas has no per-object DOM nodes, so there is no `title` to fall back on.
 */
export default function HoverCard({
  placement,
  entry,
  note,
  at,
  locale,
}: {
  /** Absent over bare floor, where a note can still be left. */
  placement?: Placement;
  entry?: CatalogEntry;
  /** The note left on this cell, if any. Shown first and in full, since the
   * grid only marks that a note exists. */
  note?: string;
  /** Pointer position, in client (viewport) pixels. */
  at: { x: number; y: number };
  locale: Locale;
}) {
  const ins = entry?.ports.filter((p) => p.dir === 'in').length ?? 0;
  const outs = entry?.ports.filter((p) => p.dir === 'out').length ?? 0;
  // Counted up from the bottom-left, like the rulers, not the raw `cell.y`.
  const row = placement
    ? displayRow(placement.cell.y, warehouseDimensions(placement.warehouse, WAREHOUSES))
    : 0;

  const left = Math.min(at.x + GAP, Math.max(0, window.innerWidth - CARD_W));
  const top = Math.min(at.y + GAP, Math.max(0, window.innerHeight - CARD_H));

  return (
    <div
      role="tooltip"
      style={{ left, top }}
      // pointer-events-none: the card follows the pointer and would otherwise
      // cancel the hover that opened it.
      className="pointer-events-none fixed z-40 w-55 rounded border border-[var(--line-strong)] bg-[var(--panel)]/95 px-3 py-2 text-xs shadow-lg"
    >
      {note !== undefined && (
        // whitespace-pre-line keeps a note's line breaks.
        <div className="mb-1 whitespace-pre-line font-medium text-[var(--text-strong)]">{note}</div>
      )}
      {/* A reserved zone (src/core/zone.ts) has no ports, tier, price or
          front: only its name and size. */}
      {placement && entry?.category === 'zone' && (
        <>
          <div className="mb-1 font-semibold">{placement.label ?? entry.displayName[locale]}</div>
          {placement.label && (
            <div className="mb-0.5 text-[var(--text-faint)]">{entry.displayName[locale]}</div>
          )}
          <dl className="space-y-0.5 text-[var(--text-faint)]">
            {/* Two pairs on one line: each keeps its own group, as a dl requires. */}
            <div className="inline">
              <dt className="inline">{t(locale, 'inspector.cell')}:</dt>{' '}
              <dd className="inline">{displayColumn(placement.cell.x)}, {row}<span aria-hidden="true"> · </span></dd>
            </div>
            <div className="inline">
              <dt className="inline">{t(locale, 'tooltip.footprint')}:</dt>{' '}
              <dd className="inline">{sizeOf(entry, placement)}</dd>
            </div>
          </dl>
        </>
      )}
      {placement && entry && entry.category !== 'zone' && (
      <>
      <div className="mb-1 font-semibold">{entry.displayName[locale]}</div>
      <dl className="space-y-0.5 text-[var(--text-faint)]">
        {/* Two pairs on one line: each keeps its own group, as a dl requires. */}
        <div className="inline">
          <dt className="inline">{t(locale, 'inspector.cell')}:</dt>{' '}
          <dd className="inline">{displayColumn(placement.cell.x)}, {row}<span aria-hidden="true"> · </span></dd>
        </div>
        <div className="inline">
          <dt className="inline">{t(locale, 'tooltip.footprint')}:</dt>{' '}
          <dd className="inline">{entry.footprint.w}×{entry.footprint.h}</dd>
        </div>
        <div>
          <dt className="inline">{t(locale, 'inspector.rotation')}:</dt>{' '}
          <dd className="inline">
            {placement.rotation}°
            {placement.mirrored ? ` · ${t(locale, 'inspector.mirrored')}` : ''}
          </dd>
        </div>
        <div><dt className="inline">{t(locale, 'tooltip.ports')}:</dt> <dd className="inline">{ins} → {outs}</dd></div>
        <div>
          <dt className="inline">{t(locale, 'inspector.tier')}:</dt>{' '}
          <dd className="inline">
            {placement.tier}
            {entry.price === null ? '' : ` · $${formatMoney(entry.price, locale)}`}
          </dd>
        </div>
      </dl>
      </>
      )}
    </div>
  );
}
