// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import Inspector from './Inspector';
import { useEditor } from '@/store/editor';
import { getCatalogue } from '@/data/catalogue';
import type { Placement } from '@/core/types';

// See TopBar.test.tsx: RTL's auto-cleanup needs a global `afterEach`, which
// this project's vitest config does not provide.
afterEach(cleanup);

const belt = (id: string, x: number): Placement => ({
  id, objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'main',
  floor: 0, cell: { x, y: 0 }, rotation: 0, tier: 1,
});
const corner = (id: string, x: number): Placement => ({
  ...belt(id, x), objectId: 'BP_ConveyorBelt_Corner_Tier1',
});

const withPlacements = (placements: Placement[], selectedIds: string[] = []) =>
  useEditor.setState({
    plan: { gameVersion: 'test', warehouse: 'main', placements },
    selectedIds,
    locale: 'en',
  });

beforeEach(() => withPlacements([]));

describe('the inspector with nothing selected', () => {
  it('counts every object on the plan, most numerous first', () => {
    // With nothing selected, the panel lists what the plan contains.
    withPlacements([belt('a', 0), belt('b', 1), belt('c', 2), corner('d', 3)]);
    const { container } = render(<Inspector />);
    const rows = [...container.querySelectorAll('li')].map((li) => li.textContent ?? '');

    expect(rows[0]).toContain('Straight Conveyor');
    expect(rows[0]).toContain('3');
    expect(rows[1]).toContain('Corner Conveyor');
    expect(rows[1]).toContain('1');
  });

  it('gives the total as well as the breakdown', () => {
    withPlacements([belt('a', 0), belt('b', 1), corner('c', 2)]);
    const { container } = render(<Inspector />);
    expect(container.textContent).toContain('3');
  });

  it('still asks you to select something when the plan is empty', () => {
    const { getByText } = render(<Inspector />);
    expect(getByText(/select an object/i)).toBeTruthy();
  });

  it('counts both warehouses, matching the cost in the status bar', () => {
    // Plan-wide, like the cost figure beside it.
    withPlacements([belt('a', 0), { ...belt('b', 1), warehouse: 'second' }]);
    const { container } = render(<Inspector />);
    expect(container.textContent).toContain('2');
  });

  it('shows the selection instead as soon as there is one', () => {
    withPlacements([belt('a', 0), belt('b', 1), corner('c', 2)], ['a']);
    const { container } = render(<Inspector />);
    // The single-object detail card, not the inventory.
    expect(container.textContent).toContain('Rotation');
  });

  it('translates', () => {
    withPlacements([belt('a', 0)]);
    useEditor.setState({ locale: 'fr' });
    const { container } = render(<Inspector />);
    expect(container.textContent).toContain('Convoyeur');
  });
});

// A straight conveyor is $100 at tier 1, upgrades in $50 steps and tops out at
// tier 3, so $100 + 50*(2^2 - 1) = $250 fully upgraded. A medium rack is $500
// and cannot be upgraded.
describe('what the selection costs', () => {
  const rack = (id: string, x: number): Placement => ({
    ...belt(id, x), objectId: 'BP_StorageRack_Medium',
  });

  it('prices the selection at the tiers it is actually built at', () => {
    withPlacements([belt('a', 0), belt('b', 1), belt('c', 2)], ['a', 'b']);
    const { container } = render(<Inspector />);
    expect(container.textContent).toContain('Selection cost: $200');
  });

  it('also says what the selection would cost fully upgraded', () => {
    // A selected group also shows its fully upgraded cost.
    withPlacements([belt('a', 0), belt('b', 1)], ['a', 'b']);
    const { container } = render(<Inspector />);
    expect(container.textContent).toContain('$500 all max tier');
  });

  it('says nothing about max tier for objects that cannot be upgraded', () => {
    // A rack tops out at tier 1, so the two figures match and only one shows.
    withPlacements([rack('a', 0)], ['a']);
    const { container } = render(<Inspector />);
    expect(container.textContent).toContain('$500');
    expect(container.textContent).not.toContain('all max tier');
  });

  it('counts an already-upgraded object at what it really cost', () => {
    withPlacements([{ ...belt('a', 0), tier: 3 }], ['a']);
    const { container } = render(<Inspector />);
    expect(container.textContent).toContain('Selection cost: $250');
    // Already at the top: nothing left to say.
    expect(container.textContent).not.toContain('all max tier');
  });

  it('translates', () => {
    withPlacements([belt('a', 0), belt('b', 1)], ['a', 'b']);
    useEditor.setState({ locale: 'fr' });
    const { container } = render(<Inspector />);
    expect(container.textContent).toContain('tout au palier max');
  });
});

