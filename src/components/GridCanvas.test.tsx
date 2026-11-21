// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act, screen } from '@testing-library/react';
import GridCanvas from './GridCanvas';
import { useEditor } from '@/store/editor';
import { useSimStats } from '@/store/sim-stats';

/** The preview's counts as published for the inspector. */
const simStats = () => useSimStats.getState().stats;
import { getCatalogue } from '@/data/catalogue';
import { orientationFor, portFacings } from '@/core/grid';
import { ALL_TIERS } from '@/data/warehouse-tiers';
import type { Placement } from '@/core/types';

// See TopBar.test.tsx: RTL's auto-cleanup needs a global `afterEach`, which
// this project's vitest config does not provide.
afterEach(cleanup);

const CELL = 32; // CELL_PX in src/render/camera.ts

// GridCanvas's initial camera is { x: -1, y: -1, zoom: 1 }, so screen pixel
// (cell + 1) * CELL is the cell's top-left corner; the centre offsets by
// half a cell so rounding can never put us on a neighbour by accident.
const pointFor = (cell: { x: number; y: number }) => ({
  clientX: (cell.x + 1) * CELL + CELL / 2,
  clientY: (cell.y + 1) * CELL + CELL / 2,
});

// jsdom has no `DragEvent` constructor (jsdom/jsdom#2913), so fireEvent's
// drag events lose clientX/clientY. A MouseEvent with the drag type name works:
// React matches on `event.type`, and the drop only reads clientX/clientY.
function fireDragEvent(
  type: 'dragover' | 'drop',
  target: Element,
  point: { clientX: number; clientY: number },
): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...point });
  target.dispatchEvent(event);
}

const belt = (id: string, x: number, y = 0, floor = 0, warehouse: 'main' | 'second' = 'main'): Placement => ({
  id, objectId: 'BP_ConveyorBelt_Straight_Tier1',
  warehouse, floor, cell: { x, y }, rotation: 0, tier: 1,
});

// 1x3 footprint: exercises the multi-cell hit test.
const rack = (id: string, x: number, y = 0): Placement => ({
  id, objectId: 'BP_StorageRack_Medium',
  warehouse: 'main', floor: 0, cell: { x, y }, rotation: 0, tier: 1,
});

beforeEach(() => {
  useEditor.setState({
    plan: {
      gameVersion: 'test', warehouse: 'main',
      placements: [],
    },
    floor: 0, locale: 'en', selectedIds: [], drag: null, marquee: null, clipboard: [], budget: null,
    notice: null,
    undoStack: [], redoStack: [],
  });
});

describe('GridCanvas selection by click', () => {
  it('selects the placement covering the clicked cell', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 2, 3)] } }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.click(canvas, pointFor({ x: 2, y: 3 }));

    expect(useEditor.getState().selectedIds).toEqual(['a']);
  });

  it('selects a wide object when clicking its second cell', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [rack('r', 5, 0)] } }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.click(canvas, pointFor({ x: 5, y: 2 })); // third cell of the 1x3 footprint

    expect(useEditor.getState().selectedIds).toEqual(['r']);
  });

  it('does not select a placement on a different floor', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, warehouse: 'second', placements: [belt('a', 2, 3, 1, 'second')] },
      floor: 0,
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.click(canvas, pointFor({ x: 2, y: 3 }));

    expect(useEditor.getState().selectedIds).toEqual([]);
  });

  it('does not select a placement belonging to the other warehouse', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, warehouse: 'main', placements: [belt('a', 2, 3, 0, 'second')] },
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.click(canvas, pointFor({ x: 2, y: 3 }));

    expect(useEditor.getState().selectedIds).toEqual([]);
  });

  it('clears the selection when clicking empty space', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.click(canvas, pointFor({ x: 9, y: 9 }));

    expect(useEditor.getState().selectedIds).toEqual([]);
  });

  it('a click while a drag is armed places instead of selecting', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 2, 3)] } }));
    useEditor.getState().startDrag('BP_ConveyorBelt_Straight_Tier1');
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.click(canvas, pointFor({ x: 8, y: 8 }));

    expect(useEditor.getState().plan.placements).toHaveLength(2);
    expect(useEditor.getState().selectedIds).toEqual([]);
  });
});

describe('GridCanvas delete/backspace', () => {
  it('removes the selected placement on Delete and clears the selection', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'Delete' });

    expect(useEditor.getState().plan.placements).toEqual([]);
    expect(useEditor.getState().selectedIds).toEqual([]);
  });

  it('removes the selected placement on Backspace', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'Backspace' });

    expect(useEditor.getState().plan.placements).toEqual([]);
  });

  it('does nothing when nothing is selected', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 2, 3)] } }));
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'Delete' });

    expect(useEditor.getState().plan.placements).toHaveLength(1);
  });

  it('ignores Delete while the target is a text input', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    render(<GridCanvas />);
    const input = document.createElement('input');
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: 'Delete' });

    expect(useEditor.getState().plan.placements).toHaveLength(1);
    document.body.removeChild(input);
  });
});

describe('GridCanvas rotate guard (Ctrl/typing)', () => {
  it('does not rotate the pending drag when Ctrl+R is pressed', () => {
    useEditor.getState().startDrag('BP_ConveyorBelt_Straight_Tier1');
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'r', ctrlKey: true });

    expect(useEditor.getState().drag?.rotation).toBe(0);
  });

  it('does not rotate while typing "r" into a text input', () => {
    useEditor.getState().startDrag('BP_ConveyorBelt_Straight_Tier1');
    render(<GridCanvas />);
    const input = document.createElement('input');
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: 'r' });

    expect(useEditor.getState().drag?.rotation).toBe(0);
    document.body.removeChild(input);
  });
});

describe('GridCanvas drag-and-drop', () => {
  it('commits a placement on drop', () => {
    useEditor.getState().startDrag('BP_ConveyorBelt_Straight_Tier1');
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;
    const point = pointFor({ x: 4, y: 4 });

    fireDragEvent('dragover', canvas, point);
    fireDragEvent('drop', canvas, point);

    const placements = useEditor.getState().plan.placements;
    expect(placements).toHaveLength(1);
    expect(placements[0]!.objectId).toBe('BP_ConveyorBelt_Straight_Tier1');
    expect(placements[0]!.cell).toEqual({ x: 4, y: 4 });
  });

  it('dragOver moves the pending cell, same as mousemove', () => {
    useEditor.getState().startDrag('BP_ConveyorBelt_Straight_Tier1');
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireDragEvent('dragover', canvas, pointFor({ x: 7, y: 2 }));

    expect(useEditor.getState().drag?.cell).toEqual({ x: 7, y: 2 });
  });

  it('does not commit a drop onto an already-occupied cell (same canPlace check as click)', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 4, 4)] } }));
    useEditor.getState().startDrag('BP_ConveyorBelt_Straight_Tier1');
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;
    const point = pointFor({ x: 4, y: 4 });

    fireDragEvent('dragover', canvas, point);
    fireDragEvent('drop', canvas, point);

    expect(useEditor.getState().plan.placements).toHaveLength(1); // unchanged
  });
});

describe('GridCanvas pointer leaves the canvas', () => {
  it('clears the pending preview cell but keeps the tool armed, so no ghost lingers off-canvas', () => {
    useEditor.getState().startDrag('BP_ConveyorBelt_Straight_Tier1');
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseMove(canvas, pointFor({ x: 3, y: 3 }));
    expect(useEditor.getState().drag?.cell).toEqual({ x: 3, y: 3 });

    fireEvent.mouseLeave(canvas);

    expect(useEditor.getState().drag?.cell).toBeNull();
    // Still armed: leaving the canvas must not un-arm the tool, only clear
    // the stale preview position.
    expect(useEditor.getState().drag?.objectId).toBe('BP_ConveyorBelt_Straight_Tier1');
  });
});

describe('GridCanvas middle-mouse pan', () => {
  it('pans the camera without selecting or placing anything', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 2, 3)] } }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;
    const start = pointFor({ x: 2, y: 3 });

    // Sanity check: this screen point currently resolves to the placement.
    fireEvent.click(canvas, start);
    expect(useEditor.getState().selectedIds).toEqual(['a']);
    useEditor.setState({ selectedIds: [] });

    // Drag one full cell to the right with the middle button held.
    fireEvent.mouseDown(canvas, { button: 1, clientX: start.clientX, clientY: start.clientY });
    fireEvent.mouseMove(canvas, {
      button: 1, clientX: start.clientX + CELL, clientY: start.clientY,
    });
    fireEvent.mouseUp(canvas, {
      button: 1, clientX: start.clientX + CELL, clientY: start.clientY,
    });

    // Panning itself must never select or place anything.
    expect(useEditor.getState().selectedIds).toEqual([]);
    expect(useEditor.getState().plan.placements).toHaveLength(1);

    // The same screen point now maps to a different world cell, proving the
    // camera moved: clicking it again no longer hits the placement.
    fireEvent.click(canvas, start);
    expect(useEditor.getState().selectedIds).toEqual([]);
  });
});

describe('GridCanvas box selection', () => {
  /** Replays the full browser event sequence for a drag, including the
   * trailing `click` the browser fires when mousedown and mouseup land on the
   * same element, which must not wipe the new selection. */
  const dragBox = (
    canvas: Element,
    from: { x: number; y: number },
    to: { x: number; y: number },
    modifiers: { shiftKey?: boolean; ctrlKey?: boolean } = {},
  ) => {
    fireEvent.mouseDown(canvas, { button: 0, ...pointFor(from) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor(to) });
    fireEvent.mouseUp(canvas, { button: 0, ...modifiers, ...pointFor(to) });
    fireEvent.click(canvas, { ...modifiers, ...pointFor(to) });
  };

  it('selects every placement the box was dragged over', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 2), belt('b', 3, 2), belt('c', 9, 9)] },
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    dragBox(canvas, { x: 1, y: 1 }, { x: 4, y: 4 });

    expect(useEditor.getState().selectedIds.sort()).toEqual(['a', 'b']);
  });

  it('regression: the click the browser fires after the drag does not wipe the selection', () => {
    // The box ends on empty ground, which is what onClick would have read as
    // "clicked nothing, clear the selection".
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 2, 2)] } }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    dragBox(canvas, { x: 1, y: 1 }, { x: 6, y: 6 });

    expect(useEditor.getState().selectedIds).toEqual(['a']);
  });

  it('swallows only that one click, so the next plain click still selects', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 2), belt('c', 9, 9)] },
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    dragBox(canvas, { x: 1, y: 1 }, { x: 4, y: 4 });
    expect(useEditor.getState().selectedIds).toEqual(['a']);

    fireEvent.click(canvas, pointFor({ x: 9, y: 9 }));
    expect(useEditor.getState().selectedIds).toEqual(['c']);
  });

  it('catches a long object the box only crosses part of', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [rack('r', 5, 0)] } }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    // The rack spans (5,0) to (5,2); this box only touches (5,2). Dragged
    // from (6,3), since a drag starting on the rack would not open a box.
    dragBox(canvas, { x: 6, y: 3 }, { x: 5, y: 2 });

    expect(useEditor.getState().selectedIds).toEqual(['r']);
  });

  it('adds to the existing selection when shift is held', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 2), belt('c', 9, 9)] },
      selectedIds: ['c'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    dragBox(canvas, { x: 1, y: 1 }, { x: 4, y: 4 }, { shiftKey: true });

    expect(useEditor.getState().selectedIds.sort()).toEqual(['a', 'c']);
  });

  it('replaces the existing selection when no modifier is held', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 2), belt('c', 9, 9)] },
      selectedIds: ['c'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    dragBox(canvas, { x: 1, y: 1 }, { x: 4, y: 4 });

    expect(useEditor.getState().selectedIds).toEqual(['a']);
  });

  it('starts a box from on top of an unselected object, and still selects on a plain click', () => {
    // The box only commits if the pointer travels, so a press that stays put
    // still selects the object under it.
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 2, 2)] } }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 2, y: 2 }) });
    expect(useEditor.getState().marquee).not.toBeNull();

    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 2, y: 2 }) });
    fireEvent.click(canvas, pointFor({ x: 2, y: 2 }));
    expect(useEditor.getState().selectedIds).toEqual(['a']);
  });
});

