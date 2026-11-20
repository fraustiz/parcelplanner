import type { Placement, Plan, PlanNote, WarehouseId } from '@/core/types';

/**
 * `Plan`, `Placement` and `Cell` are immutable here and in the store: the undo
 * stacks share references with `plan.placements`. Always build new objects.
 */
export type Command =
  | { kind: 'add'; placement: Placement }
  | { kind: 'remove'; placement: Placement }
  /** Replaces the placement `id` wholesale: moving, rotating, mirroring,
   * swapping the object and changing tier all go through it. */
  | { kind: 'move'; id: string; before: Placement; after: Placement }
  | { kind: 'set-warehouse'; before: WarehouseId; after: WarehouseId }
  /** Notes have their own commands: a note is not a placement, occupies
   * nothing and must not be caught by grid sweeps, but still undoes. */
  | { kind: 'note-add'; note: PlanNote }
  | { kind: 'note-remove'; note: PlanNote }
  | { kind: 'note-edit'; id: string; before: PlanNote; after: PlanNote }
  | { kind: 'batch'; commands: Command[] };

/** Applies `command` to `plan`, returning a new Plan. Never mutates `plan`. */
export function applyCommand(plan: Plan, command: Command): Plan {
  switch (command.kind) {
    case 'add':
      return { ...plan, placements: [...plan.placements, command.placement] };
    case 'remove':
      return {
        ...plan,
        placements: plan.placements.filter((p) => p.id !== command.placement.id),
      };
    case 'move':
      return {
        ...plan,
        placements: plan.placements.map((p) => (p.id === command.id ? command.after : p)),
      };
    case 'set-warehouse':
      return { ...plan, warehouse: command.after };
    case 'note-add':
      return { ...plan, notes: [...(plan.notes ?? []), command.note] };
    case 'note-remove': {
      const left = (plan.notes ?? []).filter((n) => n.id !== command.note.id);
      // The field goes away with the last note, so the plan packs as one
      // without notes.
      const { notes, ...rest } = plan;
      return left.length > 0 ? { ...rest, notes: left } : rest;
    }
    case 'note-edit':
      return {
        ...plan,
        notes: (plan.notes ?? []).map((n) => (n.id === command.id ? command.after : n)),
      };
    case 'batch':
      return command.commands.reduce((acc, c) => applyCommand(acc, c), plan);
  }
}

/** Returns the command that undoes `command`. */
export function invertCommand(command: Command): Command {
  switch (command.kind) {
    case 'add':
      return { kind: 'remove', placement: command.placement };
    case 'remove':
      return { kind: 'add', placement: command.placement };
    case 'move':
      return { kind: 'move', id: command.id, before: command.after, after: command.before };
    case 'set-warehouse':
      return { kind: 'set-warehouse', before: command.after, after: command.before };
    case 'note-add':
      return { kind: 'note-remove', note: command.note };
    case 'note-remove':
      return { kind: 'note-add', note: command.note };
    case 'note-edit':
      return { kind: 'note-edit', id: command.id, before: command.after, after: command.before };
    case 'batch':
      return {
        kind: 'batch',
        commands: [...command.commands].reverse().map(invertCommand),
      };
  }
}
