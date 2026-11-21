import { describe, it, expect } from 'vitest';
import { readTextCapped } from './body';

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/link', { method: 'POST', body, headers, duplex: 'half' } as RequestInit);

/** A chunked body: a stream declares no content-length, which is the case the old check missed. */
function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

describe('reading a request body under a limit', () => {
  it('gives back a body under the limit', async () => {
    expect(await readTextCapped(post('hello'), 10)).toBe('hello');
  });

  it('gives back a body exactly at the limit', async () => {
    expect(await readTextCapped(post('a'.repeat(10)), 10)).toBe('a'.repeat(10));
  });

  it('gives back an empty string for a request with no body', async () => {
    expect(await readTextCapped(new Request('http://localhost/'), 10)).toBe('');
  });

  it('refuses a body that declares a length over the limit', async () => {
    expect(await readTextCapped(post('a', { 'content-length': '11' }), 10)).toBeNull();
  });

  it('refuses a chunked body that runs past the limit without declaring a length', async () => {
    const bytes = new TextEncoder().encode('a'.repeat(11));
    const request = post(streamOf([bytes.slice(0, 6), bytes.slice(6)]));
    expect(request.headers.get('content-length')).toBeNull();
    expect(await readTextCapped(request, 10)).toBeNull();
  });

  it('stops reading an endless body soon after the limit', async () => {
    // A body that never ends would exhaust memory if it were buffered whole.
    let pulls = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(1024));
      },
    });
    expect(await readTextCapped(post(endless), 8 * 1024)).toBeNull();
    expect(pulls).toBeLessThan(20);
  });

  it('keeps a character whole when its bytes are split across chunks', async () => {
    const bytes = new TextEncoder().encode('café'); // é is two bytes
    const request = post(streamOf([bytes.slice(0, 4), bytes.slice(4)]));
    expect(await readTextCapped(request, 10)).toBe('café');
  });
});
