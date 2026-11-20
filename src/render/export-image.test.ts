import { describe, it, expect } from 'vitest';
import type { LegendEntry } from '@/core/legend';
import type { CatalogEntry, Plan, Shape } from '@/core/types';
import { drawExportImage, exportSize, EXPORT_CELL, type ExportInput } from './export-image';
import { DARK_SCENE, legendHeight, LEGEND_LINE, LEGEND_ROW, type Draw2D } from './renderer';

interface Call { op: string; args: (number | string)[]; fill: string }

/** Just enough of a canvas to see what was drawn where. */
function recorder(): Draw2D & { calls: Call[] } {
  const calls: Call[] = [];
  const record = (op: string) => (...args: (number | string)[]) => { calls.push({ op, args, fill: stub.fillStyle }); };
  const stub = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt' as const, globalAlpha: 1,
    font: '', textAlign: 'left' as const, textBaseline: 'top' as const, calls,
    fillRect: record('fillRect'), strokeRect: record('strokeRect'),
    beginPath: record('beginPath'), moveTo: record('moveTo'), lineTo: record('lineTo'),
    closePath: record('closePath'), fill: record('fill'), stroke: record('stroke'),
    fillText: record('fillText'), save: record('save'), restore: record('restore'),
    translate: record('translate'), scale: record('scale'), rotate: record('rotate'),
    clipRect: record('clipRect'), fillPath: record('fillPath'), strokePath: record('strokePath'),
    drawImage: record('drawImage'),
  };
  return stub as unknown as Draw2D & { calls: Call[] };
}

const belt: CatalogEntry = {
  id: 'belt', displayName: { en: 'Belt', fr: 'Tapis' }, category: 'conveyor',
  footprint: { w: 1, h: 3 }, price: 100, upgradePrice: null, maxTier: 3, ports: [],
};
const art: Shape = { kind: 'path', d: 'M0 0L1 1', fill: '#abcdef' };
const geometry = {
  main: [[{ x: 0, y: 0, w: 20, h: 20 }, { x: 20, y: 0, w: 30, h: 40 }]],
  second: [[{ x: 0, y: 0, w: 70, h: 60 }], [{ x: 0, y: 0, w: 70, h: 30 }]],
};
const plan: Plan = {
  gameVersion: 'test', warehouse: 'main',
  placements: [{ id: 'b', objectId: 'belt', warehouse: 'main', floor: 0, cell: { x: 2, y: 2 }, rotation: 0, tier: 1 }],
};
const entries: LegendEntry[] = [
  { kind: 'object', objectId: 'belt', count: 3 },
  { kind: 'zone', label: 'Walkway', count: 1 },
  { kind: 'door', look: 'delivery' },
];

const input = (over: Partial<ExportInput> = {}): ExportInput => ({
  scene: {
    plan, catalogue: new Map([[belt.id, belt]]), palette: DARK_SCENE, floor: 0,
    geometry, unlocked: geometry,
    shapes: (id) => (id === 'belt' ? [art] : undefined), shapeDivisor: 12,
    icons: new Map(), cargoIcons: new Map(), doors: [], stairs: [],
    doorArrow: [], doorArrowDivisor: 12, repaintableColourOf: () => null,
  },
  dims: { w: 50, h: 40 },
  entries,
  legend: {
    catalogue: new Map([[belt.id, belt]]),
    shapes: (id) => (id === 'belt' ? [art] : undefined), shapeDivisor: 12,
    icons: new Map(), cargoIcons: new Map(),
    text: (e) => (e.kind === 'object' ? 'Straight conveyor' : e.kind === 'zone' ? e.label ?? 'Zone' : 'Delivery'),
    headings: { objects: 'Objects', zones: 'Reserved areas', doors: 'Doors' },
  },
  title: 'Main warehouse', subtitle: '3 objects · $300', footer: 'parcelplanner.app',
  ...over,
});
const name = input().legend.text;
const texts = (ctx: ReturnType<typeof recorder>) =>
  ctx.calls.filter((c) => c.op === 'fillText').map((c) => ({ text: c.args[0], x: c.args[1] as number }));

describe('exportSize', () => {
  it('draws the whole building, doors and all, with the legend beside it', () => {
    // 50 cells plus four either side for the doors hanging outside the walls.
    const size = exportSize({ w: 50, h: 40 }, entries, name);
    expect(size.plan.width).toBe(58 * EXPORT_CELL);
    expect(size.width).toBeGreaterThan(size.plan.width);
    expect(size.height).toBeGreaterThan(size.plan.height);
  });

  it('grows taller for a legend longer than the building', () => {
    const long = Array.from({ length: 80 }, (_, i): LegendEntry => ({ kind: 'object', objectId: `o${i}`, count: 1 }));
    const size = exportSize({ w: 50, h: 40 }, long, name);
    expect(size.legend.height).toBeGreaterThan(size.plan.height);
    expect(size.height).toBeGreaterThan(size.legend.height);
    expect(size.legend.height).toBeGreaterThan(80 * LEGEND_ROW);
  });
});