describe('GridCanvas dragging out a run of conveyors', () => {
  const STRAIGHT = 'BP_ConveyorBelt_Straight_Tier1';
  const CORNER = 'BP_ConveyorBelt_Corner_Tier1';

  // Wrapped in act so React re-renders before the events fire; otherwise the
  // handler's closure still reads the old armed object.
  const arm = () => act(() => {
    useEditor.setState({
      drag: { objectId: STRAIGHT, rotation: 0, mirrored: false, cell: null },
    });
  });

  /** Press, drag through each cell, release, then the trailing `click`, which
   * must not add an extra conveyor. */
  const dragThrough = (canvas: Element, cells: { x: number; y: number }[]) => {
    fireEvent.mouseDown(canvas, { button: 0, ...pointFor(cells[0]!) });
    for (const c of cells.slice(1)) fireEvent.mouseMove(canvas, { button: 0, ...pointFor(c) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor(cells.at(-1)!) });
    fireEvent.click(canvas, pointFor(cells.at(-1)!));
  };

  const at = (x: number, y: number) =>
    useEditor.getState().plan.placements.find((p) => p.cell.x === x && p.cell.y === y);

  it('lays one conveyor per cell dragged through', () => {
    arm();
    const { container } = render(<GridCanvas />);
    dragThrough(container.querySelector('canvas')!, [
      { x: 2, y: 5 }, { x: 2, y: 4 }, { x: 2, y: 3 },
    ]);
    expect(useEditor.getState().plan.placements).toHaveLength(3);
  });

  it('fills in cells a fast drag skipped over', () => {
    arm();
    const { container } = render(<GridCanvas />);
    // One single move, five cells across: without gap-filling this would lay 2.
    dragThrough(container.querySelector('canvas')!, [{ x: 2, y: 5 }, { x: 2, y: 1 }]);
    expect(useEditor.getState().plan.placements).toHaveLength(5);
    for (let y = 1; y <= 5; y++) expect(at(2, y)).toBeDefined();
  });

  it('points every conveyor along the direction of travel', () => {
    arm();
    const { container } = render(<GridCanvas />);
    // Dragging rightwards: a straight belt is authored flowing upward, so it
    // has to be turned a quarter turn to flow east.
    dragThrough(container.querySelector('canvas')!, [
      { x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 },
    ]);
    for (let x = 2; x <= 4; x++) expect(at(x, 5)?.rotation).toBe(90);
  });

  it('puts a corner where the drag changes direction', () => {
    arm();
    const { container } = render(<GridCanvas />);
    // Up, then right: the turn happens at (2,3).
    dragThrough(container.querySelector('canvas')!, [
      { x: 2, y: 5 }, { x: 2, y: 4 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 },
    ]);
    expect(at(2, 3)?.objectId).toBe(CORNER);
    // Only the turning cell becomes a corner; the rest stay straight.
    expect(at(2, 5)?.objectId).toBe(STRAIGHT);
    expect(at(2, 4)?.objectId).toBe(STRAIGHT);
    expect(at(3, 3)?.objectId).toBe(STRAIGHT);
  });

  it('mirrors the corner for a turn the other way', () => {
    arm();
    const { container } = render(<GridCanvas />);
    // The game's corner only bends one way unmirrored, so one of these two
    // turns must come out mirrored and the other must not.
    dragThrough(container.querySelector('canvas')!, [
      { x: 5, y: 5 }, { x: 5, y: 4 }, { x: 4, y: 4 },
    ]);
    const left = at(5, 4);
    cleanup();
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [] } }));
    arm();
    const second = render(<GridCanvas />);
    dragThrough(second.container.querySelector('canvas')!, [
      { x: 5, y: 5 }, { x: 5, y: 4 }, { x: 6, y: 4 },
    ]);
    const right = at(5, 4);
    expect(left?.objectId).toBe(CORNER);
    expect(right?.objectId).toBe(CORNER);
    expect(left?.mirrored).not.toBe(right?.mirrored);
  });

  it('undoes the whole run in one press', () => {
    arm();
    const { container } = render(<GridCanvas />);
    dragThrough(container.querySelector('canvas')!, [
      { x: 2, y: 5 }, { x: 2, y: 4 }, { x: 2, y: 3 }, { x: 3, y: 3 },
    ]);
    expect(useEditor.getState().plan.placements.length).toBeGreaterThan(1);
    useEditor.getState().undo();
    expect(useEditor.getState().plan.placements).toEqual([]);
  });

  it('still places exactly one for a press that never moved', () => {
    arm();
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;
    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 2, y: 5 }) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 2, y: 5 }) });
    fireEvent.click(canvas, pointFor({ x: 2, y: 5 }));
    expect(useEditor.getState().plan.placements).toHaveLength(1);
    // No direction was ever established, so it keeps the armed rotation.
    expect(at(2, 5)?.rotation).toBe(0);
  });

  it('does not lay a run when nothing is armed', () => {
    const { container } = render(<GridCanvas />);
    dragThrough(container.querySelector('canvas')!, [{ x: 2, y: 5 }, { x: 2, y: 3 }]);
    expect(useEditor.getState().plan.placements).toEqual([]);
  });

  it('skips a cell it cannot build on and carries on past it', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('blocker', 2, 4)] } }));
    arm();
    const { container } = render(<GridCanvas />);
    dragThrough(container.querySelector('canvas')!, [
      { x: 2, y: 5 }, { x: 2, y: 4 }, { x: 2, y: 3 },
    ]);
    // The blocker is untouched and the run continued past it.
    expect(at(2, 4)?.id).toBe('blocker');
    expect(at(2, 5)).toBeDefined();
    expect(at(2, 3)).toBeDefined();
  });
});

