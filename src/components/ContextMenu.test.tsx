// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen, within } from '@testing-library/react';
import ContextMenu from './ContextMenu';
import { useEditor } from '@/store/editor';
import type { Placement } from '@/core/types';

afterEach(cleanup);

const belt = (id: string, x: number): Placement => ({
  id, objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'main',
  floor: 0, cell: { x, y: 0 }, rotation: 0, tier: 1,
});

beforeEach(() => {
  useEditor.setState({
    plan: { gameVersion: 'test', warehouse: 'main', placements: [belt('a', 0), belt('b', 1)] },
    floor: 0, locale: 'en', selectedIds: ['a'], undoStack: [], redoStack: [],
  });
});

const menu = (onClose = vi.fn()) => {
  render(<ContextMenu anchor={{ x: 10, y: 10, cell: { x: 0, y: 0 } }} onClose={onClose} onNote={() => {}} />);
  return onClose;
};
const press = (key: string) => fireEvent.keyDown(document.activeElement!, { key });
const focused = () => document.activeElement?.textContent ?? '';

describe('the context menu from the keyboard', () => {
  it('focuses its first item on open', () => {
    menu();
    expect(focused()).toMatch(/^Rotate/);
  });

  it('moves with Up, Down, Home and End, wrapping at the ends', () => {
    menu();
    press('ArrowDown');
    expect(focused()).toMatch(/^Mirror/);
    press('End');
    expect(focused()).toMatch(/^Delete/);
    press('ArrowDown');
    expect(focused()).toMatch(/^Rotate/);
    press('ArrowUp');
    expect(focused()).toMatch(/^Delete/);
    press('Home');
    expect(focused()).toMatch(/^Rotate/);
  });

  it('opens Replace with Right and closes it with Left, back on Replace', () => {
    menu();
    const replace = screen.getByRole('menuitem', { name: /replace/i });
    expect(replace.getAttribute('aria-haspopup')).toBe('menu');
    expect(replace.getAttribute('aria-expanded')).toBe('false');

    replace.focus();
    press('ArrowRight');

    expect(replace.getAttribute('aria-expanded')).toBe('true');
    const sub = screen.getByRole('menu', { name: /replace/i });
    expect(sub.contains(document.activeElement)).toBe(true);

    press('ArrowLeft');
    expect(screen.queryByRole('menu', { name: /replace/i })).toBeNull();
    expect(document.activeElement).toBe(replace);
  });

  it('opens Replace with Enter as well', () => {
    menu();
    const replace = screen.getByRole('menuitem', { name: /replace/i });
    replace.focus();
    // A keyboard click carries detail 0.
    fireEvent.click(replace, { detail: 0 });
    expect(screen.getByRole('menu', { name: /replace/i }).contains(document.activeElement)).toBe(true);
  });

  it('Escape in the submenu closes only the submenu', () => {
    const onClose = menu();
    screen.getByRole('menuitem', { name: /replace/i }).focus();
    press('ArrowRight');
    press('Escape');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu', { name: /replace/i })).toBeNull();
  });

  it('Escape closes the menu and is marked handled, so the canvas keeps its selection', () => {
    let handled: boolean | null = null;
    const spy = (event: KeyboardEvent) => { handled = event.defaultPrevented; };
    window.addEventListener('keydown', spy);
    try {
      const onClose = menu();
      press('Escape');
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(handled).toBe(true);
    } finally {
      window.removeEventListener('keydown', spy);
    }
  });

  it('names the colour swatches by colour, inside a labelled group', () => {
    menu();
    const group = screen.getByRole('group', { name: /colour/i });
    expect(within(group).getByRole('menuitem', { name: 'Red' })).toBeTruthy();
    expect(within(group).getByRole('menuitem', { name: 'Light grey' })).toBeTruthy();
    expect(within(group).queryByRole('menuitem', { name: /#/ })).toBeNull();
  });

  it('holds nothing but items, groups and separators', () => {
    useEditor.setState({ selectedIds: ['a', 'b'] });
    menu();
    const root = screen.getByRole('menu');
    expect(root.getAttribute('aria-label')).toBe('2 objects selected');
    for (const child of root.children) {
      const role = child.getAttribute('role');
      const ok = role === 'menuitem' || role === 'separator' || role === 'group'
        || child.getAttribute('aria-hidden') === 'true'
        || child.querySelector('[role="menuitem"]') !== null;
      expect(ok).toBe(true);
    }
  });
});

describe('the context menu on a country door', () => {
  it("offers the door's country, and hands over to its picker", () => {
    const onClose = vi.fn();
    const onDoorCountry = vi.fn();
    render(<ContextMenu anchor={{ x: 10, y: 10, cell: { x: 7, y: 0 } }} onClose={onClose} onNote={() => {}} onDoorCountry={onDoorCountry} />);
    fireEvent.click(screen.getByRole('menuitem', { name: "This door's country…" }));
    expect(onDoorCountry).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('has no such item elsewhere', () => {
    render(<ContextMenu anchor={{ x: 10, y: 10, cell: { x: 0, y: 0 } }} onClose={() => {}} onNote={() => {}} />);
    expect(screen.queryByRole('menuitem', { name: "This door's country…" })).toBeNull();
  });
});
