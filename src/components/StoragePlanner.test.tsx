// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import StoragePlanner from './StoragePlanner';
import { useEditor } from '@/store/editor';

afterEach(cleanup);

beforeEach(() => {
  useEditor.setState({
    plan: { gameVersion: 'test', warehouse: 'main', placements: [] },
    locale: 'en',
  });
});

const open = () => fireEvent.click(screen.getByRole('button', { name: /storage/i }));

describe('the storage planner', () => {
  it('opens from its button', () => {
    const { container } = render(<StoragePlanner />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    open();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("states the game's cargo split for the plan's warehouse tier", () => {
    // No owned tiers listed means all owned: tier 18, all four types drawn.
    render(<StoragePlanner />);
    open();
    const note = screen.getByRole('dialog').textContent ?? '';
    expect(note).toMatch(/tier, here 18/);
    expect(note).toMatch(/Road 36%, Rail 36%, Air 18%, Maritime 9%/);
    // It must not claim the split is even.
    expect(note).not.toMatch(/assumed to split EVENLY/i);
  });

  it('draws no Maritime parcels before warehouse tier 4', () => {
    useEditor.setState({
      plan: { gameVersion: 'test', warehouse: 'main', placements: [], ownedTiers: [1, 2] },
    });
    render(<StoragePlanner />);
    open();
    const note = screen.getByRole('dialog').textContent ?? '';
    expect(note).toMatch(/Road 40%, Rail 40%, Air 20%\./);
  });

  it('asks for nothing but the schedule and the upgrade levels', () => {
    render(<StoragePlanner />);
    open();
    // One checkbox per cargo type per day of the week.
    expect(screen.getByRole('dialog').querySelectorAll('input[type="checkbox"]').length).toBe(4 * 7);
  });

  it('needs no racks while everything is accepted every day', () => {
    render(<StoragePlanner />);
    open();
    const dialog = screen.getByRole('dialog');
    for (const box of dialog.querySelectorAll('input[type="checkbox"]')) {
      if (!(box as HTMLInputElement).checked) fireEvent.click(box);
    }
    // Nothing piles up, so every result row shows no racks. Only the result
    // rows are checked: the intake line's "5 x 33" is not a rack count.
    const rows = [...dialog.querySelectorAll('tbody tr')].slice(-4);
    for (const row of rows) expect(row.lastElementChild?.textContent).toBe('0');
  });

  it('sizes the pile from the longest closure, not the count of closed days', () => {
    // Two separate closed days differ from two in a row: the pile only grows
    // while the door stays shut.
    render(<StoragePlanner />);
    open();
    const dialog = screen.getByRole('dialog');
    const boxes = [...dialog.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    for (const b of boxes) if (!b.checked) fireEvent.click(b);

    // Uncheck the first row's days 0 and 2: two closures, not consecutive.
    fireEvent.click(boxes[0]!);
    fireEvent.click(boxes[2]!);
    const spread = dialog.textContent ?? '';

    // Now days 0 and 1: the same number of closed days, in a row.
    fireEvent.click(boxes[2]!);
    fireEvent.click(boxes[1]!);
    const together = dialog.textContent ?? '';

    expect(together).not.toBe(spread);
  });

  it('counts every delivery door in the warehouse', () => {
    render(<StoragePlanner />);
    open();
    // Five inbound doors in the main warehouse, from src/data/doors.ts. The
    // in-game figure of 525 parcels a day at max upgrades is 5 x 105.
    expect(screen.getByRole('dialog').textContent).toContain('5 × 33');
  });

  it('closes again', () => {
    const { container } = render(<StoragePlanner />);
    open();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('how many doors it counts', () => {
  const STRAIGHT = 'BP_ConveyorBelt_Straight_Tier1';
  /** A belt on a delivery door's own cell, which makes that door feed something. */
  const onDoor = (id: string, cell: { x: number; y: number }) => ({
    id, objectId: STRAIGHT, warehouse: 'main' as const, floor: 0,
    cell, rotation: 0 as const, tier: 1,
  });

  it('counts the doors the plan actually feeds, not every door in the building', () => {
    // Only wired-up doors count, not every door in the building.
    useEditor.setState({
      plan: {
        gameVersion: 'test', warehouse: 'main',
        placements: [onDoor('a', { x: 2, y: 19 }), onDoor('b', { x: 17, y: 19 })],
      },
      locale: 'en',
    });
    render(<StoragePlanner />);
    open();

    expect(screen.getByRole('dialog').textContent).toMatch(/2\s*×/);
    expect(screen.getByRole('dialog').textContent).toMatch(/2\/5/);
  });

  it('falls back to the whole building while nothing is connected', () => {
    // With no belt laid yet, all doors count, so the result is not zero.
    render(<StoragePlanner />);
    open();
    expect(screen.getByRole('dialog').textContent).toMatch(/5\s*×/);
  });
});

describe('the end-game case a player measured in their own game', () => {
  it('asks for about 15 large racks for Maritime, not 50', () => {
    // End to end: five doors, both upgrades maxed, Maritime accepted one day a
    // week. Pins the result of three rules together: only wired-up doors
    // count, Maritime is 5/60 of parcels, and invalid parcels leave the same day.
    render(<StoragePlanner />);
    open();

    const dialog = screen.getByRole('dialog');
    const [size, speed] = [...dialog.querySelectorAll('select')] as HTMLSelectElement[];
    fireEvent.change(size!, { target: { value: '2' } });
    fireEvent.change(speed!, { target: { value: '3' } });

    // Maritime accepted on one day only: untick the other six.
    const maritime = [...dialog.querySelectorAll('input[type="checkbox"]')]
      .filter((b) => (b.getAttribute('aria-label') ?? '').includes('Maritime'));
    expect(maritime.length).toBe(7);
    for (const day of maritime.slice(1)) fireEvent.click(day);

    // Two tables carry a Maritime row: the schedule of checkboxes and the
    // results. The results row is the one with four plain cells.
    const results = [...screen.getByRole('dialog').querySelectorAll('tr')]
      .filter((r) => r.textContent?.includes('Maritime'))
      .map((r) => [...r.querySelectorAll('td')])
      .find((cells) => cells.length === 4)!;
    const racks = Number(/(\d+)/.exec(results[3]?.textContent ?? '')?.[1] ?? 0);

    expect(racks).toBeGreaterThan(10);
    expect(racks).toBeLessThan(20);
  });
});

describe('which axis the planner speaks in', () => {
  const rows = () => [...screen.getByRole('dialog').querySelectorAll('tr')]
    .map((r) => r.textContent ?? '');

  it('talks CARGO TYPES in the main warehouse', () => {
    // The main warehouse's eight export doors all sort by cargo type.
    useEditor.setState({
      plan: { gameVersion: 'test', warehouse: 'main', placements: [] },
      locale: 'en',
    });
    render(<StoragePlanner />);
    open();

    expect(rows().some((r) => r.includes('Maritime'))).toBe(true);
    expect(rows().some((r) => r.includes('Cristin'))).toBe(false);
  });

  it('talks COUNTRIES in the second warehouse', () => {
    // Twelve country doors there, one per country, against two cargo ones.
    useEditor.setState({
      plan: { gameVersion: 'test', warehouse: 'second', placements: [] },
      locale: 'en',
    });
    render(<StoragePlanner />);
    open();

    expect(rows().some((r) => r.includes('Cristin'))).toBe(true);
    expect(rows().some((r) => r.includes('Yatdanica'))).toBe(true);
    expect(rows().some((r) => r.includes('Maritime'))).toBe(false);
  });

  it('says on screen that the split between countries is a guess', () => {
    // The country split is not measured, so the note says it is assumed even.
    useEditor.setState({
      plan: { gameVersion: 'test', warehouse: 'second', placements: [] },
      locale: 'en',
    });
    render(<StoragePlanner />);
    open();

    expect(screen.getByRole('dialog').textContent).toMatch(/evenly|guess/i);
  });
});

describe('the schedule when the axis changes under it', () => {
  it('starts every country ACCEPTED, not closed all week', () => {
    // The schedule is keyed by what the warehouse sorts by and a missing entry
    // means "never accepted", so it must be rebuilt when the building changes.
    useEditor.setState({
      plan: { gameVersion: 'test', warehouse: 'second', placements: [] },
      locale: 'en',
    });
    render(<StoragePlanner />);
    open();

    const dialog = screen.getByRole('dialog');
    const boxes = [...dialog.querySelectorAll('input[type="checkbox"]')]
      .filter((b) => (b.getAttribute('aria-label') ?? '').includes('Cristin'));
    expect(boxes).toHaveLength(7);
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);
  });
});

describe('the storage planner and the keyboard', () => {
  it('takes focus, closes on Escape and gives focus back', () => {
    render(<StoragePlanner />);
    const button = screen.getByRole('button', { name: /storage/i });
    button.focus();
    open();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