describe('GridCanvas expansion masking', () => {
  it('refuses to place on a tier that has been ticked off', () => {
    // Tier 1 is main's 10x10 tile at (10,0). Owning everything except it makes
    // that tile unbuildable while its neighbours stay fine.
    useEditor.setState((s) => ({
      plan: { ...s.plan, ownedTiers: [...ALL_TIERS].filter((t) => t !== 1) },
      drag: { objectId: 'BP_ConveyorBelt_Straight_Tier1', rotation: 0, mirrored: false, cell: null },
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.click(canvas, pointFor({ x: 15, y: 5 })); // inside tier 1
    expect(useEditor.getState().plan.placements).toEqual([]);

    fireEvent.click(canvas, pointFor({ x: 5, y: 5 })); // the starting area
    expect(useEditor.getState().plan.placements).toHaveLength(1);
  });

  it('places anywhere buildable when no expansion has been ticked off', () => {
    // ownedTiers absent means all owned, so a first visit is not confined to
    // the starting corner.
    useEditor.setState({
      drag: { objectId: 'BP_ConveyorBelt_Straight_Tier1', rotation: 0, mirrored: false, cell: null },
    });
    const { container } = render(<GridCanvas />);
    fireEvent.click(container.querySelector('canvas')!, pointFor({ x: 15, y: 5 }));
    expect(useEditor.getState().plan.placements).toHaveLength(1);
  });
});

// The left button places, selects, box-selects, lays runs and moves, told
// apart by what is armed and what is under the press. The right button
// always pans.
describe('GridCanvas moving a selection with the left button', () => {
  const leftDrag = (canvas: Element, from: { x: number; y: number }, to: { x: number; y: number }) => {
    fireEvent.mouseDown(canvas, { button: 0, ...pointFor(from) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor(to) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor(to) });
    // The browser fires this after any mouseup on the same element, and it
    // must not undo the drag by re-selecting whatever is under the pointer.
    fireEvent.click(canvas, pointFor(to));
  };

  const cellOf = (id: string) =>
    useEditor.getState().plan.placements.find((p) => p.id === id)?.cell;

  it('moves the object to where the pointer was released', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);

    leftDrag(container.querySelector('canvas')!, { x: 2, y: 3 }, { x: 6, y: 5 });

    expect(cellOf('a')).toEqual({ x: 6, y: 5 });
  });

  it('box-selects when the drag starts on an object that is NOT selected', () => {
    // A drag moves only when it starts on the selection; anywhere else it
    // draws a box.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('b', 4, 5)] },
      selectedIds: [],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 2, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 5, y: 6 }) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 5, y: 6 }) });
    fireEvent.click(canvas, pointFor({ x: 5, y: 6 }));

    // Both caught by the box, and 'a' has not been dragged anywhere.
    expect([...useEditor.getState().selectedIds].sort()).toEqual(['a', 'b']);
    expect(cellOf('a')).toEqual({ x: 2, y: 3 });
  });

  it('moves a SELECTED object, which is what tells the two apart', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);

    leftDrag(container.querySelector('canvas')!, { x: 2, y: 3 }, { x: 4, y: 3 });

    expect(cellOf('a')).toEqual({ x: 4, y: 3 });
  });

  it('moves the whole selection together, keeping its shape', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('b', 3, 3), belt('c', 4, 3)] },
      selectedIds: ['a', 'b', 'c'],
    }));
    const { container } = render(<GridCanvas />);

    leftDrag(container.querySelector('canvas')!, { x: 3, y: 3 }, { x: 3, y: 7 });

    expect([cellOf('a'), cellOf('b'), cellOf('c')])
      .toEqual([{ x: 2, y: 7 }, { x: 3, y: 7 }, { x: 4, y: 7 }]);
  });

  it('slides a line along its own axis, onto the cells it is vacating', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('b', 3, 3), belt('c', 4, 3)] },
      selectedIds: ['a', 'b', 'c'],
    }));
    const { container } = render(<GridCanvas />);

    leftDrag(container.querySelector('canvas')!, { x: 3, y: 3 }, { x: 4, y: 3 });

    expect([cellOf('a'), cellOf('b'), cellOf('c')])
      .toEqual([{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 }]);
  });

  it('leaves the object where it was when the destination is taken', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('blocker', 3, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);

    leftDrag(container.querySelector('canvas')!, { x: 2, y: 3 }, { x: 3, y: 3 });

    expect(cellOf('a')).toEqual({ x: 2, y: 3 });
  });

  it('undoes the whole drag in one step, not one per cell crossed', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 2, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 3, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 4, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 5, y: 3 }) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 5, y: 3 }) });
    fireEvent.click(canvas, pointFor({ x: 5, y: 3 }));

    expect(cellOf('a')).toEqual({ x: 5, y: 3 });
    useEditor.getState().undo();
    expect(cellOf('a')).toEqual({ x: 2, y: 3 });
  });

  it('keeps the objects selected after moving them', () => {
    // The trailing click lands on an object at its new place; it must not
    // reshuffle the selection.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('b', 3, 3)] },
      selectedIds: ['a', 'b'],
    }));
    const { container } = render(<GridCanvas />);

    leftDrag(container.querySelector('canvas')!, { x: 2, y: 3 }, { x: 2, y: 8 });

    expect([...useEditor.getState().selectedIds].sort()).toEqual(['a', 'b']);
  });

  it('puts nothing down until the button is released', () => {
    // Like an aimed paste, a silhouette follows the pointer and the plan is
    // untouched until the drop.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 2, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 7, y: 9 }) });
    expect(cellOf('a')).toEqual({ x: 2, y: 3 });

    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 7, y: 9 }) });
    expect(cellOf('a')).toEqual({ x: 7, y: 9 });
  });

  it('carries the selection over objects in the way and lands it past them', () => {
    // The silhouette may cross occupied ground; only the drop cell must be clear.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('wall', 3, 3), belt('wall2', 4, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 2, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 3, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 4, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 5, y: 3 }) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 5, y: 3 }) });

    expect(cellOf('a')).toEqual({ x: 5, y: 3 });
  });

  it('goes home when released somewhere it will not fit, not to the last spot that worked', () => {
    // A drop onto an obstacle is refused and the selection stays where it started.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('wall', 5, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 2, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 4, y: 3 }) }); // free
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 5, y: 3 }) }); // taken
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 5, y: 3 }) });

    expect(cellOf('a')).toEqual({ x: 2, y: 3 });
  });

  const stateOf = (id: string) =>
    useEditor.getState().plan.placements.find((p) => p.id === id);

  it('turns only the silhouette when R is pressed mid-drag', () => {
    // While a drag is aimed, R turns the silhouette, not the objects, as for a paste.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 2, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 6, y: 3 }) });
    fireEvent.keyDown(window, { key: 'r' });

    expect(stateOf('a')).toMatchObject({ cell: { x: 2, y: 3 }, rotation: 0 });

    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 6, y: 3 }) });

    // The turn and the travel land together, as one action.
    expect(stateOf('a')).toMatchObject({ cell: { x: 6, y: 3 }, rotation: 90 });
  });

  it('turns the silhouette the other way on Shift+R', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 2, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 6, y: 3 }) });
    fireEvent.keyDown(window, { key: 'R', shiftKey: true });

    // Checked before the release too: the end state alone would not show that
    // the turn was held.
    expect(stateOf('a')).toMatchObject({ rotation: 0 });

    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 6, y: 3 }) });

    expect(stateOf('a')).toMatchObject({ cell: { x: 6, y: 3 }, rotation: 270 });
  });

  it('flips only the silhouette when X is pressed mid-drag', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 2, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 6, y: 3 }) });
    fireEvent.keyDown(window, { key: 'x' });

    expect(stateOf('a')).toMatchObject({ cell: { x: 2, y: 3 } });
    expect(stateOf('a')?.mirrored).toBeFalsy();

    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 6, y: 3 }) });

    expect(stateOf('a')).toMatchObject({ cell: { x: 6, y: 3 }, mirrored: true });
  });

  it('throws the turn away with the rest of the manoeuvre on Escape', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 2, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 6, y: 3 }) });
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 6, y: 3 }) });

    expect(stateOf('a')).toMatchObject({ cell: { x: 2, y: 3 }, rotation: 0 });
  });

  it('commits a turn made without travelling, which is not a click', () => {
    // Press, R, release without moving: the turn still lands, rather than
    // being treated as a plain click.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 2, y: 3 }) });
    fireEvent.keyDown(window, { key: 'r' });

    // Held until the release, as in the Shift+R test above.
    expect(stateOf('a')).toMatchObject({ rotation: 0 });

    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 2, y: 3 }) });

    expect(stateOf('a')).toMatchObject({ cell: { x: 2, y: 3 }, rotation: 90 });
  });

  it('still turns the selection with R when no drag is under way', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'r' });

    expect(stateOf('a')).toMatchObject({ rotation: 90 });
  });

  it('is called off by Escape, putting the selection back', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 2, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 8, y: 8 }) });
    fireEvent.keyDown(window, { key: 'Escape' });
    // The button is still down; releasing it must not complete a gesture that
    // has already been called off.
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 8, y: 8 }) });
    fireEvent.click(canvas, pointFor({ x: 8, y: 8 }));

    expect(cellOf('a')).toEqual({ x: 2, y: 3 });
  });

  it('is called off by a right-click, putting the selection back', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 2, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 8, y: 8 }) });
    fireEvent.mouseDown(canvas, { button: 2, ...pointFor({ x: 8, y: 8 }) });
    fireEvent.mouseUp(canvas, { button: 2, ...pointFor({ x: 8, y: 8 }) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 8, y: 8 }) });

    expect(cellOf('a')).toEqual({ x: 2, y: 3 });
  });

  it('is called off when the pointer leaves the canvas, having moved nothing', () => {
    // The release would land off-canvas with no mouseup, so the gesture ends
    // here; nothing was committed, so ending it cancels it.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 2, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 8, y: 8 }) });
    fireEvent.mouseLeave(canvas);

    expect(cellOf('a')).toEqual({ x: 2, y: 3 });
  });

  it('still box-selects when the drag starts on empty ground', () => {
    // Starting on an object moves; starting on nothing selects.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('b', 3, 3)] },
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 1, y: 1 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 5, y: 5 }) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 5, y: 5 }) });
    fireEvent.click(canvas, pointFor({ x: 5, y: 5 }));

    expect([...useEditor.getState().selectedIds].sort()).toEqual(['a', 'b']);
  });

  it('still lays a run when an object is armed, instead of moving', () => {
    // With something picked from the palette the left button builds, over the move.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
      drag: { objectId: 'BP_ConveyorBelt_Straight_Tier1', rotation: 0, mirrored: false, cell: null },
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 8, y: 8 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 11, y: 8 }) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 11, y: 8 }) });

    expect(useEditor.getState().plan.placements.length).toBeGreaterThan(1);
    expect(cellOf('a')).toEqual({ x: 2, y: 3 });
  });
});

// The right button: travel pans, no travel opens the context menu (on an
// object) or cancels. Middle-click pans too.
describe('GridCanvas suppressing the browser\'s own menu', () => {
  const rightClick = (el: Element) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('suppresses it over the grid', () => {
    const { container } = render(<GridCanvas />);
    expect(rightClick(container.querySelector('canvas')!)).toBe(true);
  });

  it('suppresses it over the app\'s OWN menu, which opens under the pointer', () => {
    // On Windows, Chromium fires `contextmenu` on mouseup, after React has
    // rendered the app's menu under the cursor, so the event targets the menu,
    // not the canvas. The menu must suppress it too.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 2, ...pointFor({ x: 2, y: 3 }) });
    fireEvent.mouseUp(canvas, { button: 2, ...pointFor({ x: 2, y: 3 }) });

    const menu = container.querySelector('[role="menu"]');
    expect(menu).toBeTruthy();
    expect(rightClick(menu!)).toBe(true);
  });
});

describe('GridCanvas panning with the right button', () => {
  // The camera lives in component state, so a pan is observed through what
  // the canvas does rather than read directly: after panning, the cell under a
  // fixed screen point has changed, so a click there hits something else.

  it('pans the map when the drag starts on empty ground', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 2, 3)] } }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    // Before the pan, this screen point is over the belt at (2,3).
    fireEvent.mouseDown(canvas, { button: 2, ...pointFor({ x: 15, y: 15 }) });
    fireEvent.mouseMove(canvas, { button: 2, ...pointFor({ x: 18, y: 15 }) });
    fireEvent.mouseUp(canvas, { button: 2, ...pointFor({ x: 18, y: 15 }) });
    fireEvent.contextMenu(canvas, pointFor({ x: 18, y: 15 }));

    // Dragging right by 3 cells moves the camera left by 3, so a click at the
    // belt's old point no longer selects it.
    fireEvent.click(canvas, pointFor({ x: 2, y: 3 }));
    expect(useEditor.getState().selectedIds).toEqual([]);
    fireEvent.click(canvas, pointFor({ x: 5, y: 3 }));
    expect(useEditor.getState().selectedIds).toEqual(['a']);
  });

  it('pans even when the drag starts on an object, and moves nothing', () => {
    // No exception for objects: panning works the same wherever the drag begins.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 2, ...pointFor({ x: 2, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 2, ...pointFor({ x: 5, y: 3 }) });
    fireEvent.mouseUp(canvas, { button: 2, ...pointFor({ x: 5, y: 3 }) });
    fireEvent.contextMenu(canvas, pointFor({ x: 5, y: 3 }));

    // The belt has not moved on the grid...
    expect(useEditor.getState().plan.placements[0]!.cell).toEqual({ x: 2, y: 3 });
    // ...but the camera has, so the belt now answers a click 3 cells further.
    fireEvent.click(canvas, pointFor({ x: 5, y: 3 }));
    expect(useEditor.getState().selectedIds).toEqual(['a']);
  });

  it('keeps the selection after a pan, rather than treating it as a click', () => {
    // A right-press that does not travel cancels; a pan must not wipe the selection.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 2, ...pointFor({ x: 15, y: 15 }) });
    fireEvent.mouseMove(canvas, { button: 2, ...pointFor({ x: 17, y: 17 }) });
    fireEvent.mouseUp(canvas, { button: 2, ...pointFor({ x: 17, y: 17 }) });

    expect(useEditor.getState().selectedIds).toEqual(['a']);
  });

  it('opens no menu after a pan', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 2, 3)] } }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 2, ...pointFor({ x: 15, y: 15 }) });
    fireEvent.mouseMove(canvas, { button: 2, ...pointFor({ x: 17, y: 17 }) });
    fireEvent.mouseUp(canvas, { button: 2, ...pointFor({ x: 17, y: 17 }) });

    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it('still cancels a selection on a right-click that never travels', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 2, ...pointFor({ x: 15, y: 15 }) });
    fireEvent.mouseUp(canvas, { button: 2, ...pointFor({ x: 15, y: 15 }) });

    expect(useEditor.getState().selectedIds).toEqual([]);
  });
});

describe('GridCanvas rotating counter-clockwise with Shift+R', () => {
  it('turns a placed object the other way', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'R', shiftKey: true });

    expect(useEditor.getState().plan.placements[0]!.rotation).toBe(270);
  });

  it('turns the armed object the other way before it is placed', () => {
    useEditor.setState({ drag: { objectId: 'BP_ConveyorBelt_Straight_Tier1', rotation: 0, mirrored: false, cell: null } });
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'R', shiftKey: true });

    expect(useEditor.getState().drag?.rotation).toBe(270);
  });

  it('leaves plain R turning clockwise', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'r' });

    expect(useEditor.getState().plan.placements[0]!.rotation).toBe(90);
  });

  it('still pivots a 1x3 on its middle cell when turned the other way', () => {
    // Shift+R must go through the same helper as R, or a rack would jump.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [rack('r', 5, 5)] },
      selectedIds: ['r'],
    }));
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'R', shiftKey: true });

    const after = useEditor.getState().plan.placements[0]!;
    expect(after.rotation).toBe(270);
    expect(after.cell).toEqual({ x: 4, y: 6 });
  });
});

