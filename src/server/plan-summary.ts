import { computeCost } from '@/core/cost';
import { decodePlan } from '@/core/serialize';
import type { Plan } from '@/core/types';
import { isZone } from '@/core/zone';
import { getCatalogue } from '@/data/catalogue';
import { linkStore } from './links';

/**
 * A one-sentence summary of a shared plan, for the `/s/<id>` link preview.
 * A path, unlike a `#s=` fragment, reaches the server, so the preview can describe the plan.
 */
export interface PlanSummary {
  /** Object count across the whole plan. Reserved zones are not counted, but still mark a building as used. */
  objects: number;
  /** What the objects cost, at the tiers they are placed at. */
  cost: number;
  /** Which buildings the plan uses, so the card can name the right one. */
  warehouses: ('main' | 'second')[];
  /** The busiest building, which is the one worth naming first. */
  busiest: 'main' | 'second';
}

/** Reads the stored plan for `id`, or null when there is none. */
export async function planForShortLink(id: string): Promise<Plan | null> {
  const payload = await linkStore.get(id);
  if (payload === null) return null;
  try {
    return await decodePlan(payload);
  } catch {
    // A retired format or damaged file: the page falls back to the generic card.
    return null;
  }
}

export function summarise(plan: Plan): PlanSummary {
  // The workshop is a layout bench, not a building, so it is left out.
  const built = plan.placements.filter(
    (p): p is typeof p & { warehouse: 'main' | 'second' } => p.warehouse !== 'workshop',
  );
  const counts = { main: 0, second: 0 };
  for (const placement of built) counts[placement.warehouse]++;

  const warehouses = (['main', 'second'] as const).filter((w) => counts[w] > 0);
  return {
    objects: built.filter((p) => !isZone(p.objectId)).length,
    cost: computeCost({ ...plan, placements: built }, getCatalogue()).total,
    warehouses: [...warehouses],
    // Ties go to the main warehouse, which is where most plans live.
    busiest: counts.second > counts.main ? 'second' : 'main',
  };
}
