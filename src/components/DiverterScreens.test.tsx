// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import Inspector from './Inspector';
import { CARGO_DIVERTER, COUNTRY_DIVERTER } from '@/core/diverters';
import type { Placement } from '@/core/types';
import { useEditor } from '@/store/editor';

// See TopBar.test.tsx: RTL's auto-cleanup needs a global `afterEach`, which
// this project's vitest config does not provide.
afterEach(cleanup);

const diverter = (objectId: string, over: Partial<Placement> = {}): Placement => ({
  id: 'd', objectId, warehouse: 'second', floor: 0, cell: { x: 10, y: 10 }, rotation: 0, tier: 1, ...over,
});

const select = (placement: Placement) => useEditor.setState({
  plan: { gameVersion: 'test', warehouse: 'second', placements: [placement] },
  selectedIds: [placement.id],
  undoStack: [],
  redoStack: [],
  locale: 'en',
  realCountries: false,
});

const current = () => useEditor.getState().plan.placements[0]!;

beforeEach(() => select(diverter(COUNTRY_DIVERTER)));

describe("a country diverter's screens", () => {
  it('offers a left and a right screen on each of its three cells', () => {
    render(<Inspector />);
    for (const cell of [1, 2, 3]) {
      expect(screen.getByRole('combobox', { name: `Cell ${cell}, Left` })).toBeTruthy();
      expect(screen.getByRole('combobox', { name: `Cell ${cell}, Right` })).toBeTruthy();
    }
  });

  it('stores the country picked, and undo takes it back', () => {
    render(<Inspector />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Cell 2, Right' }), { target: { value: 'Molland' } });
    expect(current().diverterCountries).toEqual([{}, { right: 'Molland' }, {}]);
    useEditor.getState().undo();
    expect(current().diverterCountries).toBeUndefined();
  });

  it('clears the field once every screen is back to none', () => {
    select(diverter(COUNTRY_DIVERTER, { diverterCountries: [{ left: 'Cristin' }, {}, {}] }));
    render(<Inspector />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Cell 1, Left' }), { target: { value: '' } });
    expect('diverterCountries' in current()).toBe(false);
  });

  it("names the countries as the mod does when real countries are on, storing the game's id", () => {
    useEditor.setState({ realCountries: true });
    render(<Inspector />);
    const box = screen.getByRole('combobox', { name: 'Cell 1, Left' });
    expect([...box.querySelectorAll('option')].map((o) => o.textContent)).toContain('France');
    fireEvent.change(box, { target: { value: 'Cristin' } });
    expect(current().diverterCountries?.[0]).toEqual({ left: 'Cristin' });
  });
});

describe("a cargo type diverter's screens", () => {
  beforeEach(() => select(diverter(CARGO_DIVERTER, { warehouse: 'main' })));

  it('starts every way on any type, as in the game', () => {
    render(<Inspector />);
    for (const name of ['Left', 'Straight on', 'Right']) {
      expect((screen.getByRole('combobox', { name }) as HTMLSelectElement).value).toBe('');
    }
  });

  it('stores the cargo type picked for a way', () => {
    render(<Inspector />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Straight on' }), { target: { value: 'Other' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Left' }), { target: { value: 'Air' } });
    expect(current().diverterCargo).toEqual({ forward: 'Other', left: 'Air' });
  });
});

describe('other objects', () => {
  it('have no screens', () => {
    select(diverter('BP_ConveyorBelt_Splitter'));
    render(<Inspector />);
    expect(screen.queryByText('Diverter screens')).toBeNull();
  });
});
