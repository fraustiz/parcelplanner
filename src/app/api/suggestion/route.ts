import { handleSuggestion } from '@/server/suggestion-api';
import { suggestionBook, suggestionLimiter, SUGGESTION_WEBHOOK } from '@/server/links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return handleSuggestion(request, {
    book: suggestionBook,
    limiter: suggestionLimiter,
    webhook: SUGGESTION_WEBHOOK,
  });
}
