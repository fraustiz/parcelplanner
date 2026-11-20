// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import TopBar from './TopBar';
import { useEditor } from '@/store/editor';
import type { Placement } from '@/core/types';

// RTL's auto-cleanup needs a global `afterEach`, and vitest.config.ts has no
// `globals: true`, so DOM would linger between tests without this.
afterEach(cleanup);

const belt = (id: string, x: number, warehouse: 'main' | 'second' = 'main'): Placement => ({
  id, objectId: 'BP_ConveyorBelt_Straight_Tier1',
  warehouse, floor: 0, cell: { x, y: 0 }, rotation: 0, tier: 1,
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

describe('TopBar', () => {
  it('reports no money at all — every figure lives in the status bar', () => {
    // Costs live in the status bar, which keeps the top bar on one line.
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 0)] } }));
    const { container } = render(<TopBar />);
    expect(container.textContent).not.toContain('$');
    expect(screen.queryByText(/This warehouse/)).toBeNull();
    expect(screen.queryByText(/Both warehouses/)).toBeNull();
  });

  it('no longer offers an expansions field', () => {
    render(<TopBar />);
    expect(screen.queryByText('Expansions owned')).toBeNull();
  });

  it('translates its labels into French', () => {
    useEditor.setState({ locale: 'fr' });
    render(<TopBar />);
    expect(screen.getByText('Entrepôt principal')).toBeTruthy();
  });

  it('offers a floor selector only for the second warehouse', () => {
    const { rerender } = render(<TopBar />);
    expect(screen.queryByText('Ground floor')).toBeNull();
    useEditor.setState((s) => ({ plan: { ...s.plan, warehouse: 'second' } }));
    rerender(<TopBar />);
    expect(screen.getByText('Ground floor')).toBeTruthy();
  });

  it('offers the workshop beside the two buildings, and switches to it', () => {
    render(<TopBar />);
    const building = screen.getByDisplayValue('Main warehouse') as HTMLSelectElement;
    expect([...building.options].map((o) => o.value)).toEqual(['main', 'second', 'workshop']);
    fireEvent.change(building, { target: { value: 'workshop' } });
    expect(useEditor.getState().plan.warehouse).toBe('workshop');
  });

});

describe('surviving a translating browser', () => {
  it('tells the browser not to translate the selectors', () => {
    // A browser translator rewriting <option> text makes React's commit throw
    // "Failed to execute 'removeChild'". translate="no" is inherited by the options.
    render(<TopBar />);
    const selects = document.querySelectorAll('select');
    expect(selects.length).toBeGreaterThan(0);
    for (const select of selects) expect(select.getAttribute('translate')).toBe('no');
  });
});

describe('TopBar semantics', () => {
  it('makes the app name the page heading and names both selects', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, warehouse: 'second', placements: [belt('a', 0, 'second')] } }));
    render(<TopBar />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('ParcelPlanner');
    expect(screen.getByRole('combobox', { name: 'Warehouse' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Floor' })).toBeTruthy();
  });
});

describe('TopBar on a phone', () => {
  /** Below md, an element shows unless it or a parent carries a bare `hidden`. */
  const showsOnPhone = (el: Element) => el.closest('.hidden') === null;

  it('wraps rather than overflowing, with every visible control a 44px target', () => {
    useEditor.setState((s) => ({ locale: 'fr', plan: { ...s.plan, placements: [belt('a', 0)] } }));
    const { container } = render(<TopBar />);
    const group = container.querySelector('header > .ml-auto')!;
    expect(group.className).toContain('flex-wrap');

    const visible = [...group.querySelectorAll('button')].filter(showsOnPhone);
    // The Share menu, the bin, the theme and the language: the three text
    // buttons are folded into the menu.
    expect(visible.map((b) => b.textContent || b.getAttribute('aria-label'))).toEqual([
      'Partager', 'Vider le plan', 'Basculer entre clair et sombre', 'Changer de langue',
    ]);
    for (const button of visible) {
      expect(button.className).toContain('min-h-11');
      // Desktop density is unchanged: the target either shrinks back or the
      // control is not shown at all from md up.
      expect(button.className).toMatch(/md:min-h-0|md:hidden/);
    }
  });
});
