import { handleShare } from '@/server/link-api';
import { linkLimiter, linkStore } from '@/server/links';

// Node, not edge: the store is the filesystem. Dynamic, because a route that
// writes to disk has nothing to prerender.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return handleShare(request, { store: linkStore, limiter: linkLimiter });
}
