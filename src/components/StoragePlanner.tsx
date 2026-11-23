'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, X } from 'lucide-react';
import { buildGraph, doorNodeId } from '@/core/graph';
import { feedingDoors } from '@/core/simulate';
import { storageNeeded } from '@/core/storage-need';
import type { WarehouseId } from '@/core/types';
import { getCatalogue } from '@/data/catalogue';
import {
  CARGO_TYPES, cargoShare, dailyIntakePerDoor, DOOR_TIMER_SECONDS, PARCELS_PER_TRUCK, VALID_SHARE,
} from '@/data/deliveries';
import { COUNTRIES, countryName } from '@/data/countries';
import { DOORS } from '@/data/doors';
import { doorsOf } from '@/core/door-cargo';
import { warehouseTierOf } from '@/data/warehouse-tiers';
import { t, type TranslationKey } from '@/i18n';
import { useEditor } from '@/store/editor';
import { useSimStats } from '@/store/sim-stats';
import { useDialog } from './use-dialog';

/**
 * What a warehouse sorts by: the main one's export doors are all cargo types;
 * the second has twelve country doors and two cargo ones.
 *
 * The cargo split is the game's own weighting at `warehouseTier`. None exists
 * per country, so `undefined` share means an even split, and the note says so.
 */
function sortedBy(warehouse: WarehouseId, warehouseTier: number): {
  kinds: readonly string[];
  share?: ReadonlyMap<string, number>;
  assumption: TranslationKey;
} {
  return warehouse === 'second'
    ? { kinds: COUNTRIES, assumption: 'planner.assumptionCountries' }
    : {
      kinds: CARGO_TYPES,
      share: cargoShare(warehouseTier),
      assumption: 'planner.assumption',
    };
}
const WEEK = 7;


/**
 * How many racks a delivery schedule demands. The player gives the schedule;
 * the rest comes from the game: a door brings 33 parcels a day at the bottom
 * and 182 fully upgraded, and a rack holds 8, 12 or 16.
 *
 * Not saved with the plan, so it never travels in share links.
 */