describe('setting the tier from the panel', () => {
  const tierBox = () => screen.getByRole('combobox', { name: /tier/i }) as HTMLSelectElement;

  it('offers every tier the object actually has', () => {
    // 24 of the 28 objects have more than one tier, set from the panel.
    withPlacements([belt('a', 0)], ['a']);
    render(<Inspector />);

    const max = getCatalogue().get('BP_ConveyorBelt_Straight_Tier1')!.maxTier;
    expect(max).toBeGreaterThan(1);
    expect(tierBox().options).toHaveLength(max);
  });

  it('changes the tier of what is selected', () => {
    withPlacements([belt('a', 0)], ['a']);
    render(<Inspector />);

    fireEvent.change(tierBox(), { target: { value: '3' } });

    expect(useEditor.getState().plan.placements[0]?.tier).toBe(3);
  });

  it('changes the WHOLE selection at once', () => {
    // Like every other action in this panel, the tier applies to the selection.
    withPlacements([belt('a', 0), belt('b', 1)], ['a', 'b']);
    render(<Inspector />);

    fireEvent.change(tierBox(), { target: { value: '2' } });

    expect(useEditor.getState().plan.placements.map((p) => p.tier)).toEqual([2, 2]);
  });

  it('undoes in one press', () => {
    withPlacements([belt('a', 0), belt('b', 1)], ['a', 'b']);
    render(<Inspector />);
    fireEvent.change(tierBox(), { target: { value: '3' } });

    useEditor.getState().undo();

    expect(useEditor.getState().plan.placements.map((p) => p.tier)).toEqual([1, 1]);
  });

  it('is absent entirely for something that has only one tier', () => {
    // A storage rack has a single tier, so it gets no dropdown.
    const rack: Placement = { ...belt('r', 0), objectId: 'BP_StorageRack_Large' };
    expect(getCatalogue().get('BP_StorageRack_Large')!.maxTier).toBe(1);
    withPlacements([rack], ['r']);
    render(<Inspector />);

    expect(screen.queryByRole('combobox', { name: /tier/i })).toBeNull();
  });

  it('clamps each object to its OWN ceiling in a mixed selection', () => {
    // Tier 3 on a belt and a rack gives the belt 3 and leaves the rack at 1.
    const rack: Placement = { ...belt('r', 1), objectId: 'BP_StorageRack_Large' };
    withPlacements([belt('a', 0), rack], ['a', 'r']);
    render(<Inspector />);

    fireEvent.change(tierBox(), { target: { value: '3' } });

    const byId = Object.fromEntries(
      useEditor.getState().plan.placements.map((p) => [p.id, p.tier]),
    );
    expect(byId.a).toBe(3);
    expect(byId.r).toBe(1);
  });

  it('shows the selection cost going up with the tier', () => {
    // The tier drives the cost.
    withPlacements([belt('a', 0)], ['a']);
    const { container } = render(<Inspector />);
    const before = container.textContent ?? '';

    fireEvent.change(tierBox(), { target: { value: '3' } });

    expect(container.textContent).not.toBe(before);
  });
});