// Ctrl+C / Ctrl+X / Ctrl+V. The clipboard lives in the store: the system one
// needs a permission prompt to read and holds text.
describe('GridCanvas copy, cut and paste', () => {
  const cellsOf = () =>
    useEditor.getState().plan.placements.map((p) => `${p.cell.x},${p.cell.y}`).sort();

  const hover = (canvas: Element, cell: { x: number; y: number }) =>
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor(cell) });

  it('pastes the copied shape under the pointer', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('b', 3, 3)] },
      selectedIds: ['a', 'b'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    hover(canvas, { x: 10, y: 10 });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    // Ctrl+V arms the paste; the click puts it down (see `pasteCell`).
    fireEvent.click(canvas, pointFor({ x: 10, y: 10 }));

    // The original pair, plus the same pair with its corner under the pointer.
    expect(cellsOf()).toEqual(['10,10', '11,10', '2,3', '3,3']);
  });

  it('keeps the shape of what was copied', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('b', 4, 6)] },
      selectedIds: ['a', 'b'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    hover(canvas, { x: 10, y: 10 });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    // Ctrl+V arms the paste; the click puts it down (see `pasteCell`).
    fireEvent.click(canvas, pointFor({ x: 10, y: 10 }));

    // The 2x3 offset between them survives the trip.
    expect(cellsOf()).toEqual(['10,10', '12,13', '2,3', '4,6']);
  });

  it('cuts: the objects go, and come back on paste', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.keyDown(window, { key: 'x', ctrlKey: true });
    expect(useEditor.getState().plan.placements).toHaveLength(0);

    hover(canvas, { x: 8, y: 8 });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    // Ctrl+V arms the paste; the click puts it down (see `pasteCell`).
    fireEvent.click(canvas, pointFor({ x: 10, y: 10 }));
    expect(cellsOf()).toEqual(['8,8']);
  });

  it('selects what was just pasted, so it can be dragged into place', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    hover(canvas, { x: 9, y: 9 });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    // Ctrl+V arms the paste; the click puts it down (see `pasteCell`).
    fireEvent.click(canvas, pointFor({ x: 10, y: 10 }));

    const selected = useEditor.getState().selectedIds;
    expect(selected).toHaveLength(1);
    expect(selected[0]).not.toBe('a'); // the copy, not the original
  });

  it('pastes nothing where it would not fit', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('blocker', 9, 9)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    hover(canvas, { x: 9, y: 9 });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    // Ctrl+V arms the paste; the click puts it down (see `pasteCell`).
    fireEvent.click(canvas, pointFor({ x: 10, y: 10 }));

    expect(useEditor.getState().plan.placements).toHaveLength(2);
  });

  it('undoes a paste in one step', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('b', 3, 3)] },
      selectedIds: ['a', 'b'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    hover(canvas, { x: 10, y: 10 });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    // Ctrl+V arms the paste; the click puts it down (see `pasteCell`).
    fireEvent.click(canvas, pointFor({ x: 10, y: 10 }));
    useEditor.getState().undo();

    expect(cellsOf()).toEqual(['2,3', '3,3']);
  });

  it('leaves Ctrl+C alone when nothing is selected', () => {
    // Otherwise the app would swallow the browser's own copy over an empty
    // grid, and a stale clipboard would paste on the next Ctrl+V.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: [],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    const event = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, cancelable: true, bubbles: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);

    hover(canvas, { x: 10, y: 10 });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    // Ctrl+V arms the paste; the click puts it down (see `pasteCell`).
    fireEvent.click(canvas, pointFor({ x: 10, y: 10 }));
    expect(useEditor.getState().plan.placements).toHaveLength(1);
  });

  it('still lets Ctrl+R reload the page', () => {
    // Clipboard shortcuts must not turn Ctrl+R into a rotation.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'r', ctrlKey: true });

    expect(useEditor.getState().plan.placements[0]!.rotation).toBe(0);
  });
});

// Q picks whatever is under the pointer, like Factorio's pipette.
describe('GridCanvas picking the object under the pointer', () => {
  const pick = (canvas: Element, cell: { x: number; y: number }) => {
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor(cell) });
    fireEvent.keyDown(window, { key: 'q' });
  };

  it('arms the type of the object being hovered', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [rack('r', 5, 5)] },
    }));
    const { container } = render(<GridCanvas />);

    pick(container.querySelector('canvas')!, { x: 5, y: 5 });

    expect(useEditor.getState().drag?.objectId).toBe('BP_StorageRack_Medium');
  });

  it('copies how the object is turned and mirrored, not just what it is', () => {
    // The pick keeps the object's rotation.
    useEditor.setState((s) => ({
      plan: {
        ...s.plan,
        placements: [{ ...belt('a', 4, 4), rotation: 180 as const, mirrored: true }],
      },
    }));
    const { container } = render(<GridCanvas />);

    pick(container.querySelector('canvas')!, { x: 4, y: 4 });

    expect(useEditor.getState().drag).toMatchObject({ rotation: 180, mirrored: true });
  });

  it('picks the object anywhere on its footprint, not just its anchor', () => {
    // A 1x3 rack: hovering its far end is still hovering the rack.
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [rack('r', 5, 5)] } }));
    const { container } = render(<GridCanvas />);

    pick(container.querySelector('canvas')!, { x: 5, y: 7 });

    expect(useEditor.getState().drag?.objectId).toBe('BP_StorageRack_Medium');
  });

  it('clears what is armed when there is nothing under the pointer', () => {
    // Like Factorio: the pipette over empty ground empties the hand.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      drag: { objectId: 'BP_ConveyorBelt_Straight_Tier1', rotation: 0, mirrored: false, cell: null },
    }));
    const { container } = render(<GridCanvas />);

    pick(container.querySelector('canvas')!, { x: 15, y: 15 });

    expect(useEditor.getState().drag).toBeNull();
  });

  it('does not fire while typing in the palette search box', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 2, 3)] } }));
    const { container } = render(<GridCanvas />);
    fireEvent.mouseMove(container.querySelector('canvas')!, { button: 0, ...pointFor({ x: 2, y: 3 }) });

    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'q' });
    document.body.removeChild(input);

    expect(useEditor.getState().drag).toBeNull();
  });

  it('leaves Ctrl+Q to the browser', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 2, 3)] } }));
    const { container } = render(<GridCanvas />);

    fireEvent.mouseMove(container.querySelector('canvas')!, { button: 0, ...pointFor({ x: 2, y: 3 }) });
    fireEvent.keyDown(window, { key: 'q', ctrlKey: true });

    expect(useEditor.getState().drag).toBeNull();
  });

  // The middle button also picks, as in Minecraft. It pans too: a press that
  // travels pans, one that stays put picks.
  it('picks on a middle click that does not travel', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [rack('r', 5, 5)] } }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 5, y: 5 }) });
    fireEvent.mouseDown(canvas, { button: 1, ...pointFor({ x: 5, y: 5 }) });
    fireEvent.mouseUp(canvas, { button: 1, ...pointFor({ x: 5, y: 5 }) });

    expect(useEditor.getState().drag?.objectId).toBe('BP_StorageRack_Medium');
  });

  it('pans instead of picking when the middle press travels', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [rack('r', 5, 5)] } }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 1, ...pointFor({ x: 5, y: 5 }) });
    fireEvent.mouseMove(canvas, { button: 1, ...pointFor({ x: 9, y: 5 }) });
    fireEvent.mouseUp(canvas, { button: 1, ...pointFor({ x: 9, y: 5 }) });

    // Nothing armed, and the camera moved: a click at the rack's old screen
    // point no longer finds it.
    expect(useEditor.getState().drag).toBeNull();
    fireEvent.click(canvas, pointFor({ x: 5, y: 5 }));
    expect(useEditor.getState().selectedIds).toEqual([]);
  });

  it('clears the armed object on a middle click over empty ground', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      drag: { objectId: 'BP_ConveyorBelt_Straight_Tier1', rotation: 0, mirrored: false, cell: null },
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 15, y: 15 }) });
    fireEvent.mouseDown(canvas, { button: 1, ...pointFor({ x: 15, y: 15 }) });
    fireEvent.mouseUp(canvas, { button: 1, ...pointFor({ x: 15, y: 15 }) });

    expect(useEditor.getState().drag).toBeNull();
  });
});

// Loaders and unloaders are endpoints, so a dragged run does not turn them to
// follow the path the way it turns a belt.
describe('GridCanvas laying a run of endpoint objects', () => {
  const armedAt = (objectId: string, rotation: 0 | 90 | 180 | 270) =>
    useEditor.setState({ drag: { objectId, rotation, mirrored: false, cell: null } });

  const dragUp = (canvas: Element) => {
    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 2, y: 6 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 2, y: 5 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 2, y: 4 }) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 2, y: 4 }) });
  };

  const rotations = () => useEditor.getState().plan.placements.map((p) => p.rotation);

  it('keeps the armed rotation of a loader instead of pointing it along the drag', () => {
    armedAt('BP_ConveyorBelt_Loader', 90);
    const { container } = render(<GridCanvas />);

    dragUp(container.querySelector('canvas')!);

    expect(rotations()).toEqual([90, 90, 90]);
  });

  it('keeps the armed rotation of an unloader too', () => {
    armedAt('BP_ConveyorBelt_Unloader', 180);
    const { container } = render(<GridCanvas />);

    dragUp(container.querySelector('canvas')!);

    expect(rotations()).toEqual([180, 180, 180]);
  });

  it('keeps the armed rotation of a pauser, and of everything else', () => {
    // Only the straight belt follows the path; everything else keeps the
    // rotation it was armed with.
    armedAt('BP_ConveyorBelt_Pauser', 270);
    const { container } = render(<GridCanvas />);

    dragUp(container.querySelector('canvas')!);

    expect(rotations()).toEqual([270, 270, 270]);
  });

  it('keeps the armed rotation of a bridger', () => {
    armedAt('BP_ConveyorBelt_Bridger', 90);
    const { container } = render(<GridCanvas />);

    dragUp(container.querySelector('canvas')!);

    expect(rotations()).toEqual([90, 90, 90]);
  });

  it('still points a plain belt along the path it was dragged', () => {
    // A loader has the same in/out port pair as a belt, so the ports alone
    // cannot tell them apart.
    armedAt('BP_ConveyorBelt_Straight_Tier1', 90);
    const { container } = render(<GridCanvas />);

    dragUp(container.querySelector('canvas')!);

    expect(rotations()).toEqual([0, 0, 0]);
  });
});

// A quarter turn of a multi-selection moves the objects as well as turning them.
describe('GridCanvas rotating and mirroring a whole selection', () => {
  const cellsOf = () => useEditor.getState().plan.placements
    .map((p) => `${p.cell.x},${p.cell.y}`).sort();

  it('stands a row of belts up instead of spinning each in place', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 5, 5), belt('b', 6, 5), belt('c', 7, 5)] },
      selectedIds: ['a', 'b', 'c'],
    }));
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'r' });

    expect(cellsOf()).toEqual(['6,4', '6,5', '6,6']);
  });

  it('flips a row end for end on X', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 5, 5), belt('b', 8, 5)] },
      selectedIds: ['a', 'b'],
    }));
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'x' });

    const at = (id: string) => useEditor.getState().plan.placements.find((p) => p.id === id)!.cell;
    expect(at('a')).toEqual({ x: 8, y: 5 });
    expect(at('b')).toEqual({ x: 5, y: 5 });
  });

  it('brings a group back where it started after four presses of R', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 5, 5), belt('b', 6, 5), belt('c', 5, 6)] },
      selectedIds: ['a', 'b', 'c'],
    }));
    render(<GridCanvas />);

    for (let i = 0; i < 4; i++) fireEvent.keyDown(window, { key: 'r' });

    expect(cellsOf()).toEqual(['5,5', '5,6', '6,5']);
  });

  it('undoes a group turn in one press', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 5, 5), belt('b', 6, 5), belt('c', 7, 5)] },
      selectedIds: ['a', 'b', 'c'],
    }));
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'r' });
    useEditor.getState().undo();

    expect(cellsOf()).toEqual(['5,5', '6,5', '7,5']);
  });

  it('refuses a turn that will not fit, leaving the group untouched', () => {
    useEditor.setState((s) => ({
      plan: {
        ...s.plan,
        placements: [belt('a', 5, 5), belt('b', 6, 5), belt('c', 7, 5), belt('x', 6, 6)],
      },
      selectedIds: ['a', 'b', 'c'],
    }));
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'r' });

    expect(cellsOf()).toEqual(['5,5', '6,5', '6,6', '7,5']);
  });
});

