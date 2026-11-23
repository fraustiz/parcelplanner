// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import DoorCargoMenu from './DoorCargoMenu';
import { DOORS } from '@/data/doors';
import { useEditor } from '@/store/editor';

afterEach(cleanup);

const air = DOORS.find((d) => d.id === 'main-export-air-0')!;

beforeEach(() => {
  useEditor.setState({
    plan: { gameVersion: 'test', warehouse: 'main', placements: [] },
    locale: 'en', undoStack: [], redoStack: [],
    sharedOverWork: false, heldEdit: null,
  });
});

const open = () => render(<DoorCargoMenu door={air} at={{ x: 10, y: 10 }} onClose={vi.fn()} />);
const box = (name: string) => screen.getByRole('menuitemcheckbox', { name });

describe('the cargo type picker on an export door', () => {
  it("names the door and ticks the game's types", () => {
    open();
    expect(screen.getByRole('menu', { name: 'Export door, col. 18' })).toBeTruthy();
    expect(box('Air').getAttribute('aria-checked')).toBe('true');
    expect(box('Road').getAttribute('aria-checked')).toBe('false');
  });

  it('adds and removes types, staying open', () => {
    open();
    fireEvent.click(box('Road'));
    expect(useEditor.getState().plan.doorCargo).toEqual({ 'main-export-air-0': ['Road', 'Air'] });
    fireEvent.click(box('Air'));
    expect(useEditor.getState().plan.doorCargo).toEqual({ 'main-export-air-0': ['Road'] });
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('never unticks the last type', () => {
    open();
    expect(box('Air').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(box('Air'));
    expect(useEditor.getState().plan.doorCargo).toBeUndefined();
  });

  it("goes back to the game's types", () => {
    open();
    fireEvent.click(box('Rail'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Game's types/ }));
    expect(useEditor.getState().plan.doorCargo).toBeUndefined();
  });
});
