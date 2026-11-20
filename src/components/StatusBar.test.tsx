// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import StatusBar from './StatusBar';
import { useEditor } from '@/store/editor';
import type { Placement } from '@/core/types';

// See TopBar.test.tsx: RTL's auto-cleanup needs a global `afterEach`, which
// this project's vitest config does not provide.
afterEach(cleanup);

const belt = (id: string, x: number, over: Partial<Placement> = {}): Placement => ({
  id, objectId: 'BP_ConveyorBelt_Straight_Tier1',
  warehouse: 'main', floor: 0, cell: { x, y: 0 }, rotation: 0, tier: 1, ...over,
});

beforeEach(() => {
  useEditor.setState({
    plan: {
      gameVersion: 'test', warehouse: 'main',
      placements: [],
    },
    floor: 0, locale: 'en', selectedIds: [], drag: null, budget: null,
    undoStack: [], redoStack: [],
  });
});

describe('StatusBar', () => {
  it('never claims the layout is valid', () => {
    // No verdict: whether a layout works depends on parcel sorting, which the
    // app does not simulate (see the note atop validate.ts).
    render(<StatusBar />);
    expect(screen.queryByText(/valid/i)).toBeNull();
  });

  it('says nothing about a lone conveyor that leads nowhere', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 0)] } }));
    render(<StatusBar />);
    expect(screen.queryByText(/issues found/)).toBeNull();
  });

  it('still reports a placement problem it can actually see', () => {
    // Two belts on the same cell: a fact about placement, not a judgement.
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 0), belt('b', 0)] } }));
    render(<StatusBar />);
    expect(screen.getByText(/issues found/)).toBeTruthy();
    expect(screen.getByText(/Overlaps another object/)).toBeTruthy();
  });

  it('translates a placement problem into French', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 0), belt('b', 0)] },
      locale: 'fr',
    }));
    render(<StatusBar />);
    expect(screen.getByText(/Chevauche un autre objet/)).toBeTruthy();
  });

  it('costs only the objects placed, with no other bucket', () => {
    // Expansions, licences and management upgrades are not in the cost model:
    // none changes what you can build or where.
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 0)] } }));
    render(<StatusBar />);
    expect(screen.getByText(/This warehouse: \$100/)).toBeTruthy();
    expect(screen.queryByText(/Upgrades/)).toBeNull();
    expect(screen.queryByText(/Expansions/)).toBeNull();
    expect(screen.queryByText(/Licen/)).toBeNull();
  });
});

// Costs live here rather than in the top bar, which keeps that bar on one line.
describe('StatusBar reporting the money', () => {
  it('shows a zero cost for an empty plan', () => {
    render(<StatusBar />);
    expect(screen.getByText(/This warehouse: \$0/)).toBeTruthy();
  });

  it('charges 100 for one straight conveyor', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 0)] } }));
    render(<StatusBar />);
    expect(screen.getByText(/This warehouse: \$100/)).toBeTruthy();
  });

  it('does not show a grand total when the other warehouse is empty', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 0)] } }));
    render(<StatusBar />);
    expect(screen.queryByText(/Both warehouses/)).toBeNull();
  });

  it('scopes the headline to the current warehouse and labels the grand total', () => {
    useEditor.setState((s) => ({
      plan: {
        ...s.plan, warehouse: 'main',
        placements: [belt('a', 0), belt('b', 0, { warehouse: 'second' })],
      },
    }));
    render(<StatusBar />);
    // Headline: only the 100 from the main-warehouse belt.
    expect(screen.getByText(/This warehouse: \$100/)).toBeTruthy();
    // Grand total: both belts, labelled so it is not mistaken for this warehouse's.
    expect(screen.getByText(/Both warehouses: \$200/)).toBeTruthy();
  });

  it('excludes the other warehouse\'s placements from the headline cost', () => {
    useEditor.setState((s) => ({
      plan: {
        ...s.plan, warehouse: 'second',
        placements: [belt('a', 0), belt('b', 0, { warehouse: 'second' })],
      },
    }));
    render(<StatusBar />);
    expect(screen.getByText(/This warehouse: \$100/)).toBeTruthy();
    expect(screen.getByText(/Both warehouses: \$200/)).toBeTruthy();
  });

  it('says the same figure once, not twice', () => {
    // No "Objects" total, which would repeat the grand total.
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 0)] } }));
    const { container } = render(<StatusBar />);
    expect(container.textContent?.match(/\$100/g)).toHaveLength(1);
  });

  it('translates the headline into French', () => {
    useEditor.setState({ locale: 'fr' });
    render(<StatusBar />);
    expect(screen.getByText(/Cet entrepôt/)).toBeTruthy();
  });
});

describe('the non-affiliation notice', () => {
  it('says the project is a community one, not the developers', () => {
    // The app serves icons and data extracted from the game, so it must not
    // look official.
    const { getByText } = render(<StatusBar />);
    expect(getByText(/not affiliated/i)).toBeTruthy();
  });

  it('translates', () => {
    useEditor.setState({ locale: 'fr' });
    const { getByText } = render(<StatusBar />);
    expect(getByText(/non affilié/i)).toBeTruthy();
  });
});

describe('the link to the game', () => {
  const link = (c: HTMLElement) => c.querySelector('a[href*="steampowered"]') as HTMLAnchorElement | null;

  it('makes the game name itself the link', () => {
    const { container } = render(<StatusBar />);
    expect(link(container)?.textContent).toBe('Parcel Simulator');
  });

  it('opens in a new tab without handing the game page any control of this one', () => {
    // target=_blank without noopener lets the opened page redirect the opener
    // through window.opener.
    const { container } = render(<StatusBar />);
    expect(link(container)?.target).toBe('_blank');
    expect(link(container)?.rel).toContain('noopener');
  });

  it('still reads as one sentence in French', () => {
    useEditor.setState({ locale: 'fr' });
    const { container } = render(<StatusBar />);
    expect(container.textContent).toContain('non affilié aux développeurs de Parcel Simulator');
  });
});



