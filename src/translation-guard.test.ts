// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { guardAgainstTranslation } from './translation-guard';

beforeAll(() => guardAgainstTranslation());

describe('guardAgainstTranslation', () => {
  it('ignores removing a node a translator already moved', () => {
    const parent = document.createElement('div');
    const text = document.createTextNode('Hello');
    parent.appendChild(text);
    // What a translator does: the original text node goes elsewhere.
    document.createElement('font').appendChild(text);
    expect(() => parent.removeChild(text)).not.toThrow();
  });

  it('ignores inserting before a node a translator already moved', () => {
    const parent = document.createElement('div');
    const reference = document.createTextNode('Hello');
    parent.appendChild(reference);
    document.createElement('font').appendChild(reference);
    expect(() => parent.insertBefore(document.createElement('span'), reference)).not.toThrow();
  });

  it('still removes and inserts normally', () => {
    const parent = document.createElement('div');
    const a = parent.appendChild(document.createElement('a'));
    const b = document.createElement('b');
    parent.insertBefore(b, a);
    expect([...parent.childNodes]).toEqual([b, a]);
    parent.removeChild(b);
    expect([...parent.childNodes]).toEqual([a]);
    parent.insertBefore(b, null);
    expect([...parent.childNodes]).toEqual([a, b]);
  });

  it('installs only once', () => {
    const patched = Node.prototype.removeChild;
    guardAgainstTranslation();
    expect(Node.prototype.removeChild).toBe(patched);
  });
});
