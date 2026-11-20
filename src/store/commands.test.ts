import { describe, it, expect } from 'vitest';
import { applyCommand, invertCommand, type Command } from './commands';
import type { Placement, Plan } from '@/core/types';

const a: Placement = {
  id: 'a', objectId: 'belt', warehouse: 'main', floor: 0, cell: { x: 1, y: 1 }, rotation: 0, tier: 1,
};
const moved: Placement = { ...a, cell: { x: 5, y: 5 } };

const empty: Plan = {
  gameVersion: 'test', warehouse: 'main',
  placements: [],
};

describe('applyCommand', () => {
  it('adds a placement', () => {
    expect(applyCommand(empty, { kind: 'add', placement: a }).placements).toEqual([a]);
  });

  it('removes a placement', () => {
    const withA = applyCommand(empty, { kind: 'add', placement: a });
    expect(applyCommand(withA, { kind: 'remove', placement: a }).placements).toEqual([]);
  });

  it('moves a placement in place', () => {
    const withA = applyCommand(empty, { kind: 'add', placement: a });
    const after = applyCommand(withA, { kind: 'move', id: 'a', before: a, after: moved });
    expect(after.placements).toEqual([moved]);
  });

  it('never mutates the plan it was given', () => {
    const withA = applyCommand(empty, { kind: 'add', placement: a });
    expect(empty.placements).toEqual([]);
    expect(withA.placements).toHaveLength(1);
  });
});

describe('invertCommand', () => {
  it('turns an add into a remove', () => {
    expect(invertCommand({ kind: 'add', placement: a }))
      .toEqual({ kind: 'remove', placement: a });
  });

  it('turns a remove into an add', () => {
    expect(invertCommand({ kind: 'remove', placement: a }))
      .toEqual({ kind: 'add', placement: a });
  });

  it('swaps before and after on a move', () => {
    expect(invertCommand({ kind: 'move', id: 'a', before: a, after: moved }))
      .toEqual({ kind: 'move', id: 'a', before: moved, after: a });
  });

  it('restores the original plan when applied then inverted', () => {
    const cmd = { kind: 'add', placement: a } as const;
    const forward = applyCommand(empty, cmd);
    expect(applyCommand(forward, invertCommand(cmd))).toEqual(empty);
  });
});

describe('set-warehouse', () => {
  it('round-trips: apply then apply the inverse restores the original plan', () => {
    const cmd = { kind: 'set-warehouse', before: 'main', after: 'second' } as const;
    const forward = applyCommand(empty, cmd);
    expect(applyCommand(forward, invertCommand(cmd))).toEqual(empty);
  });

  it('does not mutate the input plan', () => {
    const cmd = { kind: 'set-warehouse', before: 'main', after: 'second' } as const;
    applyCommand(empty, cmd);
    expect(empty.warehouse).toBe('main');
  });
});

describe('batch', () => {
  it('applies both commands in a batch of two adds', () => {
    const b: Placement = { ...a, id: 'b', cell: { x: 2, y: 2 } };
    const cmd: Command = {
      kind: 'batch',
      commands: [
        { kind: 'add', placement: a },
        { kind: 'add', placement: b },
      ],
    };
    expect(applyCommand(empty, cmd).placements).toEqual([a, b]);
  });

  it('inverts in reverse order, so a round-trip of add-then-move restores the original plan', () => {
    // Same-order inversion would remove A and then try to move it back.
    // Reverse order avoids that.
    const cmd: Command = {
      kind: 'batch',
      commands: [
        { kind: 'add', placement: a },
        { kind: 'move', id: 'a', before: a, after: moved },
      ],
    };
    const forward = applyCommand(empty, cmd);
    expect(forward.placements).toEqual([moved]);

    const inverse = invertCommand(cmd);
    expect(inverse).toEqual({
      kind: 'batch',
      commands: [
        { kind: 'move', id: 'a', before: moved, after: a },
        { kind: 'remove', placement: a },
      ],
    });

    expect(applyCommand(forward, inverse)).toEqual(empty);
  });
});

describe('note commands', () => {
  const base: Plan = { gameVersion: 't', warehouse: 'main', placements: [] };
  const note = { id: 'n1', warehouse: 'main' as const, floor: 0, cell: { x: 2, y: 3 }, text: 'here' };

  it('adds a note', () => {
    expect(applyCommand(base, { kind: 'note-add', note }).notes).toEqual([note]);
  });

  it('removes one, and drops the field with the last of them', () => {
    // Not an empty array: a plan with no notes must look like one without the
    // field, so share links carry no notes column.
    const withNote = { ...base, notes: [note] };
    expect(applyCommand(withNote, { kind: 'note-remove', note }).notes).toBeUndefined();
  });

  it('edits one in place', () => {
    const withNote = { ...base, notes: [note] };
    const after = { ...note, text: 'changed' };
    expect(applyCommand(withNote, { kind: 'note-edit', id: 'n1', before: note, after }).notes)
      .toEqual([after]);
  });

  it('undoes each of them', () => {
    // Notes are commands so Ctrl+Z reaches them like any other edit.
    for (const command of [
      { kind: 'note-add', note } as const,
      { kind: 'note-remove', note } as const,
      { kind: 'note-edit', id: 'n1', before: note, after: { ...note, text: 'x' } } as const,
    ]) {
      // No `notes` field for the add case: undo restores a plan without notes.
      const start: Plan = command.kind === 'note-add' ? base : { ...base, notes: [note] };
      const done = applyCommand(start, command);
      expect(applyCommand(done, invertCommand(command))).toEqual(start);
    }
  });
});
