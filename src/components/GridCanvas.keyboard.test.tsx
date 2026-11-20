// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act, screen } from '@testing-library/react';
import GridCanvas from './GridCanvas';
import { Modal } from './ConfirmDialog';
import { useEditor } from '@/store/editor';
import { getCatalogue } from '@/data/catalogue';
import type { Placement } from '@/core/types';

afterEach(cleanup);

const BELT = 'BP_ConveyorBelt_Straight_Tier1';
const beltName = () => getCatalogue().get(BELT)!.displayName.en;

const belt = (id: string, x: number, y: number): Placement => ({
  id, objectId: BELT, warehouse: 'main', floor: 0, cell: { x, y }, rotation: 0, tier: 1,
});
const rack = (id: string, x: number, y: number): Placement => ({
  id, objectId: 'BP_StorageRack_Medium', warehouse: 'main', floor: 0, cell: { x, y }, rotation: 0, tier: 1,
});

beforeEach(() => {
  useEditor.setState({
    plan: { gameVersion: 'test', warehouse: 'main', placements: [] },
    floor: 0, locale: 'en', selectedIds: [], drag: null, marquee: null, clipboard: [], budget: null,
    notice: null,
    undoStack: [], redoStack: [],
  });
});

/** Renders the canvas and gives it keyboard focus. jsdom has no layout, so
 * the view has no size and the cursor starts at the floor's top-left cell. */
function focused() {
  const view = render(<GridCanvas />);
  const canvas = screen.getByRole('application');
  act(() => canvas.focus());
  const said = () => view.container.querySelector('[data-cursor-status]')!.textContent;
  const press = (key: string, init: Partial<KeyboardEventInit> = {}) =>
    fireEvent.keyDown(canvas, { key, ...init });
  /** Walks the cursor from the top-left cell to `x`, `y`. */
  const goTo = (x: number, y: number) => {
    for (let i = 0; i < x; i++) press('ArrowRight');
    for (let i = 0; i < y; i++) press('ArrowDown');
  };
  return { ...view, canvas, said, press, goTo };
}

const cells = () => useEditor.getState().plan.placements.map((p) => `${p.objectId}@${p.cell.x},${p.cell.y}`);

describe('GridCanvas keyboard focus', () => {
  it('is reachable with Tab and says which keys it takes', () => {
    render(<GridCanvas />);
    const canvas = screen.getByRole('application', { name: 'Warehouse grid' });

    expect(canvas.tabIndex).toBe(0);
    const hint = document.getElementById(canvas.getAttribute('aria-describedby')!);
    expect(hint?.textContent).toMatch(/arrow keys move the cursor/i);

    act(() => canvas.focus());
    expect(document.activeElement).toBe(canvas);
  });

  it('is named in French too', () => {
    useEditor.setState({ locale: 'fr' });
    render(<GridCanvas />);
    expect(screen.getByRole('application', { name: "Grille de l'entrepôt" })).toBeTruthy();
  });
});

describe('GridCanvas keyboard cursor', () => {
  it('moves one cell per arrow and says what is there', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 1, 1)] } }));
    const { press, said } = focused();

    press('ArrowRight');
    // The main warehouse is 40 rows tall and counts rows up from the bottom.
    expect(said()).toBe('Empty, column 2, row 40');

    press('ArrowDown');
    expect(said()).toBe(`${beltName()}, column 2, row 39`);
  });

  it('jumps five cells with Shift and stops at the edge of the floor', () => {
    const { press, said } = focused();

    press('ArrowDown', { shiftKey: true });
    expect(said()).toBe('Empty, column 1, row 35');

    press('ArrowLeft', { shiftKey: true });
    press('ArrowUp', { shiftKey: true });
    press('ArrowUp');
    expect(said()).toBe('Empty, column 1, row 40');
  });

  it('speaks French', () => {
    useEditor.setState({ locale: 'fr' });
    const { press, said } = focused();
    press('ArrowRight');
    expect(said()).toBe('Vide, colonne 2, ligne 40');
  });

  it('leaves the plan and the undo history alone', () => {
    const { press } = focused();
    press('ArrowRight');
    press('ArrowDown');
    expect(useEditor.getState().plan.placements).toEqual([]);
    expect(useEditor.getState().undoStack).toEqual([]);
  });
});