describe('drawExportImage', () => {
  it('titles the picture and signs it', () => {
    const ctx = recorder();
    drawExportImage(ctx, input());
    const words = texts(ctx).map((t) => t.text);
    expect(words).toContain('Main warehouse');
    expect(words).toContain('3 objects · $300');
    expect(words).toContain('parcelplanner.app');
  });

  it('draws the plan below the title, at the picture scale', () => {
    const ctx = recorder();
    drawExportImage(ctx, input());
    const shift = ctx.calls.findIndex((c) => c.op === 'translate' && c.args[0] === 0 && (c.args[1] as number) > 0);
    expect(shift).toBeGreaterThan(-1);
    // The scene's own background, filling exactly the plan's area.
    const { plan: area } = exportSize({ w: 50, h: 40 }, entries, name);
    const background = ctx.calls.slice(shift).find((c) => c.op === 'fillRect' && c.fill === DARK_SCENE.background);
    expect(background?.args).toEqual([0, 0, area.width, area.height]);
  });

  it('writes the legend to the right of the plan, with each count', () => {
    const ctx = recorder();
    drawExportImage(ctx, input());
    const { plan: area } = exportSize({ w: 50, h: 40 }, entries, name);
    const row = texts(ctx).find((t) => t.text === 'Straight conveyor');
    expect(row?.x).toBeGreaterThan(area.width);
    expect(texts(ctx).map((t) => t.text)).toEqual(expect.arrayContaining(['Objects', 'Reserved areas', 'Doors', '×3', 'Walkway', 'Delivery']));
  });

  it('draws each object in the legend with its own artwork, as in the plan', () => {
    const ctx = recorder();
    drawExportImage(ctx, input({ scene: { ...input().scene, plan: { ...plan, placements: [] } } }));
    // Nothing on the plan, so the only artwork drawn is the legend's.
    expect(ctx.calls.filter((c) => c.op === 'fillPath' && c.fill === '#abcdef')).toHaveLength(1);
  });
});

describe('the legend and long names', () => {
  // The two French diverters differ only in their last word: cut to one line,
  // the legend named them both "Convoyeur de Déviation e…".
  const long = 'Convoyeur de Déviation en fonction du Type de Fret';
  const legendOf = (text: string): ExportInput => input({
    entries: [{ kind: 'object', objectId: 'belt', count: 2 }],
    legend: { ...input().legend, text: () => text },
  });
  const legendRows = (ctx: ReturnType<typeof recorder>) => {
    const { plan: area } = exportSize({ w: 50, h: 40 }, entries, name);
    return ctx.calls.filter((c) => c.op === 'fillText' && (c.args[1] as number) > area.width
      && !['Objects', 'parcelplanner.app'].includes(String(c.args[0])) && !String(c.args[0]).startsWith('×'));
  };

  it('wraps a long name onto the next line rather than cutting it short', () => {
    const ctx = recorder();
    drawExportImage(ctx, legendOf(long));
    const rows = legendRows(ctx);
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.args[0]).join(' ')).toBe(long);
    // One under the other, at the same indent.
    expect(rows[1]!.args[1]).toBe(rows[0]!.args[1]);
    expect((rows[1]!.args[2] as number) - (rows[0]!.args[2] as number)).toBe(LEGEND_LINE);
  });

  it('makes the row, and so the legend, taller by a line', () => {
    const one = [{ kind: 'object' as const, objectId: 'belt', count: 2 }];
    expect(legendHeight(one, 360, () => long) - legendHeight(one, 360, () => 'Belt')).toBe(LEGEND_LINE);
  });

  it('still cuts a runaway name short after three lines', () => {
    const ctx = recorder();
    drawExportImage(ctx, legendOf('Allée '.repeat(60).trim()));
    const rows = legendRows(ctx);
    expect(rows.length).toBe(3);
    expect(String(rows[2]!.args[0]).endsWith('…')).toBe(true);
  });

  it('cuts a single word longer than a line rather than letting it run into the count', () => {
    const ctx = recorder();
    drawExportImage(ctx, legendOf('x'.repeat(40)));
    const rows = legendRows(ctx);
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.args[0]).join('')).toBe('x'.repeat(40));
  });
});
