import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { headers } from 'next/headers';
import { ImageResponse } from 'next/og';
import { isShortLinkId } from '@/core/short-link';
import { callerOf } from '@/server/caller';
import { cardLimiter } from '@/server/links';
import { planCardSvg } from '@/server/plan-card';
import { planForShortLink } from '@/server/plan-summary';

/**
 * The preview image for a shared plan: the actual layout, drawn by `drawScene`
 * through the SVG `Draw2D` (src/render/svg-draw.ts) and rasterised by
 * `next/og`, so no headless browser is needed.
 *
 * A malformed, unknown, empty or undecodable id falls back to the generic
 * card; the page itself still works, so the preview must not show an error.
 */

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'A Parcel Simulator warehouse layout';

/** The generic card, for links whose plan cannot be drawn. */
async function fallback(): Promise<Response> {
  const bytes = await readFile(join(process.cwd(), 'public', 'og-card.png'));
  return new Response(new Uint8Array(bytes), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': CACHE },
  });
}

/** Ids are content-addressed (src/core/short-link.ts), so a card never goes stale. */
const CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

export default async function Image(
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  // Drawing a card is the costliest thing a stranger can ask for, so it is limited. Over the
  // limit the generic card answers, never a 429: a link unfurler would then show nothing.
  if (!cardLimiter.allow(callerOf(await headers()))) return fallback();

  const plan = isShortLinkId(id) ? await planForShortLink(id) : null;
  if (!plan || plan.placements.length === 0) return fallback();

  let svg: string;
  try {
    svg = planCardSvg(plan, size.width, size.height);
  } catch {
    // Decodes but cannot be drawn, e.g. an object from a later game version.
    return fallback();
  }

  // One full-bleed image for Satori to lay out.
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- this is
            rasterised by Satori, not rendered in a browser. */}
        <img
          src={`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`}
          width={size.width}
          height={size.height}
          alt={alt}
        />
      </div>
    ),
    { ...size, headers: { 'Cache-Control': CACHE } },
  );
}
