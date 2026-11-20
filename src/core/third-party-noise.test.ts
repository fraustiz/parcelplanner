import { describe, it, expect } from 'vitest';
import { fromBrowserExtension, fromClientDisconnect } from './third-party-noise';

describe('telling a visitor’s browser extension apart from our own bugs', () => {
  it('drops the one that actually turned up', () => {
    // "Invalid call to runtime.sendMessage(). Tab not found.": a WebExtension
    // API error with no stack trace, not raised by this app.
    expect(fromBrowserExtension({
      message: 'Invalid call to runtime.sendMessage(). Tab not found.',
      frameFiles: [],
    })).toBe(true);
  });

  it('drops anything whose frames come from an extension', () => {
    for (const scheme of ['chrome-extension', 'moz-extension', 'safari-web-extension']) {
      expect(fromBrowserExtension({
        message: 'Cannot read properties of undefined',
        frameFiles: [`${scheme}://abcdef/inject.js`],
      })).toBe(true);
    }
  });

  it('KEEPS a real bug of ours, whatever it says', () => {
    // Our own error that mentions an extension API must still be reported.
    expect(fromBrowserExtension({
      message: 'runtime.sendMessage is not a function',
      frameFiles: ['https://parcelplanner.app/_next/static/chunks/main.js'],
    })).toBe(false);
  });

  it('keeps an ordinary error with no frames', () => {
    // No stack alone does not mean an extension: it takes an extension frame
    // or a message naming an extension API.
    expect(fromBrowserExtension({ message: 'Something broke', frameFiles: [] })).toBe(false);
  });

  it('catches the other extension messages that turn up everywhere', () => {
    for (const message of [
      'Extension context invalidated.',
      'chrome.runtime.connect is not available',
      'The message port closed before a response was received.',
    ]) {
      expect(fromBrowserExtension({ message, frameFiles: [] })).toBe(true);
    }
  });
});

describe('a client that hung up mid-request', () => {
  it('drops the abort that actually turned up', () => {
    // "aborted" on POST /api/link with every frame inside Node's HTTP server:
    // the client hung up mid-upload. Harmless, since handleShare reads the
    // whole body before writing anything.
    expect(fromClientDisconnect({
      message: 'Error: aborted',
      frameFiles: ['node:_http_server', 'node:_http_server', 'node:net'],
    })).toBe(true);
  });

  it('KEEPS an abort that passed through our own code', () => {
    // A frame of ours means we threw it, and it must be reported.
    expect(fromClientDisconnect({
      message: 'Error: aborted',
      frameFiles: ['node:net', '/app/.next/server/app/api/link/route.js'],
    })).toBe(false);
  });

  it('keeps any other error from inside Node', () => {
    // Only the abort; a genuine crash in Node's internals is reported.
    expect(fromClientDisconnect({
      message: 'Error: ECONNRESET',
      frameFiles: ['node:net'],
    })).toBe(false);
  });

  it('keeps a bare "aborted" with no stack at all', () => {
    // Without frames nothing places it in the HTTP layer, and our own code
    // could use the word "aborted".
    expect(fromClientDisconnect({ message: 'aborted', frameFiles: [] })).toBe(false);
  });
});