describe('picking out every object of one type', () => {
  const row = (name: RegExp) => screen.getByRole('button', { name });

  it('selects them all from the inventory when nothing is selected', () => {
    // Clicking a type in the inventory selects every object of that type.
    withPlacements([belt('a', 0), belt('b', 1), corner('c', 2)]);
    render(<Inspector />);

    fireEvent.click(row(/straight/i));

    expect(useEditor.getState().selectedIds.sort()).toEqual(['a', 'b']);
  });

  it('NARROWS an existing selection instead of replacing it', () => {
    // With a box selection, clicking a type narrows it to that type.
    withPlacements(
      [belt('a', 0), corner('b', 1), belt('c', 2), belt('d', 3)],
      ['a', 'b', 'c'],
    );
    render(<Inspector />);

    fireEvent.click(row(/straight/i));

    // 'd' is a straight conveyor too, and stays out: it was not in the area.
    expect(useEditor.getState().selectedIds.sort()).toEqual(['a', 'c']);
  });

  it('leaves the other floor and the other warehouse alone', () => {
    // Only the floor on screen: no selection reaches objects that are not drawn.
    const upstairs: Placement = { ...belt('up', 0), floor: 1 };
    const other: Placement = { ...belt('other', 1), warehouse: 'second' };
    withPlacements([belt('a', 0), upstairs, other]);
    render(<Inspector />);

    fireEvent.click(row(/straight/i));

    expect(useEditor.getState().selectedIds).toEqual(['a']);
  });
});

describe('the inspector on a reserved zone', () => {
  const zone = (id: string, over: Partial<Placement> = {}): Placement => ({
    id, objectId: 'zone-4x2', warehouse: 'main', floor: 0, cell: { x: 1, y: 1 }, rotation: 0, tier: 1, ...over,
  });

  it('names the zone, as one undo step however long the name', () => {
    // A keystroke per undo entry would make Ctrl+Z after naming a zone
    // "Sorting station" take fifteen presses.
    withPlacements([zone('z')], ['z']);
    useEditor.setState({ undoStack: [], redoStack: [] });
    render(<Inspector />);

    const name = screen.getByRole('textbox', { name: /name/i });
    fireEvent.change(name, { target: { value: 'Sorting station' } });
    fireEvent.blur(name);

    expect(useEditor.getState().plan.placements[0]?.label).toBe('Sorting station');
    expect(useEditor.getState().undoStack).toHaveLength(1);
  });

  it('drops the name entirely when it is cleared', () => {
    withPlacements([zone('z', { label: 'Desk' })], ['z']);
    render(<Inspector />);

    const name = screen.getByRole('textbox', { name: /name/i });
    fireEvent.change(name, { target: { value: '   ' } });
    fireEvent.blur(name);

    expect(useEditor.getState().plan.placements[0]).not.toHaveProperty('label');
  });

  it('gives its size, the way it lies, rather than a rotation', () => {
    withPlacements([zone('z', { rotation: 90 })], ['z']);
    const { container } = render(<Inspector />);

    expect(container.textContent).toContain('2×4');
    expect(container.textContent).not.toMatch(/rotation/i);
  });

  it('has no price to show', () => {
    withPlacements([zone('z')], ['z']);
    const { container } = render(<Inspector />);

    expect(container.textContent).not.toContain('$');
  });

  it('is not counted as an object in what is on the plan', () => {
    withPlacements([belt('a', 0), zone('z')]);
    const { container } = render(<Inspector />);

    expect(container.textContent).toContain('1 objects in all');
    expect(container.textContent).toContain('Reserved area');
  });
});

describe('the inspector and the workshop', () => {
  const bench = (id: string, x: number): Placement => ({ ...belt(id, x), warehouse: 'workshop' });

  it('leaves the bench out of what is built, while standing in a building', () => {
    withPlacements([belt('a', 0), bench('w', 1), bench('v', 2)]);
    const { container } = render(<Inspector />);
    expect(container.textContent).toContain('1 objects in all');
  });

  it('counts the bench itself while standing in the workshop', () => {
    withPlacements([belt('a', 0), bench('w', 1), bench('v', 2)]);
    useEditor.setState((s) => ({ plan: { ...s.plan, warehouse: 'workshop' } }));
    const { container } = render(<Inspector />);
    expect(container.textContent).toContain('2 objects in all');
  });
});

describe('Inspector semantics', () => {
  it('names the colour swatches by colour rather than by code', () => {
    withPlacements([belt('a', 0)], ['a']);
    render(<Inspector />);
    expect(screen.getByRole('button', { name: 'Red' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^#/ })).toBeNull();
  });

  it('pairs every term with its value in the details list', () => {
    withPlacements([belt('a', 0)], ['a']);
    const { container } = render(<Inspector />);
    const list = container.querySelector('dl')!;
    for (const row of list.children) {
      expect(row.querySelector('dt')).not.toBeNull();
      expect(row.querySelector('dd')).not.toBeNull();
    }
  });
});
