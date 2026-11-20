// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ScrollingLabel from './ScrollingLabel';

afterEach(cleanup);

/** jsdom reports every element as zero-width, so the two measurements the
 * component relies on have to be faked to exercise either branch. */
function fakeWidths(el: HTMLElement, { scroll, client }: { scroll: number; client: number }) {
  Object.defineProperty(el, 'scrollWidth', { value: scroll, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: client, configurable: true });
}

describe('ScrollingLabel', () => {
  it('is an ellipsised block at rest', () => {
    render(<ScrollingLabel text="Convoyeur de Déviation en fonction du Type de Pays" />);
    const inner = screen.getByText(/Convoyeur de Déviation/);
    expect(inner.className).toContain('text-ellipsis');
    expect(inner.style.transform).toBe('translateX(0px)');
  });

  it('switches to natural width and walks the text past when it overflows', () => {
    // Translating the truncated ellipsis layout would cut the start; scrolling
    // needs the natural width.
    render(<ScrollingLabel text="Convoyeur de Déviation en fonction du Type de Pays" />);
    const inner = screen.getByText(/Convoyeur de Déviation/);
    fakeWidths(inner, { scroll: 400, client: 150 });
    fireEvent.mouseEnter(inner.parentElement!);

    expect(inner.className).toContain('w-max');
    expect(inner.className).not.toContain('text-ellipsis');
    expect(inner.style.transform).toBe('translateX(-250px)');
  });

  it('stays still for anyone who prefers reduced motion', () => {
    const realMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce') })) as typeof window.matchMedia;
    try {
      render(<ScrollingLabel text="Convoyeur de Déviation en fonction du Type de Pays" />);
      const inner = screen.getByText(/Convoyeur de Déviation/);
      fakeWidths(inner, { scroll: 400, client: 150 });
      fireEvent.mouseEnter(inner.parentElement!);

      expect(inner.style.transform).toBe('translateX(0px)');
      expect(inner.className).toContain('text-ellipsis');
    } finally {
      window.matchMedia = realMatchMedia;
    }
  });

  it('leaves a name that fits completely alone', () => {
    render(<ScrollingLabel text="Convoyeur Simple" />);
    const inner = screen.getByText('Convoyeur Simple');
    fakeWidths(inner, { scroll: 100, client: 150 });
    fireEvent.mouseEnter(inner.parentElement!);

    expect(inner.style.transform).toBe('translateX(0px)');
    expect(inner.className).toContain('text-ellipsis');
  });

  it('returns to rest when the pointer leaves', () => {
    render(<ScrollingLabel text="Convoyeur de Déviation en fonction du Type de Pays" />);
    const inner = screen.getByText(/Convoyeur de Déviation/);
    fakeWidths(inner, { scroll: 400, client: 150 });
    fireEvent.mouseEnter(inner.parentElement!);
    fireEvent.mouseLeave(inner.parentElement!);

    expect(inner.style.transform).toBe('translateX(0px)');
    expect(inner.className).toContain('text-ellipsis');
  });

  it('scrolls a longer overflow more slowly, so both stay readable', () => {
    const durationFor = (scroll: number) => {
      cleanup();
      render(<ScrollingLabel text="A very long conveyor name indeed" />);
      const inner = screen.getByText(/A very long/);
      fakeWidths(inner, { scroll, client: 100 });
      fireEvent.mouseEnter(inner.parentElement!);
      // jsdom does not expand the `transition` shorthand, so read it whole.
      return Number(/transform ([\d.]+)s/.exec(inner.style.transition)?.[1] ?? 0);
    };
    expect(durationFor(900)).toBeGreaterThan(durationFor(300));
  });
});
