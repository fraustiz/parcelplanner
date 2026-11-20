/**
 * Coalesces repaint requests into at most one per animation frame, so a pointer drag does not
 * redraw the warehouse on every mouse event.
 * `request`/`cancel` are injected so this is testable without a browser and src/render stays DOM-free.
 */
export interface FrameScheduler {
  /** Asks for `draw` to run on the next frame, replacing any request already
   * waiting for it. */
  schedule(draw: () => void): void;
  /** Drops a pending repaint. For unmount, and for an effect re-running. */
  cancel(): void;
}

export function createFrameScheduler(
  request: (callback: () => void) => number,
  cancel: (handle: number) => void,
): FrameScheduler {
  let handle: number | null = null;
  let pending: (() => void) | null = null;

  return {
    schedule(draw) {
      // The last caller wins: each `draw` closes over the state when scheduled, so an earlier one
      // would paint a stale frame.
      pending = draw;
      if (handle !== null) return;
      handle = request(() => {
        handle = null;
        const due = pending;
        pending = null;
        due?.();
      });
    },

    cancel() {
      if (handle !== null) cancel(handle);
      handle = null;
      pending = null;
    },
  };
}
