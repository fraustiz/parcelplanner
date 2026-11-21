/** The body as text, or null once it passes `maxBytes`, without buffering the rest. */
export async function readTextCapped(request: Request, maxBytes: number): Promise<string | null> {
  // An honest oversized body is refused before a byte is read.
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;

  // A chunked body declares no length, so the limit is enforced while reading: Request.text
  // would buffer all of it first, however large.
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let total = 0;
  let text = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    // stream: true keeps a character split across two chunks whole.
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
