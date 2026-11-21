import { describe, it, expect, beforeEach } from 'vitest';
import { draggedPlacement, useEditor } from './editor';
import type { Placement, Plan } from '@/core/types';

const mainA: Placement = {
  id: 'a', objectId: 'belt', warehouse: 'main', floor: 0, cell: { x: 0, y: 0 }, rotation: 0, tier: 1,
};
const mainB: Placement = {
  id: 'b', objectId: 'belt', warehouse: 'main', floor: 0, cell: { x: 1, y: 0 }, rotation: 0, tier: 1,
};

const basePlan = (over: Partial<Plan> = {}): Plan => ({
  gameVersion: 'test', warehouse: 'main',
  placements: [], ...over,
});

beforeEach(() => {
  useEditor.setState({
    plan: basePlan(),
    floor: 0, locale: 'en', selectedIds: [], drag: null, budget: null,
    undoStack: [], redoStack: [],
    // Reset too: with sharedOverWork left set, dispatch holds every edit and
    // later tests in this file silently do nothing.
    sharedOverWork: false, heldEdit: null,
  });
});

describe('setWarehouse', () => {
  it('only changes plan.warehouse: placements from the first warehouse survive the switch', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [mainA, mainB] } }));

    useEditor.getState().setWarehouse('second');

    expect(useEditor.getState().plan.warehouse).toBe('second');
    expect(useEditor.getState().plan.placements).toEqual([mainA, mainB]);
  });

  it('switching to the second warehouse and back leaves the first warehouse untouched', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [mainA, mainB] } }));

    useEditor.getState().setWarehouse('second');
    const secondPlacement: Placement = {
      id: 'c', objectId: 'belt', warehouse: 'second', floor: 0, cell: { x: 2, y: 2 }, rotation: 0, tier: 1,
    };
    useEditor.getState().dispatch({ kind: 'add', placement: secondPlacement });

    useEditor.getState().setWarehouse('main');

    const { plan } = useEditor.getState();
    expect(plan.warehouse).toBe('main');
    // Both main placements are intact, and the second warehouse's placement
    // stays in the plan although that building is not being viewed.
    expect(plan.placements).toEqual(expect.arrayContaining([mainA, mainB, secondPlacement]));
    expect(plan.placements).toHaveLength(3);
  });

  it('is undoable', () => {
    useEditor.getState().setWarehouse('second');
    expect(useEditor.getState().plan.warehouse).toBe('second');

    useEditor.getState().undo();
    expect(useEditor.getState().plan.warehouse).toBe('main');
  });

  it('does not strand a placement that no longer fits the target warehouse\'s dimensions', () => {
    // Each placement carries its own warehouse, so switching never touches a
    // placement outside the other warehouse's bounds.
    const farOut: Placement = {
      id: 'far', objectId: 'belt', warehouse: 'main', floor: 0, cell: { x: 19, y: 19 }, rotation: 0, tier: 1,
    };
    useEditor.setState((s) => ({ plan: { ...s.plan, placements: [farOut] } }));

    useEditor.getState().setWarehouse('second');

    expect(useEditor.getState().plan.placements).toEqual([farOut]);
  });
});

describe('draggedPlacement', () => {
  const oneCell = { w: 1, h: 1 };

  it('stamps the given warehouse onto the new placement', () => {
    const placement = draggedPlacement(
      { objectId: 'belt', rotation: 0, mirrored: false, cell: { x: 3, y: 3 } },
      0, 'second', oneCell,
    );
    expect(placement?.warehouse).toBe('second');
  });

  it('anchors a single-cell object on the very cell under the pointer', () => {
    const placement = draggedPlacement(
      { objectId: 'belt', rotation: 0, mirrored: false, cell: { x: 3, y: 3 } },
      0, 'main', oneCell,
    );
    expect(placement?.cell).toEqual({ x: 3, y: 3 });
  });

  it('centres a 1x3 object on the pointer instead of hanging it off its corner', () => {
    const placement = draggedPlacement(
      { objectId: 'long', rotation: 0, mirrored: false, cell: { x: 3, y: 3 } },
      0, 'main', { w: 1, h: 3 },
    );
    // Anchor a cell above the pointer, so the object covers y = 2, 3, 4 with
    // the pointer on its middle cell.
    expect(placement?.cell).toEqual({ x: 3, y: 2 });
  });

  it('re-centres along the other axis once the object is turned', () => {
    const placement = draggedPlacement(
      { objectId: 'long', rotation: 90, mirrored: false, cell: { x: 3, y: 3 } },
      0, 'main', { w: 1, h: 3 },
    );
    expect(placement?.cell).toEqual({ x: 2, y: 3 });
  });

  it('carries the drag\'s mirror flag onto the placement', () => {
    const placement = draggedPlacement(
      { objectId: 'belt', rotation: 0, mirrored: true, cell: { x: 0, y: 0 } },
      0, 'main', oneCell,
    );
    expect(placement?.mirrored).toBe(true);
  });
});

