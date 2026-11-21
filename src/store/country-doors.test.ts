import { describe, it, expect, beforeEach } from 'vitest';
import { useEditor } from './editor';

beforeEach(() => {
  useEditor.setState({
    plan: { gameVersion: 'test', warehouse: 'second', placements: [] },
    undoStack: [], redoStack: [],
    // See editor.test.ts: with sharedOverWork left set, every edit is held.
    sharedOverWork: false, heldEdit: null,
    realCountries: false,
  });
});

const doors = () => useEditor.getState().plan.doorCountries;
const assign = (door: string, country: string | null) =>
  useEditor.getState().setDoorCountry(door, country);

describe('assigning countries to the country doors', () => {
  it("records the country a door takes, by the game's own id", () => {
    assign('second-country-0-a', 'Cristin');
    expect(doors()).toEqual({ 'second-country-0-a': 'Cristin' });
  });

  it('leaves the field off a plan with no door assigned, and takes it away with the last one', () => {
    expect('doorCountries' in useEditor.getState().plan).toBe(false);
    assign('second-country-0-a', 'Cristin');
    assign('second-country-0-a', null);
    expect('doorCountries' in useEditor.getState().plan).toBe(false);
  });

  it("swaps two doors when one is given the other's country, as each country has one door", () => {
    assign('second-country-0-a', 'Cristin');
    assign('second-country-0-b', 'Impland');
    assign('second-country-0-b', 'Cristin');
    expect(doors()).toEqual({ 'second-country-0-a': 'Impland', 'second-country-0-b': 'Cristin' });
  });

  it('moves a country to an unassigned door, leaving its old door unassigned', () => {
    assign('second-country-0-a', 'Cristin');
    assign('second-country-1-g', 'Cristin');
    expect(doors()).toEqual({ 'second-country-1-g': 'Cristin' });
  });

  it('ignores a door that is not a country door, and a name that is not a game country', () => {
    assign('main-delivery-0', 'Cristin');
    // A display name from the RealCountries mod is never stored.
    assign('second-country-0-a', 'France');
    expect(doors()).toBeUndefined();
  });

  it('stays off the undo stack, like owned tiers: it records what the game dealt', () => {
    assign('second-country-0-a', 'Cristin');
    expect(useEditor.getState().undoStack).toHaveLength(0);
    useEditor.getState().undo();
    expect(doors()).toEqual({ 'second-country-0-a': 'Cristin' });
  });

  it('survives clearing the plan, which removes objects only', () => {
    assign('second-country-0-a', 'Cristin');
    useEditor.getState().clearPlan();
    expect(doors()).toEqual({ 'second-country-0-a': 'Cristin' });
  });

  it("is held back while someone else's shared plan is on screen", () => {
    useEditor.setState({ sharedOverWork: true, heldEdit: null });
    assign('second-country-0-a', 'Cristin');
    expect(doors()).toBeUndefined();
    expect(useEditor.getState().heldEdit).not.toBeNull();
  });
});

describe('the RealCountries display preference', () => {
  it('changes only what is shown, never the plan', () => {
    assign('second-country-0-a', 'Cristin');
    const before = useEditor.getState().plan;
    useEditor.getState().setRealCountries(true);
    expect(useEditor.getState().realCountries).toBe(true);
    expect(useEditor.getState().plan).toBe(before);
  });
});
