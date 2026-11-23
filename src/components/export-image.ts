import { computeCost } from '@/core/cost';
import { warehouseDimensions } from '@/core/grid';
import { legendOf, type LegendEntry } from '@/core/legend';
import { isZone } from '@/core/zone';
import type { Plan } from '@/core/types';
import { getCatalogue } from '@/data/catalogue';
import { repaintableColourOf } from '@/data/colours';
import { countryFlags as flagsOf } from '@/data/countries';
import { DOORS } from '@/data/doors';
import { doorsOf } from '@/core/door-cargo';
import { CARGO_TYPE_ICONS, COUNTRY_DOOR_ICON, KEEP_OWN_COLOURS, OBJECT_ICONS } from '@/data/icons';
import { shapesFor, SHAPE_DIVISOR } from '@/data/shapes';
import { STAIRS } from '@/data/stairs';
import { DOOR_ARROW, UI_SHAPE_DIVISOR } from '@/data/ui-shapes';
import { ownedGeometry, ownedTiersOf } from '@/data/warehouse-tiers';
import { WAREHOUSES } from '@/data/warehouses';
import { formatMoney, t, type Locale, type TranslationKey } from '@/i18n';
import { loadIcon, toDraw2D } from '@/render/canvas-draw';
import { drawExportImage, exportSize } from '@/render/export-image';
import { DARK_SCENE, LIGHT_SCENE } from '@/render/renderer';

/** Pixels per CSS pixel in the saved file, so it stays sharp when zoomed. */
const SCALE = 2;

/**
 * Saves the floor being viewed as a PNG with its legend (see
 * src/render/export-image.ts). Every icon is loaded before drawing, because
 * the picture is drawn once and cannot redraw when an icon arrives.
 */
export async function exportImage(
  plan: Plan,
  floor: number,
  locale: Locale,
  theme: 'light' | 'dark',
  realCountries = false,
): Promise<void> {
  const catalogue = getCatalogue();
  const entries = legendOf(plan, floor, catalogue, doorsOf(DOORS, plan));
  const dims = warehouseDimensions(plan.warehouse, WAREHOUSES);
  const objects = new Map(Object.entries(OBJECT_ICONS));
  const cargo = new Map(Object.entries(CARGO_TYPE_ICONS));

  const countryFlags = flagsOf(realCountries);
  const paths = new Set<string>([COUNTRY_DOOR_ICON, ...cargo.values()]);
  // Only the flags the plan's doors show.
  for (const country of Object.values(plan.doorCountries ?? {})) {
    const flag = countryFlags.get(country);
    if (flag) paths.add(flag);
  }
  for (const p of plan.placements) {
    const icon = p.warehouse === plan.warehouse ? objects.get(p.objectId) : undefined;
    if (icon) paths.add(icon);
  }
  const loaded = new Map<string, CanvasImageSource>();
  await Promise.all([...paths].map(async (path) => {
    const image = await loadIcon(path, KEEP_OWN_COLOURS.has(path));
    if (image) loaded.set(path, image);
  }));

  const text = (entry: LegendEntry) => legendText(entry, locale);
  const { width, height } = exportSize(dims, entries, text);
  const canvas = document.createElement('canvas');
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.scale(SCALE, SCALE);

  const shapes = (id: string, floorOffset: number) => shapesFor(id, { locale, floorOffset });
  const onFloor = plan.placements.filter((p) => p.warehouse === plan.warehouse && p.floor === floor && !isZone(p.objectId));
  const floors = dims.floors > 1
    ? ` · ${t(locale, floor === 0 ? 'warehouse.floor.ground' : 'warehouse.floor.upper')}`
    : '';

  drawExportImage(toDraw2D(context, (path) => loaded.get(path)), {
    scene: {
      plan, catalogue, palette: theme === 'light' ? LIGHT_SCENE : DARK_SCENE, floor,
      geometry: WAREHOUSES, unlocked: ownedGeometry(ownedTiersOf(plan)),
      shapes, shapeDivisor: SHAPE_DIVISOR, icons: objects, cargoIcons: cargo,
      countryIcon: COUNTRY_DOOR_ICON, countryFlags, notes: plan.notes, doors: doorsOf(DOORS, plan), stairs: STAIRS,
      doorArrow: DOOR_ARROW, doorArrowDivisor: UI_SHAPE_DIVISOR, repaintableColourOf,
    },
    dims,
    entries,
    legend: {
      catalogue, shapes, shapeDivisor: SHAPE_DIVISOR, icons: objects, cargoIcons: cargo,
      countryIcon: COUNTRY_DOOR_ICON,
      text,
      headings: {
        objects: t(locale, 'export.objects'),
        zones: t(locale, 'export.zones'),
        doors: t(locale, 'export.doors'),
      },
    },
    title: `${t(locale, `warehouse.${plan.warehouse}` as TranslationKey)}${floors}`,
    subtitle: `${onFloor.length} ${t(locale, 'inspector.objectsTotal')} · $${formatMoney(
      computeCost({ ...plan, placements: onFloor }, catalogue).total, locale,
    )}`,
    footer: 'parcelplanner.app',
  });

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `parcelplanner-${plan.warehouse}${dims.floors > 1 ? `-${floor}` : ''}.png`;
  link.click();
  URL.revokeObjectURL(url);
}

function legendText(entry: LegendEntry, locale: Locale): string {
  switch (entry.kind) {
    case 'object': return getCatalogue().get(entry.objectId)?.displayName[locale] ?? entry.objectId;
    case 'zone': return entry.label ?? t(locale, 'export.zone');
    case 'door': return t(locale, `export.door.${entry.look}` as TranslationKey);
    case 'cargo': return t(locale, `export.cargo.${entry.type}` as TranslationKey);
    case 'country': return t(locale, 'export.country');
  }
}