describe('GridCanvas placing from the keyboard', () => {
  it('places the armed object at the cursor with Enter, and undo takes it back', () => {
    const { press, goTo, said } = focused();
    act(() => useEditor.getState().startDrag(BELT));

    goTo(3, 2);
    press('Enter');

    expect(cells()).toEqual([`${BELT}@3,2`]);
    expect(said()).toBe(`Placed: ${beltName()}`);

    act(() => useEditor.getState().undo());
    expect(cells()).toEqual([]);
  });

  it('places with Space too', () => {
    const { press, goTo } = focused();
    act(() => useEditor.getState().startDrag(BELT));
    goTo(4, 4);
    press(' ');
    expect(cells()).toEqual([`${BELT}@4,4`]);
  });

  it('refuses a cell that is taken, the same way a click does, and says why', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [rack('r', 2, 2)] } }));
    const { press, goTo, said, container } = focused();
    act(() => useEditor.getState().startDrag(BELT));

    goTo(2, 3);
    press('Enter');

    expect(useEditor.getState().plan.placements.map((p) => p.id)).toEqual(['r']);
    expect(said()).toBe('Not placed');
    const notice = container.querySelector('[role="status"]:not([data-cursor-status])');
    expect(notice?.textContent).toMatch(/overlaps/i);
  });

  it('still turns the armed object with R', () => {
    const { press, goTo } = focused();
    act(() => useEditor.getState().startDrag(BELT));
    goTo(5, 5);
    fireEvent.keyDown(window, { key: 'r' });
    press('Enter');
    expect(useEditor.getState().plan.placements[0]?.rotation).toBe(90);
  });
});

describe('GridCanvas selecting from the keyboard', () => {
  it('selects what is under the cursor with Enter', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 2, 0), belt('b', 4, 0)] } }));
    const { press, goTo, said } = focused();

    goTo(2, 0);
    press('Enter');

    expect(useEditor.getState().selectedIds).toEqual(['a']);
    expect(said()).toBe(`Selected: ${beltName()}`);
  });

  it('adds and removes with Shift+Enter', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 0), belt('b', 4, 0)] },
      selectedIds: ['a'],
    }));
    const { press, goTo } = focused();

    goTo(4, 0);
    press('Enter', { shiftKey: true });
    expect(useEditor.getState().selectedIds).toEqual(['a', 'b']);

    press('Enter', { shiftKey: true });
    expect(useEditor.getState().selectedIds).toEqual(['a']);
  });

  it('clears the selection with Enter on empty ground', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 2, 0)] }, selectedIds: ['a'] }));
    const { press, said } = focused();
    press('Enter');
    expect(useEditor.getState().selectedIds).toEqual([]);
    expect(said()).toBe('Selection cleared');
  });
});

describe('GridCanvas moving a selection from the keyboard', () => {
  it('moves the selection one cell with Alt+arrow, as one undo entry', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('b', 3, 3)] },
      selectedIds: ['a', 'b'],
    }));
    const { press, said } = focused();

    press('ArrowRight', { altKey: true });

    expect(cells()).toEqual([`${BELT}@3,3`, `${BELT}@4,3`]);
    expect(said()).toBe('Moved');

    act(() => useEditor.getState().undo());
    expect(cells()).toEqual([`${BELT}@2,3`, `${BELT}@3,3`]);
  });

  it('refuses a move onto something else, moving nothing', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), rack('x', 2, 4)] },
      selectedIds: ['a'],
    }));
    const { press, said } = focused();

    press('ArrowDown', { altKey: true });

    expect(useEditor.getState().plan.placements.find((p) => p.id === 'a')?.cell).toEqual({ x: 2, y: 3 });
    expect(said()).toBe('Not moved');
  });

  it('says there is nothing to move', () => {
    const { press, said } = focused();
    press('ArrowRight', { altKey: true });
    expect(said()).toBe('Nothing selected');
  });
});

describe('GridCanvas pasting from the keyboard', () => {
  it('puts a pending paste down at the cursor with Enter', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 0, 0)] }, selectedIds: ['a'] }));
    const { press, goTo, said } = focused();

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    goTo(6, 2);
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    press('Enter');

    expect(cells()).toEqual([`${BELT}@0,0`, `${BELT}@6,2`]);
    expect(said()).toBe('Pasted');
  });
});

describe('GridCanvas menu from the keyboard', () => {
  it('opens the menu with Shift+F10, focus inside, and Escape there keeps the selection', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 0, 0)] } }));
    const { press } = focused();

    press('F10', { shiftKey: true });

    const menu = screen.getByRole('menu');
    expect(menu.contains(document.activeElement)).toBe(true);
    // Opened over an object, so it selects it the way a right press does.
    expect(useEditor.getState().selectedIds).toEqual(['a']);

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(useEditor.getState().selectedIds).toEqual(['a']);
  });

  it('opens with the ContextMenu key too', () => {
    const { press } = focused();
    press('ContextMenu');
    expect(screen.getByRole('menu')).toBeTruthy();
  });
});

describe('GridCanvas under an open dialog', () => {
  it('keeps the selection when Escape closes the dialog', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 0, 0)] }, selectedIds: ['a'] }));
    let open = true;
    const { rerender } = render(
      <>
        <GridCanvas />
        <Modal title="Question" body="Sure?" onClose={() => { open = false; }}>
          <button>OK</button>
        </Modal>
      </>,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'OK' }), { key: 'Escape' });

    expect(open).toBe(false);
    rerender(<GridCanvas />);
    expect(useEditor.getState().selectedIds).toEqual(['a']);
  });
});
