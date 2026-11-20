'use client';

import { useMemo } from 'react';
import { costOfMissingTiers, MANDATORY_TIERS, ownedTiersOf, WAREHOUSE_TIERS } from '@/data/warehouse-tiers';
import { formatMoney, t } from '@/i18n';
import { useEditor } from '@/store/editor';

/**
 * Which warehouse expansion tiers the player owns, and what the rest would
 * cost. Scoped to the warehouse being edited, since each building's tiers are
 * bought independently.
 *
 * Unticking a tier greys out the cells it unlocks (extents: see
 * src/data/warehouse-tiers.ts). Everything starts ticked, since the app cannot
 * know what has been bought.
 */
export default function Expansions() {
  const plan = useEditor((s) => s.plan);
  const locale = useEditor((s) => s.locale);
  const toggleOwnedTier = useEditor((s) => s.toggleOwnedTier);

  // Absent means all owned (see Plan.ownedTiers).
  const owned = useMemo(() => ownedTiersOf(plan), [plan]);
  // MANDATORY_TIERS are left out, price included: tier 15 buys the Regional
  // Sorting Centre itself, so it is not a choice.
  const tiers = useMemo(
    () => WAREHOUSE_TIERS.filter(
      (tier) => tier.warehouse === plan.warehouse && !MANDATORY_TIERS.has(tier.tier),
    ),
    [plan.warehouse],
  );
  const stillToBuy = costOfMissingTiers(tiers, owned);

  // The workshop is not in the game: there is nothing in it to buy.
  if (tiers.length === 0) return null;

  return (
    <details className="mb-4 border-b border-[var(--line)] pb-3">
      <summary className="cursor-pointer text-xs uppercase tracking-wide text-[var(--text-faint)]">
        {t(locale, 'tiers.title')}
      </summary>

      <ul className="mt-2 space-y-0.5 text-sm">
        {tiers.map((tier) => (
          <li key={tier.tier}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-[var(--panel)]">
              <input
                type="checkbox"
                checked={owned.has(tier.tier)}
                onChange={() => toggleOwnedTier(tier.tier)}
              />
              <span className={owned.has(tier.tier) ? 'text-[var(--text-faint)] line-through' : ''}>
                {t(locale, 'tiers.tier')} {tier.tier}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[var(--text-faint)]">
                ${formatMoney(tier.price, locale)}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex justify-between font-mono text-sm">
        <span className="text-[var(--text-faint)]">
          {stillToBuy === 0 ? t(locale, 'tiers.allOwned') : t(locale, 'tiers.stillToBuy')}
        </span>
        {stillToBuy > 0 && <span>${formatMoney(stillToBuy, locale)}</span>}
      </div>

      <p className="mt-2 text-xs text-[var(--text-faint)]">{t(locale, 'tiers.gridMask')}</p>
    </details>
  );
}