// Rotating, mirroring or pasting where the result does not fit says why.
describe('GridCanvas saying why an action did not happen', () => {
  const notice = (c: HTMLElement) => c.querySelector('[role="status"]:not([data-cursor-status])')?.textContent ?? null;

  it('says the result would be outside the warehouse', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 0, 0), belt('b', 1, 0), belt('c', 2, 0)] },
      selectedIds: ['a', 'b', 'c'],
    }));
    const { container } = render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'r' });

    expect(notice(container)).toMatch(/outside the warehouse/i);
  });

  it('says something is in the way when that is the real reason', () => {
    // The two refusals want different answers: one is fixed by moving, the
    // other by clearing a space.
    useEditor.setState((s) => ({
      plan: {
        ...s.plan,
        placements: [belt('a', 5, 5), belt('b', 6, 5), belt('c', 7, 5), belt('x', 6, 6)],
      },
      selectedIds: ['a', 'b', 'c'],
    }));
    const { container } = render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'r' });

    expect(notice(container)).toMatch(/overlaps/i);
  });

  it('says nothing when the action worked', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 5, 5), belt('b', 6, 5), belt('c', 7, 5)] },
      selectedIds: ['a', 'b', 'c'],
    }));
    const { container } = render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'r' });

    expect(notice(container)).toBeNull();
  });

  it('speaks up for a refused paste too', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('blocker', 9, 9)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 9, y: 9 }) });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    // Ctrl+V arms the paste; the click puts it down (see `pasteCell`).
    fireEvent.click(canvas, pointFor({ x: 10, y: 10 }));

    expect(notice(container)).toMatch(/overlaps/i);
  });

  it('translates', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 0, 0), belt('b', 1, 0), belt('c', 2, 0)] },
      selectedIds: ['a', 'b', 'c'],
      locale: 'fr',
    }));
    const { container } = render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'r' });

    expect(notice(container)).toMatch(/en dehors de/i);
  });
});

describe('GridCanvas aiming a paste', () => {
  const cellsOf = () =>
    useEditor.getState().plan.placements.map((p) => `${p.cell.x},${p.cell.y}`).sort();

  const hover = (canvas: Element, cell: { x: number; y: number }) =>
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor(cell) });

  const copyTwo = (canvas: Element) => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('b', 3, 3)] },
      selectedIds: ['a', 'b'],
    }));
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    hover(canvas, { x: 10, y: 10 });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
  };

  it('puts nothing down until you click', () => {
    // Ctrl+V does not commit at once; the paste waits to be aimed.
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    copyTwo(canvas);

    expect(cellsOf()).toEqual(['2,3', '3,3']);
  });

  it('follows the cursor, so the click lands where you aimed', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    copyTwo(canvas);
    hover(canvas, { x: 20, y: 15 });
    fireEvent.click(canvas, pointFor({ x: 20, y: 15 }));

    expect(cellsOf()).toEqual(['2,3', '20,15', '21,15', '3,3']);
  });

  it('is called off by Escape, having placed nothing', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    copyTwo(canvas);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(canvas, pointFor({ x: 10, y: 10 }));

    expect(cellsOf()).toEqual(['2,3', '3,3']);
  });

  it('is called off by a right-click, having placed nothing', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    copyTwo(canvas);
    fireEvent.mouseDown(canvas, { button: 2, ...pointFor({ x: 10, y: 10 }) });
    fireEvent.click(canvas, pointFor({ x: 10, y: 10 }));

    expect(cellsOf()).toEqual(['2,3', '3,3']);
  });

  it('turns the silhouette with R, leaving the real objects alone', () => {
    // While a paste is aimed, R turns the paste, not the selection.
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    copyTwo(canvas);
    fireEvent.keyDown(window, { key: 'r' });

    // The plan is untouched...
    expect(useEditor.getState().plan.placements.every((p) => p.rotation === 0)).toBe(true);
    // ...and what is about to be pasted has turned.
    expect(useEditor.getState().clipboard.every((e) => e.rotation === 90)).toBe(true);
  });

  it('flips the silhouette with X', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    copyTwo(canvas);
    fireEvent.keyDown(window, { key: 'x' });

    expect(useEditor.getState().plan.placements.some((p) => p.mirrored)).toBe(false);
    expect(useEditor.getState().clipboard.every((e) => e.mirrored)).toBe(true);
  });

  it('drops the turned shape where it is aimed', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    copyTwo(canvas);
    fireEvent.keyDown(window, { key: 'r' });
    hover(canvas, { x: 20, y: 15 });
    fireEvent.click(canvas, pointFor({ x: 20, y: 15 }));

    // The pair stood up: one cell wide, two tall, not two wide.
    expect(cellsOf()).toEqual(['2,3', '20,15', '20,16', '3,3']);
  });

  it('leaves the plan alone when R is pressed while aiming', () => {
    // While a paste is aimed, R must not edit the plan being copied from.
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    copyTwo(canvas);
    const before = useEditor.getState().plan.placements.map((p) => p.rotation);
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: 'x' });

    expect(useEditor.getState().plan.placements.map((p) => p.rotation)).toEqual(before);
    expect(cellsOf()).toEqual(['2,3', '3,3']);
  });

  it('ignores Ctrl+V when nothing has been copied', () => {
    useEditor.setState({ clipboard: [] });
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    hover(canvas, { x: 10, y: 10 });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    fireEvent.click(canvas, pointFor({ x: 10, y: 10 }));

    expect(cellsOf()).toEqual([]);
  });
});

// V flips top-to-bottom, H flips left-to-right (like X). Both act wherever X
// acts: on a placed selection, an aimed paste, and a dragged selection.
describe('GridCanvas flipping with H and V', () => {
  const cellOf = (id: string) =>
    useEditor.getState().plan.placements.find((p) => p.id === id)?.cell;

  // A column, so a vertical flip moves it and a horizontal one cannot.
  const column = () => [belt('a', 4, 4), belt('b', 4, 5), belt('c', 4, 6)];

  it('turns a column upside down on V', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: column() }, selectedIds: ['a', 'b', 'c'],
    }));
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'v' });

    expect(cellOf('a')).toEqual({ x: 4, y: 6 });
    expect(cellOf('c')).toEqual({ x: 4, y: 4 });
  });

  it('leaves that same column where it is on H, which has nothing to swap', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: column() }, selectedIds: ['a', 'b', 'c'],
    }));
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'h' });

    expect(cellOf('a')).toEqual({ x: 4, y: 4 });
    expect(cellOf('c')).toEqual({ x: 4, y: 6 });
  });

  it('flips a row end for end on H, exactly as X does', () => {
    const row = () => [belt('a', 4, 4), belt('b', 5, 4), belt('c', 6, 4)];
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: row() }, selectedIds: ['a', 'b', 'c'],
    }));
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'h' });

    expect(cellOf('a')).toEqual({ x: 6, y: 4 });
    expect(cellOf('c')).toEqual({ x: 4, y: 4 });
  });

  it('puts a group back after two presses of V', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: column() }, selectedIds: ['a', 'b', 'c'],
    }));
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'v' });
    fireEvent.keyDown(window, { key: 'v' });

    expect(cellOf('a')).toEqual({ x: 4, y: 4 });
    expect(cellOf('c')).toEqual({ x: 4, y: 6 });
  });

  it('flips the SILHOUETTE while a paste is being aimed, not the objects', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: column() }, selectedIds: ['a', 'b', 'c'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    fireEvent.mouseMove(canvas, pointFor({ x: 10, y: 10 }));
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'v' });

    // The originals are untouched: V reached the pending paste, not the plan.
    expect(cellOf('a')).toEqual({ x: 4, y: 4 });
    expect(cellOf('c')).toEqual({ x: 4, y: 6 });
  });

  it('flips a selection being dragged, landing with it on release', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: column() }, selectedIds: ['a', 'b', 'c'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 4, y: 5 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 4, y: 5 }) });
    fireEvent.keyDown(window, { key: 'v' });

    // Held, like every other part of an aimed manoeuvre.
    expect(cellOf('a')).toEqual({ x: 4, y: 4 });

    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 4, y: 5 }) });

    expect(cellOf('a')).toEqual({ x: 4, y: 6 });
  });

  it('leaves Ctrl+H and Ctrl+V to the browser and to paste', () => {
    // Ctrl+V is paste; Ctrl+H is the browser's history. Neither may flip.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: column() }, selectedIds: ['a', 'b', 'c'],
    }));
    render(<GridCanvas />);

    fireEvent.keyDown(window, { key: 'h', ctrlKey: true });

    expect(cellOf('a')).toEqual({ x: 4, y: 4 });
  });

  it('does not fire while typing an h or a v into a text box', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: column() }, selectedIds: ['a', 'b', 'c'],
    }));
    render(<GridCanvas />);
    const input = document.createElement('input');
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: 'v' });

    expect(cellOf('a')).toEqual({ x: 4, y: 4 });
    input.remove();
  });
});

// D removes whatever the pointer is over, without selecting first; Delete
// removes the selection.
describe('GridCanvas deleting under the pointer with D', () => {
  const ids = () => useEditor.getState().plan.placements.map((p) => p.id).sort();

  const hover = (canvas: Element, cell: { x: number; y: number }) =>
    fireEvent.mouseMove(canvas, pointFor(cell));

  it('removes the object the pointer is over, and only that one', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('b', 5, 3)] },
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    hover(canvas, { x: 2, y: 3 });
    fireEvent.keyDown(window, { key: 'd' });

    expect(ids()).toEqual(['b']);
  });

  it('needs no selection at all, which is the whole point', () => {
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: [],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    hover(canvas, { x: 2, y: 3 });
    fireEvent.keyDown(window, { key: 'd' });

    expect(ids()).toEqual([]);
  });

  it('takes only what is hovered, leaving a selection around it alone', () => {
    // D ignores the selection; that is Delete's job.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('b', 5, 3), belt('c', 7, 3)] },
      selectedIds: ['a', 'b', 'c'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    hover(canvas, { x: 5, y: 3 });
    fireEvent.keyDown(window, { key: 'd' });

    expect(ids()).toEqual(['a', 'c']);
  });

  it('drops the deleted object out of the selection', () => {
    // A selection holding an id that no longer exists leaves the inspector
    // describing something that is not there.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3), belt('b', 5, 3)] },
      selectedIds: ['a', 'b'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    hover(canvas, { x: 2, y: 3 });
    fireEvent.keyDown(window, { key: 'd' });

    expect(useEditor.getState().selectedIds).toEqual(['b']);
  });

  it('reaches a wide object anywhere on its footprint, not just its anchor', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [rack('r', 4, 3)] } }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    hover(canvas, { x: 4, y: 5 });
    fireEvent.keyDown(window, { key: 'd' });

    expect(ids()).toEqual([]);
  });

  it('does nothing over empty ground', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 2, 3)] } }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    hover(canvas, { x: 9, y: 9 });
    fireEvent.keyDown(window, { key: 'd' });

    expect(ids()).toEqual(['a']);
  });

  it('comes back in one undo', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 2, 3)] } }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    hover(canvas, { x: 2, y: 3 });
    fireEvent.keyDown(window, { key: 'd' });
    useEditor.getState().undo();

    expect(ids()).toEqual(['a']);
  });

  it('holds off while a paste is being aimed', () => {
    // Over a silhouette, D must not delete the hidden object underneath.
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements: [belt('a', 2, 3)] },
      selectedIds: ['a'],
    }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    hover(canvas, { x: 2, y: 3 });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'd' });

    expect(ids()).toEqual(['a']);
  });

  it('leaves Ctrl+D to the browser', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 2, 3)] } }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    hover(canvas, { x: 2, y: 3 });
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true });

    expect(ids()).toEqual(['a']);
  });

  it('does not fire while typing a d into the palette search', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 2, 3)] } }));
    const { container } = render(<GridCanvas />);
    hover(container.querySelector('canvas')!, { x: 2, y: 3 });
    const input = document.createElement('input');
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: 'd' });

    expect(ids()).toEqual(['a']);
    input.remove();
  });
});

