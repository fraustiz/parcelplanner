// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import ClearPlan from './ClearPlan';
import Controls, { CONTROLS_SEEN_KEY } from './Controls';
import GridCanvas from './GridCanvas';
import { useEditor } from '@/store/editor';
import type { Placement } from '@/core/types';

afterEach(cleanup);

const belt: Placement = {
  id: 'a', objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'main',
  floor: 0, cell: { x: 2, y: 2 }, rotation: 0, tier: 1,
};

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(CONTROLS_SEEN_KEY, '1');
  useEditor.setState({
    plan: { gameVersion: 'test', warehouse: 'main', placements: [belt] },
    floor: 0, locale: 'en', selectedIds: [], drag: null, marquee: null, clipboard: [],
    budget: null, notice: null, undoStack: [], redoStack: [],
    sharedOverWork: false, heldEdit: null,
  });
});

const trash = () => screen.getByRole('button', { name: /clear/i });
const press = (key: string, shiftKey = false) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key, shiftKey });

describe('a modal dialog', () => {
  it('takes focus on open and gives it back to the button that opened it', () => {
    render(<ClearPlan />);
    trash().focus();
    fireEvent.click(trash());

    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.textContent).toBe('Cancel');

    press('Escape');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trash());
  });

  it('keeps Tab and Shift+Tab inside', () => {
    render(<ClearPlan />);
    fireEvent.click(trash());
    const [cancel, confirm] = screen.getAllByRole('button').filter((b) => screen.getByRole('dialog').contains(b));

    confirm!.focus();
    press('Tab');
    expect(document.activeElement).toBe(cancel);

    press('Tab', true);
    expect(document.activeElement).toBe(confirm);
  });

  it('closes on Escape without clearing the selection on the canvas', () => {
    useEditor.setState({ selectedIds: ['a'] });
    render(<><GridCanvas /><ClearPlan /></>);
    fireEvent.click(trash());

    press('Escape');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useEditor.getState().selectedIds).toEqual(['a']);
    expect(useEditor.getState().plan.placements).toHaveLength(1);
  });

  it('closes before a side panel open underneath it', () => {
    render(<><Controls /><ClearPlan /></>);
    fireEvent.click(screen.getByRole('button', { name: /controls/i }));
    fireEvent.click(trash());
    expect(screen.getAllByRole('dialog')).toHaveLength(2);

    press('Escape');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toMatch(/controls/i);

    press('Escape');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('a side panel', () => {
  it('stays open while a field outside it answers its own Escape', () => {
    render(<><input aria-label="elsewhere" /><Controls /></>);
    fireEvent.click(screen.getByRole('button', { name: /controls/i }));
    screen.getByRole('textbox', { name: 'elsewhere' }).focus();

    press('Escape');

    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
