// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { STORAGE_KEY, useEditor } from './editor';
import type { Placement, Plan } from '@/core/types';

/**
 * Opening someone else's link must not cost the visitor their own warehouse.
 * These tests are about the storage key: what is in it and when it may change.
 */

const belt = (id: string, x: number): Placement => ({
  id, objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'main',
  floor: 0, cell: { x, y: 0 }, rotation: 0, tier: 1,
});

const plan = (placements: Placement[]): Plan => ({
  gameVersion: 'test', warehouse: 'main', placements,
});

const mine = plan([belt('mine-1', 0), belt('mine-2', 1)]);
const theirs = plan([belt('theirs-1', 5)]);

/** What is actually in storage right now. */
const stored = (): Plan | null => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as Plan);
};

const storedIds = () => stored()?.placements.map((p) => p.id) ?? null;

beforeEach(() => {
  window.localStorage.clear();
  useEditor.setState({
    plan: plan([]), floor: 0, locale: 'en', selectedIds: [], drag: null,
    marquee: null, clipboard: [], notice: null, budget: null,
    undoStack: [], redoStack: [], sharedOverWork: false, heldEdit: null,
  });
});

describe('opening a shared plan with nothing of your own saved', () => {
  it('just loads it, like any other plan', () => {
    useEditor.getState().loadSharedPlan(theirs);

    expect(useEditor.getState().plan.placements).toHaveLength(1);
    expect(useEditor.getState().sharedOverWork).toBe(false);
    expect(storedIds()).toEqual(['theirs-1']);
  });

  it('treats an empty saved plan as nothing of your own', () => {
    // A first-time visitor's stored plan has no placements; warning about it
    // would be noise.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan([])));

    useEditor.getState().loadSharedPlan(theirs);

    expect(useEditor.getState().sharedOverWork).toBe(false);
  });
});

describe('opening a shared plan over work you already had', () => {
  beforeEach(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mine));
    useEditor.getState().loadSharedPlan(theirs);
  });

  it('shows you their plan', () => {
    expect(useEditor.getState().plan.placements.map((p) => p.id)).toEqual(['theirs-1']);
  });

  it('leaves your own warehouse exactly where it was', () => {
    // Looking at someone's layout is not destructive.
    expect(useEditor.getState().sharedOverWork).toBe(true);
    expect(storedIds()).toEqual(['mine-1', 'mine-2']);
  });

  it('holds back the first edit instead of making it', () => {
    // The first edit is what would overwrite their work, so it asks.
    useEditor.getState().dispatch({ kind: 'add', placement: belt('new', 9) });

    expect(useEditor.getState().heldEdit).not.toBeNull();
    expect(useEditor.getState().plan.placements.map((p) => p.id)).toEqual(['theirs-1']);
    expect(storedIds()).toEqual(['mine-1', 'mine-2']);
  });

  it('holds back a tier change too, which also writes to storage', () => {
    useEditor.getState().toggleOwnedTier(3);

    expect(useEditor.getState().heldEdit).not.toBeNull();
    expect(storedIds()).toEqual(['mine-1', 'mine-2']);
  });

  it('lets you switch warehouse and floor freely, which changes nothing of yours', () => {
    // Navigation, not editing: it changes nothing in storage, so no prompt.
    useEditor.getState().setWarehouse('second');

    expect(useEditor.getState().heldEdit).toBeNull();
    expect(storedIds()).toEqual(['mine-1', 'mine-2']);
  });
});

describe('confirming that your work may be replaced', () => {
  beforeEach(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mine));
    useEditor.getState().loadSharedPlan(theirs);
    useEditor.getState().dispatch({ kind: 'add', placement: belt('new', 9) });
  });

  it('applies the edit that was held, so the click is not lost', () => {
    useEditor.getState().replaceOwnWork();

    expect(useEditor.getState().plan.placements.map((p) => p.id)).toEqual(['theirs-1', 'new']);
    expect(storedIds()).toEqual(['theirs-1', 'new']);
  });

  it('stops asking from then on', () => {
    useEditor.getState().replaceOwnWork();
    useEditor.getState().dispatch({ kind: 'add', placement: belt('another', 12) });

    expect(useEditor.getState().sharedOverWork).toBe(false);
    expect(useEditor.getState().heldEdit).toBeNull();
    expect(storedIds()).toEqual(['theirs-1', 'new', 'another']);
  });
});

describe('backing out', () => {
  beforeEach(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mine));
    useEditor.getState().loadSharedPlan(theirs);
  });

  it('drops a held edit and keeps you looking, with your work still safe', () => {
    useEditor.getState().dispatch({ kind: 'add', placement: belt('new', 9) });
    useEditor.getState().dropHeldEdit();

    expect(useEditor.getState().heldEdit).toBeNull();
    expect(useEditor.getState().sharedOverWork).toBe(true);
    expect(useEditor.getState().plan.placements.map((p) => p.id)).toEqual(['theirs-1']);
    expect(storedIds()).toEqual(['mine-1', 'mine-2']);
  });

  it('can put your own warehouse back on screen', () => {
    useEditor.getState().restoreOwnWork();

    expect(useEditor.getState().plan.placements.map((p) => p.id)).toEqual(['mine-1', 'mine-2']);
    expect(useEditor.getState().sharedOverWork).toBe(false);
    expect(storedIds()).toEqual(['mine-1', 'mine-2']);
  });

  it('survives being asked to restore work that is no longer readable', () => {
    // Storage may have been changed by anything; failing to restore leaves the
    // shared plan on screen rather than throwing.
    window.localStorage.setItem(STORAGE_KEY, 'not json');

    expect(() => useEditor.getState().restoreOwnWork()).not.toThrow();
    expect(useEditor.getState().sharedOverWork).toBe(false);
  });
});
