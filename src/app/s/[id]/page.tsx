import type { Metadata } from 'next';
import Editor from '@/components/Editor';
import { isShortLinkId } from '@/core/short-link';
import { planForShortLink, summarise } from '@/server/plan-summary';
import { t } from '@/i18n';

// Reads the store, so there is nothing to prerender.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A shared plan at its own address. `#s=<id>` still works, but a fragment
 * never reaches the server, so only a path lets it describe the plan in the
 * link preview. The page renders the same editor as `/`; the client loads the
 * plan from the path (see parseSharedLocation).
 */
function money(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;

  // A malformed, unknown or undecodable id gets the generic card: the page
  // still works, so the preview must not show an error.
  const plan = isShortLinkId(id) ? await planForShortLink(id) : null;
  if (!plan || plan.placements.length === 0) return {};

  const { objects, cost, warehouses, busiest } = summarise(plan);
  const named = t('en', busiest === 'second' ? 'warehouse.second' : 'warehouse.main').toLowerCase();
  const both = warehouses.length === 2 ? ', across both warehouses' : '';

  const title = `A shared Parcel Simulator layout, ${named}`;
  const description = `${objects} objects, ${money(cost)}${both}. Open it in ParcelPlanner and build on it.`;

  return {
    title,
    description,
    openGraph: { title, description, url: `/s/${id}` },
    twitter: { title, description },
  };
}

export default function SharedPlanPage() {
  return <Editor />;
}
