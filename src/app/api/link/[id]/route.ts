import { handleFetch } from '@/server/link-api';
import { linkStore, linkReadLimiter } from '@/server/links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleFetch((await params).id, {
    store: linkStore,
    limiter: linkReadLimiter,
    request,
  });
}
