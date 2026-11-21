'use client';

import { useMemo } from 'react';
import { Ban } from 'lucide-react';
import { tierPrice } from '@/core/cost';
import { displayColumn, displayRow, warehouseDimensions } from '@/core/grid';
import { getCatalogue } from '@/data/catalogue';
import { COLOUR_NAMES, OBJECT_COLOURS, repaintableColourOf } from '@/data/colours';
import { WAREHOUSES } from '@/data/warehouses';
import { isZone, ZONE_PREFIX } from '@/core/zone';
import { formatMoney, t, type Locale, type TranslationKey } from '@/i18n';
import { useEditor } from '@/store/editor';
import { UNLOCKABLE_CRITERIA, type Criterion } from '@/core/parcel-labels';
import { DOOR_TIMER_SECONDS, PARCELS_PER_TRUCK } from '@/data/deliveries';
import { isPauserOpen, LIVE_PREVIEW, PAUSERS, useSimStats } from '@/store/sim-stats';
import { sizeOf } from './HoverCard';

/** Game time as minutes and seconds, as the game's clock would show it. */
function gameTime(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The parcel preview's counts, at the top of the panel while parcels run. */
function SimStatsPanel({ locale }: { locale: Locale }) {
  const stats = useSimStats((s) => s.stats);
  if (!stats) return null;
  // A share of the parcels that have finished, delivered or fallen. A rack
  // only holds a parcel until an unloader takes it out, so it is no end.
  const finished = stats.delivered + stats.fell;
  const share = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
  // Per game minute, which the preview runs at the game's own pace.
  const minutes = stats.seconds / 60;
  const perMinute = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const rows: ReadonlyArray<readonly [TranslationKey, string, string | null]> = [
    ['sim.time', gameTime(stats.seconds), null],
    ['sim.onBelt', String(stats.onBelt), null],
    ['sim.delivered', String(stats.delivered), finished > 0 ? share.format(stats.delivered / finished) : null],
    ['sim.stored', String(stats.stored), null],
    ['sim.fell', String(stats.fell), finished > 0 ? share.format(stats.fell / finished) : null],
  ];
  const rates: ReadonlyArray<readonly [TranslationKey, number]> = minutes > 0
    ? [['sim.deliveredPerMinute', stats.delivered / minutes], ['sim.fellPerMinute', stats.fell / minutes]]
    : [];
  return (
    <section aria-label={t(locale, 'sim.title')} className="mb-3 border-b border-[var(--line)] pb-3">
      <h2 className="mb-2 font-semibold">{t(locale, 'sim.title')}</h2>
      <dl className="space-y-0.5">
        {rows.map(([key, value, part]) => (
          <div key={key} className="flex items-baseline justify-between gap-2 px-1">
            <dt className="text-[var(--text-faint)]">{t(locale, key)}</dt>
            <dd className="font-mono tabular-nums">
              {part !== null && <span className="mr-2 text-[var(--text-faint)]">{part}</span>}
              {value}
            </dd>
          </div>
        ))}
        {rates.map(([key, value]) => (
          <div key={key} className="flex items-baseline justify-between gap-2 px-1">
            <dt className="text-[var(--text-faint)]">{t(locale, key)}</dt>
            <dd className="font-mono tabular-nums">{perMinute.format(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The names of the criteria a player unlocks, as the inspector lists them. */
const CRITERION_NAME: Readonly<Record<Criterion, TranslationKey>> = {
  country: 'criterion.country',
  weight: 'criterion.weight',
  serial: 'criterion.serial',
  contents: 'criterion.contents',
  stamp: 'criterion.stamp',
  prohibited: 'criterion.prohibited',
};

/**
 * What the preview should assume about the player's game: delivery upgrades
 * and the criteria unlocked so far. Folded away, since the defaults (fully
 * upgraded, everything unlocked) suit most layouts.
 */
function SimSettingsPanel({ locale }: { locale: Locale }) {
  const settings = useSimStats((s) => s.settings);
  const setSettings = useSimStats((s) => s.setSettings);
  const toggle = (criterion: Criterion, on: boolean) => {
    const unlocked = new Set(settings.unlocked);
    if (on) unlocked.add(criterion);
    else unlocked.delete(criterion);
    setSettings({ unlocked });
  };
  return (
    <details className="mb-3 border-b border-[var(--line)] pb-3">
      <summary className="font-semibold">{t(locale, 'simSettings.title')}</summary>
      <div className="mt-2 space-y-2 px-1">
        <label className="flex items-center justify-between gap-2">
          <span className="text-[var(--text-faint)]">{t(locale, 'planner.size')}</span>
          <select
            value={settings.sizeLevel}
            onChange={(event) => setSettings({ sizeLevel: Number(event.target.value) })}
            className="rounded bg-[var(--raised)] px-1.5 py-0.5"
          >
            {PARCELS_PER_TRUCK.map((n, level) => <option key={level} value={level}>{n}</option>)}
          </select>
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-[var(--text-faint)]">{t(locale, 'simSettings.doorTimer')}</span>
          <select
            value={settings.speedLevel}
            onChange={(event) => setSettings({ speedLevel: Number(event.target.value) })}
            className="rounded bg-[var(--raised)] px-1.5 py-0.5"
          >
            {DOOR_TIMER_SECONDS.map((seconds, level) => <option key={level} value={level}>{seconds} s</option>)}
          </select>
        </label>
        <fieldset>
          <legend className="mb-1 text-[var(--text-faint)]">{t(locale, 'simSettings.unlocked')}</legend>
          <p className="mb-1 text-xs text-[var(--text-faint)]">{t(locale, 'simSettings.alwaysOn')}</p>
          {UNLOCKABLE_CRITERIA.map((criterion) => (
            <label key={criterion} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.unlocked.has(criterion)}
                onChange={(event) => toggle(criterion, event.target.checked)}
              />
              {t(locale, CRITERION_NAME[criterion])}
            </label>
          ))}
        </fieldset>
      </div>
    </details>
  );
}

/**
 * Opens or closes a pauser for the parcel preview. Not saved with the plan:
 * in the game an Auto Pauser follows the days it is set to, which the plan
 * does not know.
 */
function PauserToggle({ id, objectId, locale }: { id: string; objectId: string; locale: Locale }) {
  const pausers = useSimStats((s) => s.pausers);
  const setPauserOpen = useSimStats((s) => s.setPauserOpen);
  const open = isPauserOpen(pausers, id, objectId);
  return (
    <div className="mb-3">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={open} onChange={(event) => setPauserOpen(id, event.target.checked)} />
        {t(locale, 'sim.pauserOpen')}
      </label>
      <p className="mt-1 text-xs leading-relaxed text-[var(--text-faint)]">{t(locale, 'sim.pauserHint')}</p>
    </div>
  );
}

export default function Inspector() {
  const plan = useEditor((s) => s.plan);
  const editSelection = useEditor((s) => s.editSelection);
  const locale = useEditor((s) => s.locale);
  const selectedIds = useEditor((s) => s.selectedIds);
  const select = useEditor((s) => s.select);
  const deleteSelection = useEditor((s) => s.deleteSelection);
  const floor = useEditor((s) => s.floor);

  const catalogue = getCatalogue();

  const selected = useMemo(
    () => plan.placements.filter((p) => selectedIds.includes(p.id)),
    [plan.placements, selectedIds],
  );

  /** The highest tier anything in the selection can reach, and the tier they
   * are all on if they agree. `null` means they do not. */
  const tierCeiling = useMemo(
    () => selected.reduce((most, p) => Math.max(most, catalogue.get(p.objectId)?.maxTier ?? 1), 0),
    [selected, catalogue],
  );
  const commonTier = useMemo(() => {
    const first = selected[0]?.tier;
    return first !== undefined && selected.every((p) => p.tier === first) ? first : null;
  }, [selected]);

  /**
   * Clicking a row in either list picks out that type: the whole visible floor
   * with nothing selected, or a narrowing of the current selection. Never
   * reaches a floor or building that is not drawn.
   */
  const pickType = (objectId: string) => {
    const pool = selected.length > 0
      ? selected
      : plan.placements.filter((p) => p.warehouse === plan.warehouse && p.floor === floor);
    // Zones are one row whatever their size (see countByObject).
    const ofType = (p: { objectId: string }) =>
      objectId === ZONE_PREFIX ? isZone(p.objectId) : p.objectId === objectId;
    select(pool.filter(ofType).map((p) => p.id));
  };

  const typeRow = ([objectId, { name, count }]: [string, { name: string; count: number }]) => (
    <li key={objectId}>
      <button
        onClick={() => pickType(objectId)}
        className="flex w-full items-baseline justify-between gap-2 rounded px-1 text-left hover:bg-[var(--tint-accent)]"
      >
        <span className="truncate">{name}</span>
        <span className="shrink-0">×{count}</span>
      </button>
    </li>
  );

  // `tierPrice`, not `computeCost`, which adds plan-wide purchases no
  // selection owns. `null` prices count 0 and are flagged below.
  // `atMaxTier` is the same sum with every object at its own top tier.
  const { total, atMaxTier, unpriced } = useMemo(() => {
    let sum = 0;
    let top = 0;
    const missing: string[] = [];
    for (const placement of selected) {
      const entry = catalogue.get(placement.objectId);
      if (!entry) continue;
      if (entry.price === null) missing.push(entry.id);
      sum += tierPrice(entry, placement.tier);
      top += tierPrice(entry, entry.maxTier);
    }
    return { total: sum, atMaxTier: top, unpriced: missing.length > 0 };
  }, [selected, catalogue]);

  // Nothing selected: an inventory of the whole plan, both warehouses, to
  // match the status bar's cost figure.
  if (selected.length === 0) {
    // The buildings only, not the workshop bench, unless the bench is on screen.
    const onBench = plan.warehouse === 'workshop';
    const scope = plan.placements.filter((p) => (p.warehouse === 'workshop') === onBench);
    const inventory = countByObject(scope, catalogue, locale);
    return (
      <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-l border-[var(--line)] p-3 text-sm md:flex">
        <SimStatsPanel locale={locale} />
      {LIVE_PREVIEW && <SimSettingsPanel locale={locale} />}
        {scope.length === 0 ? (
          <span className="text-[var(--text-faint)]">{t(locale, 'inspector.empty')}</span>
        ) : (
          <>
            <h2 className="mb-2 font-semibold">{t(locale, 'inspector.onThePlan')}</h2>
            <ul className="mb-3 space-y-0.5 text-[var(--text-faint)]">
              {[...inventory].map(typeRow)}
            </ul>
            {/* Zones are listed but not counted: nothing was bought or built. */}
            <div className="border-t border-[var(--line)] pt-2 font-mono text-[var(--text-faint)]">
              {scope.filter((p) => !isZone(p.objectId)).length} {t(locale, 'inspector.objectsTotal')}
            </div>
          </>
        )}
      </aside>
    );
  }

  // One object: the detail card. Several: the list, since no single rotation
  // or tier describes a group.
  const only = selected.length === 1 ? selected[0] : undefined;
  const onlyEntry = only ? catalogue.get(only.objectId) : undefined;
  const onlyZones = selected.every((p) => isZone(p.objectId));

  /** Commits a zone's name on blur, so a name is one undo step, like the note
   * box. A cleared name is removed rather than stored empty. */
  const nameZone = (typed: string) => {
    const name = typed.trim();
    if (name === (only?.label ?? '')) return;
    editSelection(({ label: _drop, ...rest }) => (name === '' ? rest : { ...rest, label: name }));
  };

  return (
    <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-l border-[var(--line)] p-3 text-sm md:flex">
      <SimStatsPanel locale={locale} />
      {LIVE_PREVIEW && <SimSettingsPanel locale={locale} />}
      {only && onlyEntry?.category === 'zone' ? (
        <>
          <h2 className="mb-2 font-semibold">{only.label ?? onlyEntry.displayName[locale]}</h2>
          <label htmlFor="inspector-zone-name" className="mb-1 block text-[var(--text-faint)]">
            {t(locale, 'inspector.zoneName')}
          </label>
          {/* Uncontrolled, and keyed on the name, so an undo that changes the
              name underneath it shows up here rather than being typed over. */}
          <input
            key={`${only.id}:${only.label ?? ''}`}
            id="inspector-zone-name"
            defaultValue={only.label ?? ''}
            placeholder={t(locale, 'inspector.zoneNamePlaceholder')}
            maxLength={60}
            onBlur={(event) => nameZone(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                event.currentTarget.value = only.label ?? '';
                event.currentTarget.blur();
              }
            }}
            className="mb-3 w-full rounded border border-[var(--line-field)] bg-[var(--panel)] px-1.5 py-0.5"
          />
          <dl className="mb-3 space-y-1 text-[var(--text-faint)]">
            <div><dt className="inline">{t(locale, 'tooltip.footprint')}:</dt> <dd className="inline">{sizeOf(onlyEntry, only)}</dd></div>
            <div>
              <dt className="inline">{t(locale, 'inspector.cell')}:</dt>{' '}
              <dd className="inline">
                {displayColumn(only.cell.x)},{' '}
                {displayRow(only.cell.y, warehouseDimensions(only.warehouse, WAREHOUSES))}
              </dd>
            </div>
            <div><dt className="inline">{t(locale, 'warehouse.floor')}:</dt> <dd className="inline">{only.floor}</dd></div>
          </dl>
        </>
      ) : only && onlyEntry ? (
        <>
          <h2 className="mb-2 font-semibold">{onlyEntry.displayName[locale]}</h2>
          <dl className="mb-3 space-y-1 text-[var(--text-faint)]">
            <div><dt className="inline">{t(locale, 'inspector.rotation')}:</dt> <dd className="inline">{only.rotation}°</dd></div>
            {/* Counted up from the bottom-left, like the rulers and the hover
                card (see displayRow). */}
            <div>
              <dt className="inline">{t(locale, 'inspector.cell')}:</dt>{' '}
              <dd className="inline">
                {displayColumn(only.cell.x)},{' '}
                {displayRow(only.cell.y, warehouseDimensions(only.warehouse, WAREHOUSES))}
              </dd>
            </div>
            {/* A second value of the rotation term, so it keeps its own line. */}
            {only.mirrored && (
              <div>
                <dt className="sr-only">{t(locale, 'inspector.rotation')}</dt>
                <dd>{t(locale, 'inspector.mirrored')}</dd>
              </div>
            )}
            <div><dt className="inline">{t(locale, 'warehouse.floor')}:</dt> <dd className="inline">{only.floor}</dd></div>
          </dl>
          {PAUSERS.has(only.objectId) && <PauserToggle id={only.id} objectId={only.objectId} locale={locale} />}
        </>
      ) : (
        <>
          <h2 className="mb-2 font-semibold">
            {selected.length} {t(locale, 'inspector.selectedCount')}
          </h2>
          <ul className="mb-3 space-y-0.5 text-[var(--text-faint)]">
            {[...countByObject(selected, catalogue, locale)].map(typeRow)}
          </ul>
        </>
      )}

      {/* The tier, for the whole selection, each object clamped to its own
          ceiling. Hidden when nothing selected has a second tier. */}
      {tierCeiling > 1 && (
        <div className="mb-3 flex items-center gap-2">
          <label htmlFor="inspector-tier" className="text-[var(--text-faint)]">
            {t(locale, 'inspector.tier')}
          </label>
          <select translate="no"
            id="inspector-tier"
            value={commonTier ?? ''}
            onChange={(event) => {
              const wanted = Number(event.target.value);
              editSelection((p) => {
                const ceiling = catalogue.get(p.objectId)?.maxTier ?? 1;
                return { ...p, tier: Math.min(wanted, ceiling) };
              });
            }}
            className="rounded bg-[var(--panel)] px-1.5 py-0.5"
          >
            {/* Only shown while the selection disagrees, and unselectable:
                it reports a state rather than offering one. */}
            {commonTier === null && <option value="" disabled></option>}
            {Array.from({ length: tierCeiling }, (_, i) => i + 1).map((tier) => (
              <option key={tier} value={tier}>{tier}</option>
            ))}
          </select>
        </div>
      )}

      {/* The colours, here as well as in the right-click menu, which is hard
          to discover. Only when something selected can be painted (not
          scanners). */}
      {selected.some((p) => {
        const entry = catalogue.get(p.objectId);
        return entry !== undefined && repaintableColourOf(entry) !== null;
      }) && (
        <div className="mb-3">
          <div className="mb-1 text-[var(--text-faint)]">{t(locale, 'menu.colour')}</div>
          <div className="flex flex-wrap gap-1">
            {OBJECT_COLOURS.map((colour) => (
              <button
                key={colour}
                aria-label={t(locale, COLOUR_NAMES[colour]!)}
                title={t(locale, COLOUR_NAMES[colour]!)}
                onClick={() => editSelection((p) => ({ ...p, colour }))}
                style={{ backgroundColor: colour }}
                className="h-5 w-5 rounded border border-[var(--line-strong)] hover:border-[var(--text-strong)]"
              />
            ))}
            <button
              aria-label={t(locale, 'menu.colourNone')}
              title={t(locale, 'menu.colourNone')}
              onClick={() => editSelection(({ colour: _drop, ...rest }) => rest)}
              className="flex h-5 w-5 items-center justify-center rounded border border-[var(--line-strong)] text-[var(--text-faint)] hover:border-[var(--text-strong)]"
            >
              {/* Same glyph as in the context menu, for the same action. */}
              <Ban size={12} aria-hidden />
            </button>
          </div>
        </div>
      )}

      {/* No price for zones alone: "$0" would read as a missing price. */}
      {!onlyZones && (
      <div className="mb-3 border-t border-[var(--line)] pt-2 font-mono">
        {t(locale, 'inspector.selectionCost')}: ${formatMoney(total, locale)}
        {/* Only when it differs, as in the status bar. */}
        {atMaxTier !== total && (
          <div className="text-xs text-[var(--text-dim)]">
            ${formatMoney(atMaxTier, locale)} {t(locale, 'cost.atMaxTier')}
          </div>
        )}
        {unpriced && (
          <div className="font-sans text-xs text-[var(--warning)]">{t(locale, 'cost.unpriced')}</div>
        )}
      </div>
      )}

      <button
        onClick={() => { deleteSelection(); select([]); }}
        className="self-start rounded border border-transparent bg-[var(--tint-danger)] px-2 py-1 text-[var(--danger)] hover:border-[var(--danger)] active:translate-y-px"
      >
        {t(locale, 'inspector.delete')}
      </button>
    </aside>
  );
}

/**
 * How many of each object, biggest group first. Keyed by object id, not
 * display name: rows select by type, and names are translated and may collide.
 */
function countByObject(
  selected: readonly { objectId: string }[],
  catalogue: ReturnType<typeof getCatalogue>,
  locale: 'en' | 'fr',
): Map<string, { name: string; count: number }> {
  const counts = new Map<string, { name: string; count: number }>();
  for (const placement of selected) {
    const name = catalogue.get(placement.objectId)?.displayName[locale] ?? placement.objectId;
    // Every zone is one row whatever its size: all are "Reserved area".
    const key = isZone(placement.objectId) ? ZONE_PREFIX : placement.objectId;
    const seen = counts.get(key);
    counts.set(key, { name, count: (seen?.count ?? 0) + 1 });
  }
  return new Map([...counts].sort((a, b) => b[1].count - a[1].count));
}