// A capacity figure, not a warning: the app cannot know how much storage a
// schedule demands, so it has no threshold to warn at.
describe('StatusBar reporting the storage', () => {
  // BP_StorageRack_Medium is the one the game calls Small, and it holds 8.
  const rack = (id: string, x: number, over: Partial<Placement> = {}): Placement => ({
    id, objectId: 'BP_StorageRack_Medium', warehouse: 'main', floor: 0,
    cell: { x, y: 0 }, rotation: 0, tier: 1, ...over,
  });

  it('says nothing at all when there is no storage to speak of', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 0)] } }));
    const { container } = render(<StatusBar />);
    expect(container.textContent).not.toContain('Storage');
  });

  it('adds up what the racks hold', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [rack('a', 0), rack('b', 2)] } }));
    render(<StatusBar />);
    expect(screen.getByText(/Storage: 16/)).toBeTruthy();
  });

  it('counts only the warehouse being looked at', () => {
    // Like the cost headline: this building only, not the one off screen.
    useEditor.setState((s) => ({
      plan: {
        ...s.plan, warehouse: 'main',
        placements: [rack('a', 0), rack('b', 2, { warehouse: 'second' })],
      },
    }));
    render(<StatusBar />);
    expect(screen.getByText(/Storage: 8/)).toBeTruthy();
  });

  it('counts both floors of the warehouse, not just the one on screen', () => {
    // All floors count: the floor selector changes what you edit, not what
    // the building holds.
    useEditor.setState((s) => ({
      plan: {
        ...s.plan, warehouse: 'second',
        placements: [rack('a', 0, { warehouse: 'second' }), rack('b', 2, { warehouse: 'second', floor: 1 })],
      },
      floor: 0,
    }));
    render(<StatusBar />);
    expect(screen.getByText(/Storage: 16/)).toBeTruthy();
  });

  it('translates', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [rack('a', 0)] }, locale: 'fr',
    }));
    render(<StatusBar />);
    expect(screen.getByText(/Stockage: 8/)).toBeTruthy();
  });
});

describe('the donation link', () => {
  it('offers one, opening away from the app and telling the far side nothing', () => {
    render(<StatusBar />);
    const link = screen.getByRole('link', { name: /coffee|café/i });

    expect(link.getAttribute('href')).toBe('https://ko-fi.com/fraustiz');
    expect(link.getAttribute('target')).toBe('_blank');
    // noreferrer as well as noopener, like the game link beside it.
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('comes AFTER the not-affiliated line, never before it', () => {
    // "Not affiliated with the developers" must come before any mention of money.
    const { container } = render(<StatusBar />);
    const text = container.textContent ?? '';
    expect(text.indexOf('Parcel Simulator')).toBeLessThan(text.search(/coffee|café/i));
  });

  it('loads no third-party script for it', () => {
    // A link, not the Ko-fi widget, whose scripts and cookies would require a
    // consent banner.
    const { container } = render(<StatusBar />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
  });
});

describe('StatusBar and the workshop', () => {
  it('prices what is on the bench, and says it is not counted', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, warehouse: 'workshop', placements: [belt('w', 0, { warehouse: 'workshop' })] },
    }));
    render(<StatusBar />);
    expect(screen.getByText(/Workshop, not counted: \$100/)).toBeTruthy();
  });

  it('keeps the bench out of the grand total', () => {
    // A module laid out to be copied is not something the player is buying.
    useEditor.setState((s) => ({
      plan: {
        ...s.plan, warehouse: 'main',
        placements: [belt('a', 0), belt('b', 0, { warehouse: 'second' }), belt('w', 0, { warehouse: 'workshop' })],
      },
    }));
    render(<StatusBar />);
    expect(screen.getByText(/Both warehouses: \$200/)).toBeTruthy();
  });

  it('shows the buildings\' grand total while standing in the workshop', () => {
    useEditor.setState((s) => ({
      plan: {
        ...s.plan, warehouse: 'workshop',
        placements: [belt('a', 0), belt('w', 0, { warehouse: 'workshop' })],
      },
    }));
    render(<StatusBar />);
    expect(screen.getByText(/Both warehouses: \$100/)).toBeTruthy();
  });
});

describe('StatusBar on a phone', () => {
  it('wraps, keeps the issue total and leaves the per-problem breakdown to wider screens', () => {
    useEditor.setState((s) => ({
      locale: 'fr',
      plan: { ...s.plan, placements: [belt('a', 0), belt('b', 0)] },
    }));
    const { container } = render(<StatusBar />);
    const footer = container.querySelector('footer')!;
    expect(footer.className).toContain('flex-wrap');

    const total = screen.getByText(/problèmes détectés/);
    expect(total.className).not.toMatch(/(^| )hidden( |$)/);
    const breakdown = screen.getByText(/Chevauche un autre objet/);
    expect(breakdown.className).toMatch(/(^| )hidden( |$)/);
    expect(breakdown.className).toContain('md:inline');
  });

  it('gives both links a 44px target below md', () => {
    render(<StatusBar />);
    for (const link of screen.getAllByRole('link')) {
      expect(link.className).toContain('min-h-11');
      expect(link.className).toContain('md:min-h-0');
    }
  });
});
