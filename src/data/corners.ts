/**
 * Tables that govern how a dragged run behaves, by catalogue id.
 *
 * CORNER_FOR: the corner piece that replaces a straight belt where a run turns. Only the plain
 * belt has one; other objects have no cornering variant, so their runs stay straight.
 * Facing is derived by `orientationFor` in src/core/grid.ts, mirrored for a right-hand turn.
 */
export const CORNER_FOR: Readonly<Record<string, string>> = {
  BP_ConveyorBelt_Straight_Tier1: 'BP_ConveyorBelt_Corner_Tier1',
};

/**
 * The only object a dragged run turns to follow the path. Every other object keeps the
 * rotation it was placed with.
 *
 * An allowlist, because the ports cannot express it: a loader has the same in/out pair as a belt.
 */
export const FOLLOWS_THE_RUN: ReadonlySet<string> = new Set([
  'BP_ConveyorBelt_Straight_Tier1',
]);

/** Which runs may join an existing line, so a run of scanners never rewrites a belt. */
export const JOINS_FROM: ReadonlySet<string> = new Set([
  'BP_ConveyorBelt_Straight_Tier1',
]);

/**
 * What the object in the cell becomes when another line arrives at it: a belt becomes a joiner,
 * a joiner the three-way. Nothing else is replaced, and a fourth line skips the cell.
 * Facing is derived by `joinerOrientation` in src/core/grid.ts.
 */
export const JOINS_INTO: Readonly<Record<string, string>> = {
  BP_ConveyorBelt_Straight_Tier1: 'BP_ConveyorBelt_Joiner',
  // A corner has room for one more arm, like a straight. `joinerOrientation` returns null for an
  // arm opposite the existing input, since a joiner's two inputs are at right angles.
  BP_ConveyorBelt_Corner_Tier1: 'BP_ConveyorBelt_Joiner',
  BP_ConveyorBelt_Joiner: 'BP_ConveyorBelt_Joiner_3Way',
};

/**
 * What the object in the cell becomes when a run leaves it, the mirror of JOINS_INTO.
 * One step only: no splitter has a third output, so a third run is laid as ordinary belt.
 */
export const SPLITS_INTO: Readonly<Record<string, string>> = {
  BP_ConveyorBelt_Straight_Tier1: 'BP_ConveyorBelt_Splitter',
};