// Dragging a run into an existing belt turns the cell where they meet into a
// joiner, the way a turn makes a corner.
describe('GridCanvas joining a run into an existing line', () => {
  const JOINER = 'BP_ConveyorBelt_Joiner';
  const STRAIGHT = 'BP_ConveyorBelt_Straight_Tier1';

  /** An existing line running up the screen (-y) at column x. */
  const line = (x: number, from: number, to: number) => {
    const out = [];
    for (let y = from; y <= to; y++) {
      out.push({
        id: `line${y}`, objectId: STRAIGHT, warehouse: 'main' as const, floor: 0,
        cell: { x, y }, rotation: 0 as const, tier: 1,
      });
    }
    return out;
  };

  const armed = (placements: Placement[]) =>
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements },
      drag: { objectId: STRAIGHT, rotation: 0, mirrored: false, cell: null },
    }));

  const at = (cell: { x: number; y: number }) =>
    useEditor.getState().plan.placements.find((p) => p.cell.x === cell.x && p.cell.y === cell.y);

  it('turns the meeting cell into a joiner instead of skipping it', () => {
    // The run comes in from the left and stops on the line.
    armed(line(8, 2, 10));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 4, y: 6 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 8, y: 6 }) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 8, y: 6 }) });

    expect(at({ x: 8, y: 6 })?.objectId).toBe(JOINER);
  });

  it('joins into a CORNER too, not just a straight', () => {
    // A corner has room for one more arm, like a straight. The corner at (8,2)
    // takes from below and sends west; the new arm comes in from the east.
    const corner = {
      id: 'corner', objectId: 'BP_ConveyorBelt_Corner_Tier1', warehouse: 'main' as const,
      floor: 0, cell: { x: 8, y: 2 }, rotation: 0 as const, tier: 1,
    };
    armed([...line(8, 3, 10), corner]);
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 12, y: 2 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 8, y: 2 }) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 8, y: 2 }) });

    expect(at({ x: 8, y: 2 })?.objectId).toBe(JOINER);
  });

  it('leaves the rest of the line exactly as it was', () => {
    armed(line(8, 2, 10));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 4, y: 6 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 8, y: 6 }) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 8, y: 6 }) });

    expect(at({ x: 8, y: 5 })?.objectId).toBe(STRAIGHT);
    expect(at({ x: 8, y: 7 })?.objectId).toBe(STRAIGHT);
  });

  it('does not touch a line the run merely runs alongside', () => {
    // Parallel, never meeting. Nothing should change.
    armed(line(8, 2, 10));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 6, y: 3 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 6, y: 9 }) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 6, y: 9 }) });

    expect(at({ x: 8, y: 6 })?.objectId).toBe(STRAIGHT);
  });

  it('leaves a belt the run meets head-on alone, since that is no junction', () => {
    // Running UP into a line that also runs up is the same line, not a join.
    armed(line(8, 2, 10));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 8, y: 14 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 8, y: 10 }) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 8, y: 10 }) });

    expect(at({ x: 8, y: 10 })?.objectId).toBe(STRAIGHT);
  });

  it('leaves anything that is not a plain belt alone', () => {
    // A scanner is never swapped for a joiner, as a run never corners one.
    const scanner = [{
      id: 's', objectId: 'BP_ConveyorBelt_Bridger', warehouse: 'main' as const,
      floor: 0, cell: { x: 8, y: 6 }, rotation: 0 as const, tier: 1,
    }];
    armed(scanner);
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 4, y: 6 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 8, y: 6 }) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 8, y: 6 }) });

    expect(at({ x: 8, y: 6 })?.objectId).toBe('BP_ConveyorBelt_Bridger');
  });

  it('undoes the whole run, joiner included, in one press', () => {
    armed(line(8, 2, 10));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 4, y: 6 }) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor({ x: 8, y: 6 }) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 8, y: 6 }) });
    useEditor.getState().undo();

    expect(at({ x: 8, y: 6 })?.objectId).toBe(STRAIGHT);
    expect(at({ x: 6, y: 6 })).toBeUndefined();
  });
});

describe('GridCanvas upgrading a joiner to a three-way', () => {
  const STRAIGHT = 'BP_ConveyorBelt_Straight_Tier1';
  const JOINER = 'BP_ConveyorBelt_Joiner';
  const THREE_WAY = 'BP_ConveyorBelt_Joiner_3Way';

  const line = (x: number, from: number, to: number) => {
    const out = [];
    for (let y = from; y <= to; y++) {
      out.push({
        id: `line${y}`, objectId: STRAIGHT, warehouse: 'main' as const, floor: 0,
        cell: { x, y }, rotation: 0 as const, tier: 1,
      });
    }
    return out;
  };

  const armed = (placements: Placement[]) =>
    useEditor.setState((s) => ({
      plan: { ...s.plan, placements },
      drag: { objectId: STRAIGHT, rotation: 0, mirrored: false, cell: null },
    }));

  const at = (cell: { x: number; y: number }) =>
    useEditor.getState().plan.placements.find((p) => p.cell.x === cell.x && p.cell.y === cell.y);

  /** Drags a run from `from` to `to` in one move. */
  const run = (canvas: Element, from: { x: number; y: number }, to: { x: number; y: number }) => {
    fireEvent.mouseDown(canvas, { button: 0, ...pointFor(from) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor(to) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor(to) });
  };

  it('becomes a three-way when a line arrives on the joiner\'s free side', () => {
    armed(line(8, 2, 10));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    run(canvas, { x: 4, y: 6 }, { x: 8, y: 6 });   // from the left: belt -> joiner
    expect(at({ x: 8, y: 6 })?.objectId).toBe(JOINER);

    run(canvas, { x: 12, y: 6 }, { x: 8, y: 6 });  // from the right: joiner -> 3-way
    expect(at({ x: 8, y: 6 })?.objectId).toBe(THREE_WAY);
  });

  it('leaves the joiner alone when the run arrives where it is already fed', () => {
    // The same side twice is the same line, not a third one.
    armed(line(8, 2, 10));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    run(canvas, { x: 4, y: 6 }, { x: 8, y: 6 });
    run(canvas, { x: 5, y: 6 }, { x: 8, y: 6 });

    expect(at({ x: 8, y: 6 })?.objectId).toBe(JOINER);
  });

  it('keeps the line flowing the same way through both upgrades', () => {
    // The three-way must still emit up the line, or everything above starves.
    armed(line(8, 2, 10));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    run(canvas, { x: 4, y: 6 }, { x: 8, y: 6 });
    run(canvas, { x: 12, y: 6 }, { x: 8, y: 6 });

    const junction = at({ x: 8, y: 6 })!;
    const entry = getCatalogue().get(THREE_WAY)!;
    const out = portFacings(entry, junction.rotation, junction.mirrored ?? false)
      .find((f) => f.dir === 'out')!;
    expect(out.step).toEqual({ dx: 0, dy: -1 });
  });

  it('stops there: a fourth line finds nothing left to upgrade to', () => {
    armed(line(8, 2, 10));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    run(canvas, { x: 4, y: 6 }, { x: 8, y: 6 });
    run(canvas, { x: 12, y: 6 }, { x: 8, y: 6 });
    run(canvas, { x: 8, y: 14 }, { x: 8, y: 10 }); // head-on from below

    expect(at({ x: 8, y: 6 })?.objectId).toBe(THREE_WAY);
  });
});

// Joining works on the click path too, not only on dragged runs.
describe('GridCanvas joining however the belts were placed', () => {
  const STRAIGHT = 'BP_ConveyorBelt_Straight_Tier1';
  const JOINER = 'BP_ConveyorBelt_Joiner';

  // Wrapped in act so React re-renders before the events fire; otherwise the
  // handler's closure still reads the old armed object.
  const arm = () => act(() => {
    useEditor.setState({
      drag: { objectId: STRAIGHT, rotation: 0, mirrored: false, cell: null },
    });
  });

  const at = (c: { x: number; y: number }) =>
    useEditor.getState().plan.placements.find((p) => p.cell.x === c.x && p.cell.y === c.y);

  const run = (canvas: Element, from: { x: number; y: number }, to: { x: number; y: number }) => {
    arm();
    fireEvent.mouseDown(canvas, { button: 0, ...pointFor(from) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor(to) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor(to) });
  };

  /** One click. `quarterTurns` presses R first, with the real key: setState
   * outside a React event can leave the component's closure a render behind. */
  const click = (canvas: Element, c: { x: number; y: number }, quarterTurns = 0) => {
    arm();
    for (let i = 0; i < quarterTurns; i++) fireEvent.keyDown(window, { key: 'r' });
    fireEvent.mouseDown(canvas, { button: 0, ...pointFor(c) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor(c) });
    fireEvent.click(canvas, pointFor(c));
  };

  it('joins when the line was dragged first, then crossed', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;
    run(canvas, { x: 2, y: 6 }, { x: 10, y: 6 });
    run(canvas, { x: 6, y: 10 }, { x: 6, y: 2 });
    expect(at({ x: 6, y: 6 })?.objectId).toBe(JOINER);
  });

  it('joins when the crossing line was there first', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;
    run(canvas, { x: 6, y: 10 }, { x: 6, y: 2 });
    run(canvas, { x: 2, y: 6 }, { x: 6, y: 6 });
    expect(at({ x: 6, y: 6 })?.objectId).toBe(JOINER);
  });

  it('joins with two runs feeding in from opposite sides', () => {
    // Both horizontals point at the junction and the vertical carries on out of it.
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;
    run(canvas, { x: 2, y: 6 }, { x: 6, y: 6 });
    run(canvas, { x: 10, y: 6 }, { x: 6, y: 6 });
    run(canvas, { x: 6, y: 10 }, { x: 6, y: 2 });
    expect(at({ x: 6, y: 6 })?.objectId).toBe(JOINER);
  });

  it('joins on a single CLICK onto the line, which is what was missing', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;
    for (let y = 4; y <= 8; y++) click(canvas, { x: 6, y });
    click(canvas, { x: 6, y: 6 }, 1); // turned across the line
    expect(at({ x: 6, y: 6 })?.objectId).toBe(JOINER);
  });

  it('leaves the line alone when the clicked belt points the same way it does', () => {
    // The same line, not a junction, so a click on a run does not rewrite it.
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;
    for (let y = 4; y <= 8; y++) click(canvas, { x: 6, y });
    click(canvas, { x: 6, y: 6 });
    expect(at({ x: 6, y: 6 })?.objectId).toBe(STRAIGHT);
  });
});