export default function StoragePlanner() {
  const locale = useEditor((s) => s.locale);
  const plan = useEditor((s) => s.plan);
  // Countries are keyed by the game's ids and only shown under the mod's names.
  const realCountries = useEditor((s) => s.realCountries);
  const shown = (kind: string) => countryName(kind, realCountries);
  const warehouse = plan.warehouse;
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useDialog(panel, open, { onClose: () => setOpen(false) });
  const warehouseTier = warehouseTierOf(plan);
  const axis = useMemo(() => sortedBy(warehouse, warehouseTier), [warehouse, warehouseTier]);
  const [sizeLevel, setSizeLevel] = useState(0);
  const [speedLevel, setSpeedLevel] = useState(0);
  // A game save just imported says how upgraded the doors are.
  const savedDelivery = useSimStats((s) => s.savedDelivery);
  useEffect(() => {
    if (savedDelivery === null) return;
    setSizeLevel(savedDelivery.sizeLevel);
    setSpeedLevel(savedDelivery.speedLevel);
  }, [savedDelivery]);
  // Everything starts accepted every day, so the player marks what is closed.
  // Keyed by what the warehouse sorts by and rebuilt when that changes: a
  // missing entry means "never accepted". Existing ticks survive the switch.
  const [accepted, setAccepted] = useState<Map<string, Set<number>>>(new Map());
  useEffect(() => {
    setAccepted((was) => new Map(axis.kinds.map((kind) => [
      kind,
      was.get(kind) ?? new Set(Array.from({ length: WEEK }, (_, i) => i)),
    ])));
  }, [axis]);

  // Day names come from Intl rather than translation keys.
  const days = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    // 2024-01-01 was a Monday, so index 0 reads as the start of the week.
    return Array.from({ length: WEEK }, (_, i) => format.format(new Date(2024, 0, 1 + i)));
  }, [locale]);

  const allDoors = useMemo(
    () => DOORS.filter((d) => d.warehouse === warehouse && d.kind === 'delivery').length,
    [warehouse],
  );

  /**
   * The doors this plan actually feeds from, not every door the building has.
   * Falls back to all doors while nothing is connected, so the result is the
   * building's capacity rather than zero.
   */
  const connected = useMemo(() => {
    const ids = new Set(
      DOORS.filter((d) => d.warehouse === warehouse && d.kind === 'delivery')
        .map((d) => doorNodeId(d)),
    );
    const graph = buildGraph(plan, getCatalogue(), doorsOf(DOORS, plan));
    return feedingDoors(graph.edges, ids).size;
  }, [plan, warehouse]);

  const doors = connected > 0 ? connected : allDoors;
  const intake = doors * dailyIntakePerDoor(sizeLevel, speedLevel);

  const need = useMemo(
    () => storageNeeded({
      dailyIntake: intake,
      cargoTypes: axis.kinds,
      // Both read from the game (see src/data/deliveries.ts).
      ...(axis.share ? { share: axis.share } : {}),
      validShare: VALID_SHARE,
      accepted,
      weekLength: WEEK,
    }),
    [intake, accepted],
  );

  const toggle = (type: string, day: number) =>
    setAccepted((was) => {
      const next = new Map(was);
      const days = new Set(next.get(type) ?? []);
      if (days.has(day)) days.delete(day);
      else days.add(day);
      next.set(type, days);
      return next;
    });

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t(locale, 'planner.open')}
        title={t(locale, 'planner.open')}
        className="rounded bg-[var(--panel)] px-2 py-1.5 leading-none hover:bg-[var(--raised)] active:translate-y-px active:bg-[var(--raised-hover)]"
      >
        <Boxes size={16} aria-hidden />
      </button>

      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label={t(locale, 'planner.title')}
          className="fixed right-4 top-14 z-50 max-h-[80vh] w-[26rem] overflow-y-auto rounded border border-[var(--line-strong)] bg-[var(--panel)] p-3 text-sm shadow-lg"
        >
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-semibold">{t(locale, 'planner.title')}</h2>
            <button
              onClick={() => setOpen(false)}
              aria-label={t(locale, 'controls.close')}
              className="rounded px-1.5 text-[var(--text-faint)] hover:bg-[var(--tint-accent)] active:bg-[var(--raised)]"
            >
              <X size={16} aria-hidden />
            </button>
          </div>

          {/* The note gives the cargo weighting and where it comes from. */}
          <p className="mb-3 text-xs leading-relaxed text-[var(--text-faint)]">
            {t(locale, axis.assumption)
              .replace('{tier}', String(warehouseTier))
              .replace('{shares}', [...(axis.share ?? [])]
                .filter(([, share]) => share > 0)
                .map(([type, share]) => `${t(locale, `export.cargo.${type}` as TranslationKey)} ${Math.round(share * 100)}${locale === 'fr' ? ' %' : '%'}`)
                .join(', '))}
          </p>

          <div className="mb-3 flex flex-wrap gap-3 text-xs">
            <label className="flex items-center gap-1">
              {t(locale, 'planner.size')}
              <select translate="no"
                value={sizeLevel}
                onChange={(e) => setSizeLevel(Number(e.target.value))}
                className="rounded bg-[var(--sunken)] px-1 py-0.5"
              >
                {PARCELS_PER_TRUCK.map((n, i) => (
                  <option key={i} value={i}>{n}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              {t(locale, 'planner.speed')}
              <select translate="no"
                value={speedLevel}
                onChange={(e) => setSpeedLevel(Number(e.target.value))}
                className="rounded bg-[var(--sunken)] px-1 py-0.5"
              >
                {DOOR_TIMER_SECONDS.map((_, n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <span className="text-[var(--text-dim)]">
              {doors} × {dailyIntakePerDoor(sizeLevel, speedLevel)} = {intake} {t(locale, 'planner.perDay')}
              {connected > 0 && connected < allDoors && (
                <span className="ml-2 text-[var(--text-faint)]">
                  ({connected}/{allDoors} {t(locale, 'planner.doorsWired')})
                </span>
              )}
            </span>
          </div>

          {/* Which days each type is accepted. Ticked is open. */}
          <table className="mb-3 w-full text-xs">
            <thead>
              <tr className="text-[var(--text-faint)]">
                <th className="text-left font-normal">{t(locale, 'planner.accepted')}</th>
                {days.map((d) => <th key={d} className="font-normal">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {axis.kinds.map((type) => (
                <tr key={type}>
                  <td className="py-0.5">{shown(type)}</td>
                  {days.map((label, day) => (
                    <td key={label} className="text-center">
                      <input
                        type="checkbox"
                        aria-label={`${shown(type)} ${label}`}
                        checked={accepted.get(type)?.has(day) ?? false}
                        onChange={() => toggle(type, day)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--text-faint)]">
                <th className="text-left font-normal">{t(locale, 'planner.cargo')}</th>
                <th className="text-right font-normal">{t(locale, 'planner.closed')}</th>
                <th className="text-right font-normal">{t(locale, 'planner.pile')}</th>
                <th className="text-right font-normal">{t(locale, 'planner.racks')}</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {axis.kinds.map((type) => {
                const row = need.get(type);
                if (!row) return null;
                return (
                  <tr key={type}>
                    <td className="font-sans">{shown(type)}</td>
                    <td className="text-right">{row.closedRun}</td>
                    <td className="text-right">{Math.ceil(row.parcels)}</td>
                    {/* The large rack: all three share a 1x3 footprint, so it
                        holds the most per cell. */}
                    <td className="text-right">
                      {row.racks.large > 0 ? `${row.racks.large} ×` : '0'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
