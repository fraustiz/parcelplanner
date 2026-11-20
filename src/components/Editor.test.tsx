// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import Editor from './Editor';
import { STORAGE_KEY, useEditor } from '@/store/editor';
import type { Placement } from '@/core/types';
import { planToJson } from '@/core/serialize';

afterEach(cleanup);

const belt: Placement = {
  id: 'a', objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'main',
  floor: 0, cell: { x: 4, y: 4 }, rotation: 0, tier: 1,
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('fetch', () => Promise.reject(new Error('no network in tests')));
  useEditor.setState({
    plan: { gameVersion: 'test', warehouse: 'main', placements: [] },
    locale: 'en', selectedIds: [], undoStack: [], redoStack: [],
    sharedOverWork: false, heldEdit: null,
  });
});

describe('undo and redo with Caps Lock on', () => {
  /** What the browser sends with Caps Lock on: the letter arrives uppercase
   * even though Shift is not held. */
  const ctrl = (key: string, shift = false) =>
    fireEvent.keyDown(window, { key, ctrlKey: true, shiftKey: shift });

  it('undoes on Ctrl+Z whatever the case of the letter', () => {
    // Shortcuts compare the lowercased key, so Caps Lock does not break undo.
    render(<Editor />);
    useEditor.getState().dispatch({ kind: 'add', placement: belt });

    ctrl('Z');

    expect(useEditor.getState().plan.placements).toHaveLength(0);
  });

  it('redoes on Ctrl+Y the same way', () => {
    render(<Editor />);
    useEditor.getState().dispatch({ kind: 'add', placement: belt });
    useEditor.getState().undo();

    ctrl('Y');

    expect(useEditor.getState().plan.placements).toHaveLength(1);
  });

  it('still tells Ctrl+Z from Ctrl+Shift+Z', () => {
    // Undo and redo are told apart by the Shift flag, never by the letter's case.
    render(<Editor />);
    useEditor.getState().dispatch({ kind: 'add', placement: belt });
    ctrl('z');
    expect(useEditor.getState().plan.placements).toHaveLength(0);

    ctrl('Z', true);
    expect(useEditor.getState().plan.placements).toHaveLength(1);
  });
});

describe('the page language', () => {
  it('follows the app language, both ways', () => {
    render(<Editor />);
    act(() => useEditor.getState().setLocale('fr'));
    expect(document.documentElement.lang).toBe('fr');
    act(() => useEditor.getState().setLocale('en'));
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('following a short link', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('says the shared plan is loading while it is fetched', () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    window.history.replaceState(null, '', '/s/k3n8Qw2p');
    render(<Editor />);
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Loading shared plan…')).toBe(true);
  });

  it('keeps your own plan and says so when the link is dead', async () => {
    window.localStorage.setItem(STORAGE_KEY, planToJson({ gameVersion: 'test', warehouse: 'main', placements: [belt] }));
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 404 })));
    window.history.replaceState(null, '', '/s/k3n8Qw2p');
    render(<Editor />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/no longer exists or could not be read/);
    expect(useEditor.getState().plan.placements.map((p) => p.id)).toEqual(['a']);
    expect(screen.queryByText('Loading shared plan…')).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).find((b) => alert.contains(b))!);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