// A run that leaves an existing line turns the cell it leaves from into a
// splitter, mirroring joining.
describe('GridCanvas splitting off an existing line', () => {
  const STRAIGHT = 'BP_ConveyorBelt_Straight_Tier1';
  const SPLITTER = 'BP_ConveyorBelt_Splitter';

  const arm = () => act(() => {
    useEditor.setState({
      drag: { objectId: STRAIGHT, rotation: 0, mirrored: false, cell: null },
    });
  });

  const at = (c: { x: number; y: number }) =>
    useEditor.getState().plan.placements.find((p) => p.cell.x === c.x && p.cell.y === c.y);

  const run = (canvas: Element, from: { x: number; y: number }, to: { x: number; y: number }) => {
    arm();
    fireEvent.mouseDown(canvas, { button: 0, ...pointFor(from) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor(to) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor(to) });
  };

  it('turns the cell a branch leaves from into a splitter', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;
    run(canvas, { x: 6, y: 10 }, { x: 6, y: 2 });   // a line up the screen
    run(canvas, { x: 6, y: 6 }, { x: 10, y: 6 });   // branching off it, rightwards
    expect(at({ x: 6, y: 6 })?.objectId).toBe(SPLITTER);
  });

  it('leaves the rest of the line alone', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;
    run(canvas, { x: 6, y: 10 }, { x: 6, y: 2 });
    run(canvas, { x: 6, y: 6 }, { x: 10, y: 6 });
    expect(at({ x: 6, y: 5 })?.objectId).toBe(STRAIGHT);
    expect(at({ x: 6, y: 7 })?.objectId).toBe(STRAIGHT);
  });

  it('lays the branch itself, not only the splitter', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;
    run(canvas, { x: 6, y: 10 }, { x: 6, y: 2 });
    run(canvas, { x: 6, y: 6 }, { x: 10, y: 6 });
    expect(at({ x: 8, y: 6 })?.objectId).toBe(STRAIGHT);
  });

  it('does nothing on empty ground, where a run just starts', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;
    run(canvas, { x: 3, y: 3 }, { x: 7, y: 3 });
    expect(at({ x: 3, y: 3 })?.objectId).toBe(STRAIGHT);
  });

  it('leaves a line alone when the branch sets off ALONG it', () => {
    // Straight on is not a branch, it is the same line.
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;
    run(canvas, { x: 6, y: 10 }, { x: 6, y: 2 });
    run(canvas, { x: 6, y: 6 }, { x: 6, y: 3 });
    expect(at({ x: 6, y: 6 })?.objectId).toBe(STRAIGHT);
  });
});

// The transport controls send parcels in at every delivery door and run them
// through the layout at the game's pace (see src/core/live-sim.ts).
describe('GridCanvas following parcels', () => {
  const STRAIGHT = 'BP_ConveyorBelt_Straight_Tier1';

  /**
   * A line the first delivery door feeds: a door feeds a belt on the door's
   * own cell, (2,19), at rotation 0 (see graph.ts).
   */
  const fedLine = (length: number) =>
    Array.from({ length }, (_, i) => ({
      id: `b${i}`, objectId: STRAIGHT, warehouse: 'main' as const, floor: 0,
      cell: { x: 2, y: 19 - i }, rotation: 0 as const, tier: 1,
    }));

  const play = () => fireEvent.click(screen.getByRole('button', { name: /play/i }));

  it('offers the controls at the foot of the canvas', () => {
    render(<GridCanvas />);
    expect(screen.getByRole('button', { name: /play/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /speed/i })).toBeTruthy();
  });

  it('keeps the controls off a phone, which only shows a plan', () => {
    render(<GridCanvas />);
    const bar = screen.getByRole('button', { name: /play/i }).parentElement!;
    // Hidden below the md breakpoint, shown from it up.
    expect(bar.className.split(' ')).toEqual(expect.arrayContaining(['hidden', 'md:flex']));
    expect(bar.className.split(' ')).not.toContain('flex');
  });

  it('changes nothing in the plan, it only looks', () => {
    // Following parcels must never edit the plan.
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: fedLine(4) } }));
    const before = JSON.stringify(useEditor.getState().plan);
    render(<GridCanvas />);

    play();

    expect(JSON.stringify(useEditor.getState().plan)).toBe(before);
    expect(useEditor.getState().undoStack).toHaveLength(0);
  });

  it('sends a parcel in without anything being selected', () => {
    // Play starts at the doors, so it needs no selection and no pointer.
    const realRaf = window.requestAnimationFrame;
    try {
      const frames = fakeFrames();
      useEditor.setState((s) => ({ plan: { ...s.plan, placements: fedLine(4) }, selectedIds: [] }));
      const { container } = render(<GridCanvas />);

      play();
      runClock(frames);

      expect(simStats()?.onBelt).toBeGreaterThan(0);
    } finally {
      window.requestAnimationFrame = realRaf;
    }
  });

  it('says nothing when no door feeds anything', () => {
    // An unfed line is not reported as a failure.
    useEditor.setState((s) => ({
      plan: {
        ...s.plan,
        placements: [{
          id: 'lonely', objectId: STRAIGHT, warehouse: 'main' as const, floor: 0,
          cell: { x: 30, y: 20 }, rotation: 0 as const, tier: 1,
        }],
      },
    }));
    render(<GridCanvas />);

    play();

    expect(simStats()).toBeNull();
  });

  it('does nothing at all on an empty plan', () => {
    render(<GridCanvas />);
    play();
    expect(simStats()).toBeNull();
  });

  it('cycles the speed, and says which one it is on', () => {
    render(<GridCanvas />);
    const speed = screen.getByRole('button', { name: /speed/i });
    expect(speed.textContent).toContain('1');
    fireEvent.click(speed);
    expect(speed.textContent).toContain('2');
    fireEvent.click(speed);
    expect(speed.textContent).toContain('4');
    fireEvent.click(speed);
    expect(speed.textContent).toContain('8');
    fireEvent.click(speed);
    expect(speed.textContent).toContain('1');
  });

  it('turns into pause while parcels are running, and back after', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: fedLine(4) } }));
    render(<GridCanvas />);

    play();
    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(screen.getByRole('button', { name: /play/i })).toBeTruthy();
  });

  it('clears everything on stop', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: fedLine(4) } }));
    const { container } = render(<GridCanvas />);

    play();
    fireEvent.click(screen.getByRole('button', { name: /stop/i }));

    expect(simStats()).toBeNull();
  });
  it('survives a frame timestamped BEFORE the clock started', () => {
    // requestAnimationFrame reports when the frame began, which can precede a
    // performance.now() read, so a first step can be negative. The fake clock
    // starts at 0 while the real one is large, reproducing that.
    const frames: FrameRequestCallback[] = [];
    const realRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    }) as typeof window.requestAnimationFrame;

    try {
      useEditor.setState((s) => ({ plan: { ...s.plan, placements: fedLine(3) } }));
      const { container } = render(<GridCanvas />);
      play();

      let now = 0;
      for (let i = 0; i < 8 && frames.length > 0; i++) {
        now += 300;
        act(() => { frames.shift()!(now); });
      }

      // Still standing, and still able to say what happened.
      expect(simStats()?.onBelt).toBeGreaterThan(0);
    } finally {
      window.requestAnimationFrame = realRaf;
    }
  });
  /**
   * A line running the full height of the warehouse, from the delivery door
   * at (2,19) up to the export door at (2,0): a working layout.
   */
  const doorToDoor = () =>
    Array.from({ length: 20 }, (_, i) => ({
      id: `d${i}`, objectId: STRAIGHT, warehouse: 'main' as const, floor: 0,
      cell: { x: 2, y: 19 - i }, rotation: 0 as const, tier: 1,
    }));

  /** Runs the animation clock far enough for every parcel to finish. */
  const runClock = (frames: FrameRequestCallback[], steps = 60) => {
    let now = 0;
    for (let i = 0; i < steps && frames.length > 0; i++) {
      now += 250;
      act(() => { frames.shift()!(now); });
    }
  };

  const fakeFrames = () => {
    const frames: FrameRequestCallback[] = [];
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    }) as typeof window.requestAnimationFrame;
    return frames;
  };

  it('says a parcel reaching an export door was DELIVERED, not lost', () => {
    // An export door has nothing leading out, yet parcels reaching it are
    // delivered, not lost.
    const realRaf = window.requestAnimationFrame;
    try {
      const frames = fakeFrames();
      useEditor.setState((s) => ({ plan: { ...s.plan, placements: doorToDoor() } }));
      const { container } = render(<GridCanvas />);
      play();
      // A tier 1 belt takes 2 s a cell, as in the game: 21 cells take 42 s.
      runClock(frames, 200);

      expect(simStats()?.delivered).toBeGreaterThan(0);
      expect(simStats()?.fell).toBe(0);
    } finally {
      window.requestAnimationFrame = realRaf;
    }
  });

  it('keeps sending waves instead of stopping after one', () => {
    // Several waves, not one: the clock keeps running after the first parcels
    // finish.
    const realRaf = window.requestAnimationFrame;
    try {
      const frames = fakeFrames();
      useEditor.setState((s) => ({ plan: { ...s.plan, placements: doorToDoor() } }));
      const { container } = render(<GridCanvas />);
      play();
      // The count must grow: the clock asking for frames alone proves nothing.
      const delivered = () => simStats()?.delivered ?? 0;
      // A tier 1 belt takes 2 s a cell, as in the game: 21 cells take 42 s.
      runClock(frames, 200);
      const afterOne = delivered();
      runClock(frames, 120);

      expect(afterOne).toBeGreaterThan(0);
      expect(delivered()).toBeGreaterThan(afterOne);
    } finally {
      window.requestAnimationFrame = realRaf;
    }
  });
  it('fills the belt end to end, one parcel a cell, losing none in the middle', () => {
    // A parcel exists until it arrives somewhere, so a 20-cell line ends up
    // holding about 20 of them.
    const realRaf = window.requestAnimationFrame;
    try {
      const frames = fakeFrames();
      useEditor.setState((s) => ({ plan: { ...s.plan, placements: doorToDoor() } }));
      const { container } = render(<GridCanvas />);
      play();
      runClock(frames, 200);

      const inFlight = simStats()?.onBelt ?? 0;
      expect(inFlight).toBeGreaterThan(12);
    } finally {
      window.requestAnimationFrame = realRaf;
    }
  });
});

