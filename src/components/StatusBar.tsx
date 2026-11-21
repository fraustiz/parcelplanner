'use client';

import { useMemo, useRef } from 'react';
import { computeCost } from '@/core/cost';
import { deadEnds } from '@/core/dead-ends';
import { buildGraph } from '@/core/graph';
import { validate } from '@/core/validate';
import { getCatalogue } from '@/data/catalogue';
import { DOORS } from '@/data/doors';
import { storageCapacityOf } from '@/data/storage';
import { ownedGeometry, ownedTiersOf } from '@/data/warehouse-tiers';
import { formatMoney, t, type TranslationKey } from '@/i18n';
import { useEditor } from '@/store/editor';

/** The game this plans for. App id 2424010, checked against the store page:
 * several games have near-identical names. */
const GAME_STORE_URL = 'https://store.steampowered.com/app/2424010/Parcel_Simulator/';

/** Where a donation goes. A plain URL, no widget or embed, so the site sets no cookies. */
const KOFI_URL = 'https://ko-fi.com/fraustiz';

export default function StatusBar() {
  // Narrow selectors: this component must not re-render (and re-run
  // validate/computeCost below) on every unrelated store change, e.g. a
  // moveDrag dispatched on every pointer move while placing an object.
  const plan = useEditor((s) => s.plan);
  const locale = useEditor((s) => s.locale);
  const budget = useEditor((s) => s.budget);
  const empty = plan.placements.length === 0;
  const catalogue = getCatalogue();

  // Validated against unlocked tiers, so an object on an unticked expansion is
  // out of bounds.
  const issues = useMemo(
    () => validate(plan, catalogue, ownedGeometry(ownedTiersOf(plan))),
    [plan, catalogue],
  );
  // Exits a parcel would fall from: a warning, not an issue, since the layout
  // may be unfinished. Never on the workshop bench (see GridCanvas).
  const looseExitList = useMemo(
    () => (plan.warehouse === 'workshop' ? [] : deadEnds(buildGraph(plan, catalogue, DOORS))),
    [plan, catalogue],
  );
  const looseExits = looseExitList.length;
  // Each press shows the next one, so every exit can be found in turn, on
  // whichever floor it is.
  const nextLoose = useRef(0);
  const select = useEditor((s) => s.select);
  const showCell = useEditor((s) => s.showCell);
  const showNextLoose = () => {
    if (looseExitList.length === 0) return;
    const exit = looseExitList[nextLoose.current % looseExitList.length]!;
    nextLoose.current += 1;
    select([exit.placementId]);
    showCell(exit.floor, exit.cell);
  };
  // computeCost prices both warehouses (see src/core/cost.ts); that figure is
  // only shown as a labelled grand total. The headline covers this warehouse.
  const costThisWarehouse = useMemo(
    () => computeCost(
      { ...plan, placements: plan.placements.filter((p) => p.warehouse === plan.warehouse) },
      catalogue,
    ),
    [plan, catalogue],
  );

  // The grand total leaves out the workshop, whose modules are not bought. In
  // the workshop, the headline prices the bench alone and says so.
  const built = useMemo(
    () => plan.placements.filter((p) => p.warehouse !== 'workshop'),
    [plan.placements],
  );
  const cost = useMemo(
    () => computeCost({ ...plan, placements: built }, catalogue),
    [plan, built, catalogue],
  );

  const otherWarehouseHasPlacements = built.some((p) => p.warehouse !== plan.warehouse);
  const over = budget !== null && cost.total > budget;

  // What this building can hold, in parcels, across both its floors. A
  // figure, never a warning: the app cannot know how much a schedule needs
  // (see the note atop src/core/validate.ts).
  const storage = useMemo(
    () => plan.placements
      .filter((p) => p.warehouse === plan.warehouse)
      .reduce((sum, p) => sum + storageCapacityOf(p.objectId), 0),
    [plan],
  );

  const counts = new Map<string, number>();
  for (const issue of issues) counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);

  // No "layout is valid" verdict: that depends on parcel sorting, which the
  // app does not simulate. Only visible placement problems are reported.
  return (
    // Wraps on a phone instead of pushing figures off the screen.
    <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--line)] px-3 py-2 text-xs md:flex-nowrap md:px-4">
      {/* The app serves data extracted from the game, so it says it is not
          official. Truncated on desktop; on a phone it wraps on its own line. */}
      <span className="min-w-0 basis-full text-[var(--text-dim)] md:basis-auto md:truncate">
        {t(locale, 'app.disclaimer')}
        <a
          href={GAME_STORE_URL}
          target="_blank"
          // noreferrer as well as noopener, so the opened page cannot read the referrer.
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center underline decoration-dotted underline-offset-2 hover:text-[var(--text-strong)] md:inline md:min-h-0"
        >
          Parcel Simulator
        </a>
        {' · '}
        {/* A link, never the Ko-fi widget, whose scripts and cookies would
            need a consent banner. After the disclaimer, so "not affiliated"
            is read before any mention of money. */}
        <a
          href={KOFI_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center underline decoration-dotted underline-offset-2 hover:text-[var(--text-strong)] md:inline md:min-h-0"
        >
          {t(locale, 'app.donate')}
        </a>
      </span>

      {issues.length > 0 && (
        <span className="text-[var(--danger)]">
          {issues.length} {t(locale, 'status.issues')}
        </span>
      )}

      {looseExits > 0 && (
        <button
          type="button"
          onClick={showNextLoose}
          title={t(locale, 'status.deadEndsHint')}
          className="inline-flex min-h-11 items-center rounded px-1 text-[var(--warning)] underline decoration-dotted underline-offset-2 hover:bg-[var(--raised)] md:min-h-0"
        >
          {t(locale, 'status.deadEnds')}: {looseExits}
        </button>
      )}

      {/* The total stays on a phone; the breakdown needs the width. */}
      {[...counts.entries()].map(([code, n]) => (
        <span key={code} className="hidden text-[var(--text-faint)] md:inline">
          {n}× {t(locale, `issue.${code}` as TranslationKey)}
        </span>
      ))}

      {/* The cost at each object's chosen tier, then the floor and ceiling it
          can range between, shown only where they differ from the headline.
          Hidden on a phone for an empty plan, where the empty state covers it. */}
      <span className={`ml-auto font-mono ${over ? 'text-[var(--danger)]' : 'text-[var(--text-faint)]'} ${empty ? 'hidden md:inline' : ''}`}>
        {t(locale, plan.warehouse === 'workshop' ? 'cost.workshop' : 'cost.thisWarehouse')}: ${formatMoney(costThisWarehouse.total, locale)}
      </span>

      {costThisWarehouse.atTierOne !== costThisWarehouse.total && (
        <span className="hidden font-mono text-[var(--text-dim)] md:inline">
          ${formatMoney(costThisWarehouse.atTierOne, locale)} {t(locale, 'cost.atTierOne')}
        </span>
      )}

      {costThisWarehouse.atMaxTier !== costThisWarehouse.total && (
        <span className="hidden font-mono text-[var(--text-dim)] md:inline">
          ${formatMoney(costThisWarehouse.atMaxTier, locale)} {t(locale, 'cost.atMaxTier')}
        </span>
      )}

      {/* Only when the other warehouse holds something; otherwise it equals the headline. */}
      {otherWarehouseHasPlacements && (
        <span className="hidden font-mono text-[var(--text-dim)] md:inline">
          {t(locale, 'cost.bothWarehouses')}: ${formatMoney(cost.total, locale)}
        </span>
      )}

      {/* Hidden when there is no storage. */}
      {storage > 0 && (
        <span className="font-mono text-[var(--text-dim)]">
          {t(locale, 'storage.capacity')}: {storage}
        </span>
      )}

      {cost.unpricedObjectIds.length > 0 && (
        <span className="text-[var(--warning)]">{t(locale, 'cost.unpriced')}</span>
      )}
    </footer>
  );
}
