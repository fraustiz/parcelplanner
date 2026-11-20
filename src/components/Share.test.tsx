// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen, waitFor } from '@testing-library/react';
import Share from './Share';

// jsdom has no Blob streams, so the compression step is replaced; the payload
// itself is not what these tests are about.
vi.mock('@/core/serialize', async (original) => ({
  ...await original<typeof import('@/core/serialize')>(),
  encodePlan: async () => 'AAAA',
}));
import { useEditor } from '@/store/editor';

afterEach(cleanup);

beforeEach(() => {
  useEditor.setState({
    plan: { gameVersion: 'test', warehouse: 'main', placements: [] },
    locale: 'en',
  });
});

describe('exporting the plan', () => {
  it('offers a button that downloads the plan as JSON', () => {
    // The same download used when a plan is too big for a link is offered as
    // a plain export.
    const clicks: { name: string }[] = [];
    const realCreate = document.createElement.bind(document);
    const realCreateUrl = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => {};
    document.createElement = ((tag: string) => {
      const el = realCreate(tag);
      // Only the anchor the download builds is intercepted; everything React
      // creates in order to render must behave normally.
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = () => {
          clicks.push({ name: (el as HTMLAnchorElement).download });
        };
      }
      return el;
    }) as typeof document.createElement;

    try {
      render(<Share />);
      fireEvent.click(screen.getByRole('button', { name: /export/i }));

      expect(clicks).toHaveLength(1);
      expect(clicks[0]!.name).toMatch(/\.json$/);
    } finally {
      document.createElement = realCreate as typeof document.createElement;
      URL.createObjectURL = realCreateUrl;
      URL.revokeObjectURL = realRevoke;
    }
  });

  it('shows the export on a phone, where import is hidden', () => {
    // Import is desktop-only, but saving a plan is a read, so phones get it.
    render(<Share />);
    expect(screen.getByRole('button', { name: /export/i }).className).not.toContain('hidden');
    expect(screen.getByRole('button', { name: /import/i }).className).toContain('hidden');
  });
});

describe('sharing a link', () => {
  const placed = () => useEditor.setState({
    plan: {
      gameVersion: 'test', warehouse: 'main',
      placements: [{
        id: 'a', objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'main',
        floor: 0, cell: { x: 1, y: 1 }, rotation: 0, tier: 1,
      }],
    },
  });
  afterEach(() => vi.unstubAllGlobals());

  it('says it is working and cannot be pressed twice while the link is made', async () => {
    placed();
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    render(<Share />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));

    const busy = (await screen.findAllByRole('button', { name: 'Creating link…' }))
      .find((b) => b.getAttribute('aria-busy') === 'true') as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Creating link…');
  });

  it('offers the link to copy by hand when the clipboard refuses it', async () => {
    placed();
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
    render(<Share />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));

    const field = await screen.findByRole('textbox', { name: 'Share link' }) as HTMLInputElement;
    expect(field.value).toMatch(/#p=/);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/copy it by hand/i));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('textbox', { name: 'Share link' })).toBeNull();
  });

  it('treats a clipboard write that never settles as refused', async () => {
    placed();
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: () => new Promise(() => {}) } });
    render(<Share />);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
    await vi.advanceTimersByTimeAsync(3100);
    vi.useRealTimers();

    const field = await screen.findByRole('textbox', { name: 'Share link' }) as HTMLInputElement;
    expect(field.value).toMatch(/#p=/);
  });
});

describe('on a phone', () => {
  it('folds the text buttons into one Share menu, which Escape closes', () => {
    render(<Share />);
    const toggle = screen.getByRole('button', { name: 'Share' });
    expect(toggle.className).toContain('md:hidden');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const menu = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(menu.className).toMatch(/(^| )hidden /);
    expect(menu.className).toContain('md:contents');

    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(menu.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });
});