// A bridge passes over its middle cell, so a belt can run underneath; a plain
// click selects the visible bridge, and Alt+click reaches the belt.
describe('GridCanvas selecting what is under a bridge', () => {
  const BRIDGE = 'BP_ConveyorBelt_Bridger';
  const STRAIGHT = 'BP_ConveyorBelt_Straight_Tier1';

  /** A bridge anchored at (8,4), so it spans (8,4)-(8,6) and passes over
   * (8,5). A belt on (8,5) runs underneath it, which occupancy allows. */
  const crossing = () => [
    { id: 'bridge', objectId: BRIDGE, warehouse: 'main' as const, floor: 0,
      cell: { x: 8, y: 4 }, rotation: 0 as const, tier: 1 },
    { id: 'under', objectId: STRAIGHT, warehouse: 'main' as const, floor: 0,
      cell: { x: 8, y: 5 }, rotation: 90 as const, tier: 1 },
  ];

  const clickAt = (canvas: Element, cell: { x: number; y: number }, alt = false) => {
    fireEvent.mouseDown(canvas, { button: 0, ...pointFor(cell) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor(cell) });
    fireEvent.click(canvas, { button: 0, altKey: alt, ...pointFor(cell) });
  };

  it('still selects the bridge on a plain click', () => {
    // Unchanged on purpose: a click selects what you can see.
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: crossing() }, selectedIds: [] }));
    const { container } = render(<GridCanvas />);
    clickAt(container.querySelector('canvas')!, { x: 8, y: 5 });
    expect(useEditor.getState().selectedIds).toEqual(['bridge']);
  });

  it('selects the conveyor underneath with Alt held', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: crossing() }, selectedIds: [] }));
    const { container } = render(<GridCanvas />);
    clickAt(container.querySelector('canvas')!, { x: 8, y: 5 }, true);
    expect(useEditor.getState().selectedIds).toEqual(['under']);
  });

  it('changes nothing where there is only one object', () => {
    // Alt must not become a second, subtly different way to click.
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [crossing()[1]!] }, selectedIds: [] }));
    const { container } = render(<GridCanvas />);
    clickAt(container.querySelector('canvas')!, { x: 8, y: 5 }, true);
    expect(useEditor.getState().selectedIds).toEqual(['under']);
  });
});

// Notes on cells, reached from the right-click menu, which is easier to
// discover than a shortcut.
describe('GridCanvas leaving notes', () => {
  const noteAt = (cell: { x: number; y: number }) =>
    (useEditor.getState().plan.notes ?? []).find(
      (n) => n.cell.x === cell.x && n.cell.y === cell.y,
    );

  /** A right-click that never moved: press and release. A right-drag pans, so
   * the gesture is decided on the way up. */
  const rightClick = (canvas: Element, cell: { x: number; y: number }) => {
    fireEvent.mouseDown(canvas, { button: 2, ...pointFor(cell) });
    fireEvent.mouseUp(canvas, { button: 2, ...pointFor(cell) });
  };

  const openNote = (canvas: Element, cell: { x: number; y: number }) => {
    rightClick(canvas, cell);
    fireEvent.click(screen.getByRole('menuitem', { name: /note/i }));
  };

  it('offers a note on the cell that was right-clicked', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    openNote(canvas, { x: 6, y: 7 });
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'rail line goes here' } });
    fireEvent.blur(box);

    expect(noteAt({ x: 6, y: 7 })?.text).toBe('rail line goes here');
  });

  it('reopens an existing note with its text, rather than starting a new one', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;
    openNote(canvas, { x: 6, y: 7 });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'first' } });
    fireEvent.blur(screen.getByRole('textbox'));

    openNote(canvas, { x: 6, y: 7 });
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('first');
  });

  it('says EDIT once there is one there', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;
    openNote(canvas, { x: 6, y: 7 });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'first' } });
    fireEvent.blur(screen.getByRole('textbox'));

    rightClick(canvas, { x: 6, y: 7 });
    expect(screen.getByRole('menuitem', { name: /note/i }).textContent).toMatch(/edit/i);
  });

  it('closes on Escape without writing anything', () => {
    const { container } = render(<GridCanvas />);
    openNote(container.querySelector('canvas')!, { x: 6, y: 7 });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'never mind' } });

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

    expect(noteAt({ x: 6, y: 7 })).toBeUndefined();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('empties to delete', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;
    openNote(canvas, { x: 6, y: 7 });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'temporary' } });
    fireEvent.blur(screen.getByRole('textbox'));

    openNote(canvas, { x: 6, y: 7 });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    fireEvent.blur(screen.getByRole('textbox'));

    expect(noteAt({ x: 6, y: 7 })).toBeUndefined();
  });
});

describe('GridCanvas showing a note on hover', () => {
  const write = (cell: { x: number; y: number }, text: string) => {
    useEditor.setState((s) => ({
      plan: {
        ...s.plan,
        notes: [{ id: 'n', warehouse: 'main' as const, floor: 0, cell, text }],
      },
    }));
  };

  it('shows the text when the pointer rests on the note', () => {
    // The grid mark only says a note exists; hovering shows the text.
    write({ x: 6, y: 7 }, 'rail line goes here');
    const { container } = render(<GridCanvas />);

    fireEvent.mouseMove(container.querySelector('canvas')!, pointFor({ x: 6, y: 7 }));

    expect(screen.getByRole('tooltip').textContent).toContain('rail line goes here');
  });

  it('shows it over bare floor, where there is no object to hover', () => {
    write({ x: 20, y: 20 }, 'nothing here yet');
    const { container } = render(<GridCanvas />);

    fireEvent.mouseMove(container.querySelector('canvas')!, pointFor({ x: 20, y: 20 }));

    expect(screen.getByRole('tooltip').textContent).toContain('nothing here yet');
  });

  it('says nothing on a cell without one', () => {
    write({ x: 6, y: 7 }, 'over here');
    const { container } = render(<GridCanvas />);

    fireEvent.mouseMove(container.querySelector('canvas')!, pointFor({ x: 9, y: 9 }));

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('keeps a note on another floor to itself', () => {
    write({ x: 6, y: 7 }, 'upstairs');
    useEditor.setState((s) => ({
      plan: { ...s.plan, notes: [{ ...s.plan.notes![0]!, floor: 1 }] },
    }));
    const { container } = render(<GridCanvas />);

    fireEvent.mouseMove(container.querySelector('canvas')!, pointFor({ x: 6, y: 7 }));

    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('GridCanvas hover card while dragging', () => {
  const belt = (id: string, x: number, y: number) => ({
    id, objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'main' as const,
    floor: 0, cell: { x, y }, rotation: 0 as const, tier: 1,
  });

  it('gets out of the way once a box selection starts', () => {
    // The hover card hides during a box selection rather than freezing over it.
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 5, 5)] } }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseMove(canvas, pointFor({ x: 5, y: 5 }));
    expect(screen.getByRole('tooltip')).toBeTruthy();

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 5, y: 5 }) });
    fireEvent.mouseMove(canvas, pointFor({ x: 9, y: 9 }));

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('comes back once the drag is over', () => {
    // Hidden while dragging, not disabled: it returns once the gesture ends.
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 5, 5)] } }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 9, y: 9 }) });
    fireEvent.mouseMove(canvas, pointFor({ x: 7, y: 7 }));
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 7, y: 7 }) });

    fireEvent.mouseMove(canvas, pointFor({ x: 5, y: 5 }));

    expect(screen.getByRole('tooltip')).toBeTruthy();
  });
});

describe('GridCanvas reserving a zone', () => {
  // The same full browser sequence as the box-selection tests above,
  // including the click the browser fires after a drag.
  const dragBox = (canvas: Element, from: { x: number; y: number }, to: { x: number; y: number }) => {
    fireEvent.mouseDown(canvas, { button: 0, ...pointFor(from) });
    fireEvent.mouseMove(canvas, { button: 0, ...pointFor(to) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor(to) });
    fireEvent.click(canvas, pointFor(to));
  };
  const rightClick = (canvas: Element, cell: { x: number; y: number }) => {
    fireEvent.mouseDown(canvas, { button: 2, ...pointFor(cell) });
    fireEvent.mouseUp(canvas, { button: 2, ...pointFor(cell) });
  };
  const reserveItem = () => screen.queryByRole('menuitem', { name: /reserve/i });
  const zones = () => useEditor.getState().plan.placements.filter((p) => p.objectId.startsWith('zone-'));

  it('reserves a box drawn over empty floor, from the right-click menu', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    dragBox(canvas, { x: 1, y: 1 }, { x: 4, y: 2 });
    rightClick(canvas, { x: 2, y: 2 });
    fireEvent.click(reserveItem()!);

    expect(zones()).toEqual([expect.objectContaining({
      objectId: 'zone-4x2', warehouse: 'main', floor: 0, cell: { x: 1, y: 1 }, rotation: 0,
    })]);
    // Selected straight away, so the inspector is open on it for naming.
    expect(useEditor.getState().selectedIds).toEqual([zones()[0]!.id]);
  });

  it('reserves it whichever corner the box was drawn from', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    dragBox(canvas, { x: 4, y: 2 }, { x: 1, y: 1 });
    rightClick(canvas, { x: 3, y: 1 });
    fireEvent.click(reserveItem()!);

    expect(zones()[0]).toMatchObject({ objectId: 'zone-4x2', cell: { x: 1, y: 1 } });
  });

  it('only offers it inside the box', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    dragBox(canvas, { x: 1, y: 1 }, { x: 4, y: 2 });
    rightClick(canvas, { x: 9, y: 9 });

    expect(reserveItem()).toBeNull();
  });

  it('does not offer it for a box that caught objects, which is a selection', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [belt('a', 2, 2)] } }));
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    dragBox(canvas, { x: 1, y: 1 }, { x: 4, y: 3 });
    rightClick(canvas, { x: 2, y: 2 });

    expect(reserveItem()).toBeNull();
    expect(useEditor.getState().selectedIds).toEqual(['a']);
  });

  it('lets the box go on the next click', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    dragBox(canvas, { x: 1, y: 1 }, { x: 4, y: 2 });
    fireEvent.mouseDown(canvas, { button: 0, ...pointFor({ x: 9, y: 9 }) });
    fireEvent.mouseUp(canvas, { button: 0, ...pointFor({ x: 9, y: 9 }) });
    rightClick(canvas, { x: 2, y: 2 });

    expect(reserveItem()).toBeNull();
  });

  it('lets the box go on Escape', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    dragBox(canvas, { x: 1, y: 1 }, { x: 4, y: 2 });
    fireEvent.keyDown(window, { key: 'Escape' });
    rightClick(canvas, { x: 2, y: 2 });

    expect(reserveItem()).toBeNull();
  });

  it('refuses a box running off the warehouse, and says why', () => {
    // The main warehouse is 50 wide; this box reaches x = 52.
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    dragBox(canvas, { x: 46, y: 1 }, { x: 52, y: 2 });
    rightClick(canvas, { x: 47, y: 1 });
    fireEvent.click(reserveItem()!);

    expect(zones()).toEqual([]);
    expect(useEditor.getState().notice?.reason).toBe('out-of-bounds');
  });

  it('is undone in one step', () => {
    const { container } = render(<GridCanvas />);
    const canvas = container.querySelector('canvas')!;

    dragBox(canvas, { x: 1, y: 1 }, { x: 4, y: 2 });
    rightClick(canvas, { x: 2, y: 2 });
    fireEvent.click(reserveItem()!);
    act(() => useEditor.getState().undo());

    expect(zones()).toEqual([]);
  });

  it('shows the name and size of a zone on hover, not ports or a tier', () => {
    useEditor.setState((s) => ({
      plan: {
        ...s.plan,
        placements: [{
          id: 'z', objectId: 'zone-4x2', warehouse: 'main', floor: 0,
          cell: { x: 1, y: 1 }, rotation: 0, tier: 1, label: 'Sorting desk',
        }],
      },
    }));
    const { container } = render(<GridCanvas />);

    fireEvent.mouseMove(container.querySelector('canvas')!, pointFor({ x: 3, y: 2 }));

    const card = screen.getByRole('tooltip').textContent ?? '';
    expect(card).toContain('Sorting desk');
    expect(card).toContain('4×2');
    expect(card).not.toMatch(/ports/i);
    expect(card).not.toMatch(/tier/i);
  });
});
