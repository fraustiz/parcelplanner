import { handleSuggestionDone } from '@/server/suggestion-api';
import { suggestionBook, adminLimiter, SUGGESTION_ADMIN_KEY } from '@/server/links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return handleSuggestionDone(request, {
    book: suggestionBook,
    adminKey: SUGGESTION_ADMIN_KEY,
    limiter: adminLimiter,
  });
}
