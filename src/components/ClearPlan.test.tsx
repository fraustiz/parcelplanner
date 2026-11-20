// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import ClearPlan from './ClearPlan';
import { useEditor } from '@/store/editor';
import type { Placement } from '@/core/types';

// See TopBar.test.tsx: RTL's auto-cleanup needs a global `afterEach`, which
// this project's vitest config does not provide.
afterEach(cleanup);

const belt = (id: string, x: number, warehouse: 'main' | 'second' = 'main'): Placement => ({
  id, objectId: 'BP_ConveyorBelt_Straight_Tier1',
  warehouse, floor: 0, cell: { x, y: 0 }, rotation: 0, tier: 1,
});

const withPlacements = (placements: Placement[]) =>
  useEditor.setState({
    plan: { gameVersion: 'test', warehouse: 'main', placements },
    selectedIds: [], undoStack: [], redoStack: [], sharedOverWork: false, heldEdit: null,
    locale: 'en',
  });

beforeEach(() => withPlacements([]));

const open = () => fireEvent.click(screen.getByRole('button', { name: /clear/i }));
const placements = () => useEditor.getState().plan.placements;

describe('clearing the plan', () => {
  it('offers nothing to clear on an empty plan', () => {
    // Same rule as the share link: a control that would do nothing is hidden.
    render(<ClearPlan />);
    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull();
  });

  it('appears as soon as there is something to clear', () => {
    withPlacements([belt('a', 0)]);
    render(<ClearPlan />);
    expect(screen.getByRole('button', { name: /clear/i })).toBeTruthy();
  });

  it('asks before doing anything at all', () => {
    withPlacements([belt('a', 0), belt('b', 1)]);
    render(<ClearPlan />);

    open();

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(placements()).toHaveLength(2);
  });

  it('leaves the plan alone when the question is declined', () => {
    withPlacements([belt('a', 0), belt('b', 1)]);
    render(<ClearPlan />);

    open();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(placements()).toHaveLength(2);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('backs out on Escape too, which must never be able to destroy a layout', () => {
    withPlacements([belt('a', 0)]);
    render(<ClearPlan />);

    open();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(placements()).toHaveLength(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('empties the plan once the question is answered yes', () => {
    withPlacements([belt('a', 0), belt('b', 1)]);
    render(<ClearPlan />);

    open();
    fireEvent.click(screen.getByRole('button', { name: /delete everything/i }));

    expect(placements()).toEqual([]);
  });

  it('says how much is about to go, counting BOTH warehouses', () => {
    // The count covers the other warehouse too, which is not on screen.
    withPlacements([belt('a', 0), belt('b', 1), belt('c', 0, 'second')]);
    render(<ClearPlan />);

    open();

    expect(screen.getByRole('dialog').textContent).toContain('3');
  });

  it('translates', () => {
    withPlacements([belt('a', 0)]);
    useEditor.setState({ locale: 'fr' });
    render(<ClearPlan />);

    fireEvent.click(screen.getByRole('button', { name: /vider/i }));

    expect(screen.getByRole('dialog').textContent).toContain('supprim');
  });
});