describe('clearPlan', () => {
  const second: Placement = { ...mainA, id: 'c', warehouse: 'second' };

  it('removes everything, in BOTH warehouses', () => {
    // Clearing covers both warehouses: the status bar total counts both.
    useEditor.setState({ plan: basePlan({ placements: [mainA, mainB, second] }) });
    useEditor.getState().clearPlan();
    expect(useEditor.getState().plan.placements).toEqual([]);
  });

  it('comes back in a single undo', () => {
    // It is an ordinary edit, not a reset, so an accidental confirmation can
    // be undone.
    useEditor.setState({ plan: basePlan({ placements: [mainA, mainB, second] }) });
    useEditor.getState().clearPlan();
    useEditor.getState().undo();
    expect(useEditor.getState().plan.placements).toHaveLength(3);
  });

  it('leaves the selection empty afterwards', () => {
    useEditor.setState({ plan: basePlan({ placements: [mainA] }), selectedIds: ['a'] });
    useEditor.getState().clearPlan();
    expect(useEditor.getState().selectedIds).toEqual([]);
  });

  it('keeps what is not a placement — the warehouse, the tiers, the budget', () => {
    // Owned expansions are a fact about the player's game, not the layout.
    useEditor.setState({
      plan: basePlan({ placements: [mainA], warehouse: 'second', ownedTiers: [0, 1] }),
      budget: 5000,
    });
    useEditor.getState().clearPlan();
    const { plan, budget } = useEditor.getState();
    expect(plan.warehouse).toBe('second');
    expect(plan.ownedTiers).toEqual([0, 1]);
    expect(budget).toBe(5000);
  });

  it('does nothing at all on an already-empty plan', () => {
    // No undo entry either, so undo does not reverse an earlier edit.
    useEditor.setState({ plan: basePlan(), undoStack: [] });
    useEditor.getState().clearPlan();
    expect(useEditor.getState().undoStack).toHaveLength(0);
  });

  it('is held back while someone else\'s shared plan is on screen', () => {
    // It writes to storage like any edit, so it can replace the visitor's
    // saved warehouse too (see sharedOverWork).
    useEditor.setState({
      plan: basePlan({ placements: [mainA] }),
      sharedOverWork: true, heldEdit: null,
    });
    useEditor.getState().clearPlan();
    expect(useEditor.getState().plan.placements).toHaveLength(1);
    expect(useEditor.getState().heldEdit).not.toBeNull();
  });
});

describe('writing a note', () => {
  const at = { x: 3, y: 4 };
  const notes = () => useEditor.getState().plan.notes ?? [];

  it('writes one where there was none', () => {
    useEditor.getState().writeNote(at, 'rail here');
    expect(notes()).toHaveLength(1);
    expect(notes()[0]?.text).toBe('rail here');
  });

  it('changes the one already there instead of stacking another', () => {
    useEditor.getState().writeNote(at, 'first');
    useEditor.getState().writeNote(at, 'second');
    expect(notes()).toHaveLength(1);
    expect(notes()[0]?.text).toBe('second');
  });

  it('deletes it when the box is emptied', () => {
    // Empty text deletes the note, leaving no blank square.
    useEditor.getState().writeNote(at, 'temporary');
    useEditor.getState().writeNote(at, '   ');
    expect(notes()).toHaveLength(0);
  });

  it('does nothing at all when nothing was typed', () => {
    useEditor.getState().writeNote(at, '');
    expect(notes()).toHaveLength(0);
    expect(useEditor.getState().undoStack).toHaveLength(0);
  });

  it('does nothing when the box is closed unchanged', () => {
    // Opening a note to read it must not add an undo entry.
    useEditor.getState().writeNote(at, 'unchanged');
    const before = useEditor.getState().undoStack.length;
    useEditor.getState().writeNote(at, 'unchanged');
    expect(useEditor.getState().undoStack).toHaveLength(before);
  });

  it('undoes like any other edit', () => {
    useEditor.getState().writeNote(at, 'gone in a moment');
    useEditor.getState().undo();
    expect(notes()).toHaveLength(0);
  });

  it('keeps notes on other floors out of the way', () => {
    useEditor.getState().writeNote(at, 'ground');
    useEditor.setState({ floor: 1 });
    useEditor.getState().writeNote(at, 'upstairs');
    expect(notes()).toHaveLength(2);
  });
});

describe('moveDrag', () => {
  it('leaves the state untouched while the pointer stays on one cell', () => {
    useEditor.getState().startDrag('belt');
    useEditor.getState().moveDrag({ x: 2, y: 3 });
    const before = useEditor.getState();
    let notified = 0;
    const stop = useEditor.subscribe(() => { notified += 1; });
    useEditor.getState().moveDrag({ x: 2, y: 3 });
    stop();
    expect(notified).toBe(0);
    expect(useEditor.getState()).toBe(before);
  });

  it('moves to a new cell', () => {
    useEditor.getState().startDrag('belt');
    useEditor.getState().moveDrag({ x: 2, y: 3 });
    useEditor.getState().moveDrag({ x: 4, y: 3 });
    expect(useEditor.getState().drag?.cell).toEqual({ x: 4, y: 3 });
  });

  it('does nothing without a drag', () => {
    const before = useEditor.getState();
    useEditor.getState().moveDrag({ x: 1, y: 1 });
    expect(useEditor.getState()).toBe(before);
  });
});
