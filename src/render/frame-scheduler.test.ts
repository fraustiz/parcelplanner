import { describe, it, expect, vi } from 'vitest';
import { createFrameScheduler } from './frame-scheduler';

/** A hand-cranked requestAnimationFrame, so a frame only happens when the test
 * says so. Testing this against a real one would mean testing the browser. */
function fakeFrames() {
  const pending = new Map<number, () => void>();
  let next = 1;
  return {
    request: (cb: () => void) => { pending.set(next, cb); return next++; },
    cancel: (handle: number) => { pending.delete(handle); },
    /** Runs whatever was requested, as the browser would on the next frame. */
    tick() {
      const due = [...pending.values()];
      pending.clear();
      for (const cb of due) cb();
    },
    get outstanding() { return pending.size; },
  };
}

describe('createFrameScheduler', () => {
  it('does not paint until the frame arrives', () => {
    // State can change many times between two frames without a repaint on the spot.
    const frames = fakeFrames();
    const scheduler = createFrameScheduler(frames.request, frames.cancel);
    const draw = vi.fn();

    scheduler.schedule(draw);
    expect(draw).not.toHaveBeenCalled();

    frames.tick();
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it('paints once for many changes in the same frame', () => {
    // A pointer moving across the grid updates the hover, the marquee and the
    // camera separately. That is one picture, not three.
    const frames = fakeFrames();
    const scheduler = createFrameScheduler(frames.request, frames.cancel);
    const draw = vi.fn();

    scheduler.schedule(draw);
    scheduler.schedule(draw);
    scheduler.schedule(draw);
    expect(frames.outstanding).toBe(1);

    frames.tick();
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it('paints the newest state, not the one that asked first', () => {
    // Each schedule closes over the state at that moment; painting the earliest would lag the pointer.
    const frames = fakeFrames();
    const scheduler = createFrameScheduler(frames.request, frames.cancel);
    const stale = vi.fn();
    const fresh = vi.fn();

    scheduler.schedule(stale);
    scheduler.schedule(fresh);
    frames.tick();

    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it('asks for a new frame once the last one has been painted', () => {
    // Otherwise the canvas would paint exactly once and then freeze.
    const frames = fakeFrames();
    const scheduler = createFrameScheduler(frames.request, frames.cancel);
    const draw = vi.fn();

    scheduler.schedule(draw);
    frames.tick();
    scheduler.schedule(draw);
    frames.tick();

    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('cancels a frame that has not happened yet', () => {
    // On unmount. Painting into a canvas that has gone is at best wasted work.
    const frames = fakeFrames();
    const scheduler = createFrameScheduler(frames.request, frames.cancel);
    const draw = vi.fn();

    scheduler.schedule(draw);
    scheduler.cancel();
    frames.tick();

    expect(draw).not.toHaveBeenCalled();
    expect(frames.outstanding).toBe(0);
  });

  it('can be scheduled again after being cancelled', () => {
    // React runs an effect's cleanup before re-running it, so cancel-then-
    // schedule is the normal path, not an edge case.
    const frames = fakeFrames();
    const scheduler = createFrameScheduler(frames.request, frames.cancel);
    const draw = vi.fn();

    scheduler.schedule(draw);
    scheduler.cancel();
    scheduler.schedule(draw);
    frames.tick();

    expect(draw).toHaveBeenCalledTimes(1);
  });

  it('shrugs off a cancel when nothing is pending', () => {
    const frames = fakeFrames();
    const scheduler = createFrameScheduler(frames.request, frames.cancel);
    expect(() => scheduler.cancel()).not.toThrow();
  });
});
