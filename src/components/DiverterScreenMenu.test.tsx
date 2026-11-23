// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import DiverterScreenMenu from './DiverterScreenMenu';
import { CARGO_DIVERTER, COUNTRY_DIVERTER } from '@/core/diverters';
import type { Placement } from '@/core/types';
import { useEditor } from '@/store/editor';

afterEach(cleanup);

const diverter = (objectId: string, over: Partial<Placement> = {}): Placement => ({
  id: 'd', objectId, warehouse: 'second', floor: 0, cell: { x: 4, y: 7 }, rotation: 90, tier: 1, ...over,
});

const start = (placement: Placement) => {
  useEditor.setState({
    plan: { gameVersion: 'test', warehouse: 'second', placements: [placement] },
    locale: 'en', realCountries: false, undoStack: [], redoStack: [],
    sharedOverWork: false, heldEdit: null,
  });
};

const placed = () => useEditor.getState().plan.placements[0]!;

describe('the screen picker on a diverter', () => {
  beforeEach(() => start(diverter(CARGO_DIVERTER, { diverterCargo: { left: 'Road' } })));

  it('offers "any type" and every cargo setting, the current one checked', () => {
    render(<DiverterScreenMenu placementId="d" screen={{ cell: 0, way: 'left' }} at={{ x: 10, y: 10 }} onClose={vi.fn()} />);
    expect(screen.getByRole('menu', { name: 'Diverter screens, Left' })).toBeTruthy();
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(7);
    expect(screen.getByRole('menuitemradio', { name: 'Road' }).getAttribute('aria-checked')).toBe('true');
  });

  it('sets the type picked as one undo step, then closes', () => {
    const onClose = vi.fn();
    render(<DiverterScreenMenu placementId="d" screen={{ cell: 0, way: 'forward' }} at={{ x: 10, y: 10 }} onClose={onClose} />);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Rail' }));
    expect(placed().diverterCargo).toEqual({ left: 'Road', forward: 'Rail' });
    expect(onClose).toHaveBeenCalled();
    useEditor.getState().undo();
    expect(placed().diverterCargo).toEqual({ left: 'Road' });
  });

  it('sets a country on a country diverter screen', () => {
    start(diverter(COUNTRY_DIVERTER));
    render(<DiverterScreenMenu placementId="d" screen={{ cell: 2, way: 'right' }} at={{ x: 10, y: 10 }} onClose={vi.fn()} />);
    expect(screen.getByRole('menu', { name: 'Cell 3, Right' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Molland' }));
    expect(placed().diverterCountries).toEqual([{}, {}, { right: 'Molland' }]);
  });

  it('puts the keyboard on the option the screen shows, "any type" when unset', () => {
    render(<DiverterScreenMenu placementId="d" screen={{ cell: 0, way: 'right' }} at={{ x: 10, y: 10 }} onClose={vi.fn()} />);
    expect(document.activeElement?.textContent).toBe('Any type');
    cleanup();
    render(<DiverterScreenMenu placementId="d" screen={{ cell: 0, way: 'left' }} at={{ x: 10, y: 10 }} onClose={vi.fn()} />);
    expect(document.activeElement?.textContent).toBe('Road');
  });
});
