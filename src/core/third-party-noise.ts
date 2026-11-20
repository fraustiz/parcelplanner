/**
 * Whether an error came from a browser extension rather than from this app.
 *
 * Either a stack frame served from an extension URL (conclusive), or, with no
 * stack at all, a message naming a WebExtension API. The message is trusted
 * only without frames of ours: our own error mentioning `sendMessage` is a bug
 * to report.
 */
const EXTENSION_SCHEMES = ['chrome-extension://', 'moz-extension://', 'safari-web-extension://'];

/** Messages that only a WebExtension produces. Each was seen in the wild. */
const EXTENSION_MESSAGES = [
  /\bruntime\.sendMessage\b/,
  /\bchrome\.runtime\b/,
  /\bbrowser\.runtime\b/,
  /Extension context invalidated/i,
  /The message port closed before a response was received/i,
];

export function fromBrowserExtension(event: {
  message: string;
  frameFiles: readonly string[];
}): boolean {
  if (event.frameFiles.some((file) => EXTENSION_SCHEMES.some((s) => file.startsWith(s)))) {
    return true;
  }
  if (event.frameFiles.length > 0) return false; // it has frames, and they are ours
  return EXTENSION_MESSAGES.some((pattern) => pattern.test(event.message));
}

/**
 * Whether an error is a client hanging up rather than a failure of ours.
 *
 * Node raises `aborted` when a socket closes before the body is read. Safe to
 * drop: `handleShare` reads the whole body before writing anything, so the
 * link store is untouched. Requires both that message and a stack entirely
 * inside Node internals.
 */
export function fromClientDisconnect(event: {
  message: string;
  frameFiles: readonly string[];
}): boolean {
  if (!/(^|:\s*)aborted$/i.test(event.message.trim())) return false;
  return event.frameFiles.length > 0
    && event.frameFiles.every((file) => file.startsWith('node:'));
}
