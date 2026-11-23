import { describe, it, expect, beforeEach } from 'vitest';
import { useEditor } from './editor';

beforeEach(() => {
  useEditor.setState({
    plan: { gameVersion: 'test', warehouse: 'main', placements: [] },
    undoStack: [], redoStack: [],
    sharedOverWork: false, heldEdit: null,
  });
});

const cargo = () => useEditor.getState().plan.doorCargo;
const setTypes = (door: string, types: string[] | null) => useEditor.getState().setDoorCargo(door, types);

describe('setting the cargo types of an export door', () => {
  it('records the types in the game order', () => {
    setTypes('main-export-air-0', ['Maritime', 'Road']);
    expect(cargo()).toEqual({ 'main-export-air-0': ['Road', 'Maritime'] });
  });

  it("stores nothing for the game's own set, or on reset", () => {
    setTypes('main-export-air-0', ['Rail']);
    setTypes('main-export-air-0', ['Air']);
    expect(cargo()).toBeUndefined();
    setTypes('main-export-air-0', ['Rail']);
    setTypes('main-export-air-0', null);
    expect(cargo()).toBeUndefined();
  });

  it('ignores a reject bin, an unknown door, unknown types and an empty set', () => {
    setTypes('main-export-reject-0', ['Road']);
    setTypes('nowhere', ['Road']);
    setTypes('main-export-air-0', ['Boat']);
    expect(cargo()).toBeUndefined();
  });
});
