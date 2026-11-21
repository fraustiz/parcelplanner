// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { useEditor } from '@/store/editor';
import ImportPanel, { type ImportOutcome } from './ImportPanel';
import type { Plan } from '@/core/types';

afterEach(cleanup);
beforeEach(() => useEditor.setState({ locale: 'en' }));

const PLAN: Plan = {
  gameVersion: '1.0', warehouse: 'main',
  placements: [{
    id: 'a', objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'main',
    floor: 0, cell: { x: 1, y: 1 }, rotation: 0, tier: 1,
  }],
};

const READY = (over: Partial<ImportOutcome & { kind: 'ready' }> = {}): ImportOutcome => ({
  kind: 'ready',
  source: 'template',
  plan: PLAN,
  report: {
    placed: 33,
    byWarehouse: [{ warehouse: 'main', placed: 31 }, { warehouse: 'second', placed: 2 }],
    unknown: [], dropped: [], ignored: 4, rotationUnknown: 28,
  },
  ...over,
});

describe('the caution an import has to carry', () => {
  /**
   * An import must never land in silence: a spreadsheet cannot state every
   * rotation, and a sheet that drifted from the template shifts the layout.
   */
  it('shows the caution, and its reason, before anything is loaded', () => {
    const onConfirm = vi.fn();
    const { getByText } = render(
      <ImportPanel outcome={READY()} onConfirm={onConfirm} onClose={() => {}} />);

    expect(getByText(/not perfectly/i)).toBeTruthy();
    expect(getByText(/cannot be worked out from a spreadsheet/i)).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('loads nothing until the confirm button is pressed', () => {
    const onConfirm = vi.fn();
    const { getByRole } = render(
      <ImportPanel outcome={READY()} onConfirm={onConfirm} onClose={() => {}} />);

    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(getByRole('button', { name: /import anyway/i }));
    // A spreadsheet carries no delivery levels.
    expect(onConfirm).toHaveBeenCalledWith(PLAN, undefined);
  });

  it('backs out without loading', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { getByRole } = render(
      <ImportPanel outcome={READY()} onConfirm={onConfirm} onClose={onClose} />);

    fireEvent.click(getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('says what it read and what it had to guess', () => {
    const { getByText } = render(
      <ImportPanel outcome={READY()} onConfirm={() => {}} onClose={() => {}} />);

    expect(getByText(/33 objects read/i)).toBeTruthy();
    expect(getByText(/31 in the main warehouse/i)).toBeTruthy();
    expect(getByText(/2 in the second warehouse/i)).toBeTruthy();
    expect(getByText(/28 placed at a default angle/i)).toBeTruthy();
  });

  it('names the cells it could not read', () => {
    const outcome = READY({
      report: {
        placed: 1, byWarehouse: [{ warehouse: 'main', placed: 1 }],
        unknown: [{ sheet: 'First Warehouse', cell: { x: 3, y: 4 }, value: 'ZZ' }],
        dropped: [{ sheet: 'First Warehouse', cell: { x: 0, y: 0 }, value: 'RS' }],
        ignored: 0, rotationUnknown: 0,
      },
    });
    const { getByText } = render(
      <ImportPanel outcome={outcome} onConfirm={() => {}} onClose={() => {}} />);

    expect(getByText(/1 cells hold a code this app does not know/i)).toBeTruthy();
    expect(getByText(/1 objects would not fit/i)).toBeTruthy();
  });

  it('leaves out the lines it has no number for', () => {
    const { queryByText } = render(
      <ImportPanel outcome={READY()} onConfirm={() => {}} onClose={() => {}} />);
    expect(queryByText(/code this app does not know/i)).toBeNull();
    expect(queryByText(/would not fit/i)).toBeNull();
  });
});

describe('a workbook that cannot be trusted', () => {
  it('refuses it, and says which check failed', () => {
    const outcome: ImportOutcome = {
      kind: 'refused',
      problems: [{ kind: 'doors-moved', sheet: 'First Warehouse', matched: 0, expected: 13 }],
    };
    const { getByText, queryByRole } = render(
      <ImportPanel outcome={outcome} onConfirm={() => {}} onClose={() => {}} />);

    expect(getByText(/not the official template/i)).toBeTruthy();
    expect(getByText(/doors are not where the game puts them/i)).toBeTruthy();
    // No way to force it through: a shifted grid produces a layout that looks
    // entirely normal and is wrong in every cell.
    expect(queryByRole('button', { name: /import anyway/i })).toBeNull();
  });

  it('says so when the file is not a workbook at all', () => {
    const { getByText, queryByRole } = render(
      <ImportPanel outcome={{ kind: 'unreadable', source: 'template' }} onConfirm={() => {}} onClose={() => {}} />);
    expect(getByText(/could not be read/i)).toBeTruthy();
    expect(queryByRole('button', { name: /import anyway/i })).toBeNull();
  });
});

describe('a workbook with nothing on it', () => {
  it('says so rather than offering an empty import', () => {
    const outcome = READY({
      plan: { ...PLAN, placements: [] },
      report: {
        placed: 0, byWarehouse: [], unknown: [], dropped: [], ignored: 12, rotationUnknown: 0,
      },
    });
    const { getByText, queryByRole } = render(
      <ImportPanel outcome={outcome} onConfirm={() => {}} onClose={() => {}} />);
    expect(getByText(/nothing on this workbook/i)).toBeTruthy();
    expect(queryByRole('button', { name: /import anyway/i })).toBeNull();
  });
});

describe('a game save', () => {
  const SAVE = (over: Partial<ImportOutcome & { kind: 'ready' }> = {}) => READY({
    source: 'save',
    report: {
      placed: 3215, byWarehouse: [{ warehouse: 'main', placed: 825 }, { warehouse: 'second', placed: 2390 }],
      unknown: [{ sheet: 'main/0', cell: { x: 1, y: 1 }, value: 'BP_New' }],
      dropped: [{ sheet: 'main/0', cell: { x: 2, y: 2 }, value: 'BP_ConveyorBelt_Joiner' }],
      ignored: 24, rotationUnknown: 0,
    },
    ...over,
  });

  it('says it came from the game, and what is only approximate, before loading', () => {
    const onConfirm = vi.fn();
    const { getByText, queryByText } = render(
      <ImportPanel outcome={SAVE()} onConfirm={onConfirm} onClose={() => {}} />);
    expect(getByText(/imported from your game save/i)).toBeTruthy();
    expect(getByText(/11 paints and the planner 8 colours/i)).toBeTruthy();
    // Nothing about spreadsheets or guessed angles: a save states them all.
    expect(queryByText(/spreadsheet/i)).toBeNull();
    expect(queryByText(/default angle/i)).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("counts what it left out in a save's own words", () => {
    const { getByText } = render(
      <ImportPanel outcome={SAVE()} onConfirm={() => {}} onClose={() => {}} />);
    expect(getByText(/3215 objects read/i)).toBeTruthy();
    expect(getByText(/1 objects are not in the planner/i)).toBeTruthy();
    expect(getByText(/1 objects were not lying flat on a cell/i)).toBeTruthy();
  });

  it('shows the delivery door levels it read, and hands them over on confirm', () => {
    const onConfirm = vi.fn();
    const { getByText, getByRole } = render(
      <ImportPanel outcome={SAVE({ delivery: { sizeLevel: 2, speedLevel: 3, exportLevel: 1, automaticExports: false, bayLevel: 2 } })} onConfirm={onConfirm} onClose={() => {}} />);
    expect(getByText(/delivery doors: 7 parcels per truck, 10 s, bay belts tier 2/i)).toBeTruthy();
    expect(getByText(/export doors: 12 parcels per truck, sent by hand/i)).toBeTruthy();
    fireEvent.click(getByRole('button', { name: /import anyway/i }));
    expect(onConfirm).toHaveBeenCalledWith(PLAN, { sizeLevel: 2, speedLevel: 3, exportLevel: 1, automaticExports: false, bayLevel: 2 });
  });

  it('tells where saves are kept when the file is not one', () => {
    const { getByText } = render(
      <ImportPanel outcome={{ kind: 'unreadable', source: 'save' }} onConfirm={() => {}} onClose={() => {}} />);
    expect(getByText(/not a Parcel Simulator save/i)).toBeTruthy();
    expect(getByText(/SaveGames/)).toBeTruthy();
  });

  it('says so when nothing is built on it', () => {
    const outcome = SAVE({
      plan: { ...PLAN, placements: [] },
      report: { placed: 0, byWarehouse: [], unknown: [], dropped: [], ignored: 13, rotationUnknown: 0 },
    });
    const { getByText, queryByRole } = render(
      <ImportPanel outcome={outcome} onConfirm={() => {}} onClose={() => {}} />);
    expect(getByText(/nothing is built on the grids of this save/i)).toBeTruthy();
    expect(queryByRole('button', { name: /import anyway/i })).toBeNull();
  });
});

describe('in French', () => {
  it('speaks it', () => {
    useEditor.setState({ locale: 'fr' });
    const { getByText } = render(
      <ImportPanel outcome={READY()} onConfirm={() => {}} onClose={() => {}} />);
    expect(getByText(/mais pas parfaitement/i)).toBeTruthy();
    expect(getByText(/33 objets lus/i)).toBeTruthy();
  });
});

describe('the import dialog and the keyboard', () => {
  it('takes focus on open and closes on Escape without importing', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { getByRole } = render(
      <ImportPanel outcome={READY()} onConfirm={onConfirm} onClose={onClose} />);
    expect(getByRole('dialog').contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
