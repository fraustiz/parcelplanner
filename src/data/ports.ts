import type { Port } from '@/core/types';

/**
 * Warning: the compass labels on `Side` do not match screen directions.
 *
 * y increases downward on screen (src/core/types.ts), and `STEP` in src/core/graph.ts sends side
 * `N` toward `dy: +1`. So `N` is the visual bottom edge, `S` the top, `E` right, `W` left.
 * A positive `rotateSide` turns clockwise on screen, which steps the labels N -> W -> S -> E
 * (see SIDES_CCW in src/core/grid.ts).
 *
 * Reference orientation: like the game artwork, a straight belt flows up the screen, in through
 * `N` and out through `S` (see `straightThrough`). Every table here uses that reference.
 * Ports, graph tests and renderer agree, so do not "fix" the maths in graph.ts to match the compass.
 *
 * Unverified: the corner, joiner, splitter and diverter layouts were authored from the game's
 * icons, not checked in game. If one connects mirrored, re-derive it from `STEP`, not the label.
 */

/** Objects that override BPI_GridPlaceable.IsWidePlaceable. Everything else occupies one cell. */
export const WIDE_OBJECT_IDS = [
  'BP_ConveyorBelt_CountryDiverter2',
  'BP_ConveyorBelt_Elevator',
  'BP_ConveyorBelt_Speedway',
  'BP_StorageRack_Medium',
  'BP_StorageRack_Large',
  'BP_StorageRack_ExtraLarge',
] as const;

const straightThrough: Port[] = [
  { side: 'N', offset: 0, dir: 'in' },
  { side: 'S', offset: 0, dir: 'out' },
];

const cornerLeft: Port[] = [
  { side: 'N', offset: 0, dir: 'in' },
  { side: 'W', offset: 0, dir: 'out' },
];

const oneInTwoOut: Port[] = [
  { side: 'N', offset: 0, dir: 'in' },
  { side: 'S', offset: 0, dir: 'out' },
  { side: 'E', offset: 0, dir: 'out' },
];

const oneInThreeOut: Port[] = [
  { side: 'N', offset: 0, dir: 'in' },
  { side: 'S', offset: 0, dir: 'out' },
  { side: 'E', offset: 0, dir: 'out' },
  { side: 'W', offset: 0, dir: 'out' },
];

const twoInOneOut: Port[] = [
  { side: 'N', offset: 0, dir: 'in' },
  { side: 'E', offset: 0, dir: 'in' },
  { side: 'S', offset: 0, dir: 'out' },
];

/**
 * The T-Joiner: fed from both sides at once, out through the third arm, so two belts running
 * at each other can merge. Other joiners take a side input while a belt runs straight through.
 */
const twoOpposedInOneOut: Port[] = [
  { side: 'E', offset: 0, dir: 'in' },
  { side: 'W', offset: 0, dir: 'in' },
  { side: 'S', offset: 0, dir: 'out' },
];

const threeInOneOut: Port[] = [
  { side: 'N', offset: 0, dir: 'in' },
  { side: 'E', offset: 0, dir: 'in' },
  { side: 'W', offset: 0, dir: 'in' },
  { side: 'S', offset: 0, dir: 'out' },
];

/** Takes a parcel in on floor 0 and delivers it on the floor above. */
const elevator: Port[] = [
  { side: 'N', offset: 0, dir: 'in', floorDelta: 0 },
  { side: 'S', offset: 0, dir: 'out', floorDelta: 1 },
];

/** Racks accept parcels but do not pass them on. */
const sinkOnly: Port[] = [{ side: 'N', offset: 0, dir: 'in' }];

/**
 * The Sticker Verification Conveyor (`BP_ConveyorBelt_Scanner2_Tier1`), the only sorting object:
 * right = approved sticker, left = refused sticker, straight ahead = no sticker.
 * With flow running up the screen, straight ahead is `S`, right is `E` and left is `W`.
 */
const stickerVerifier: Port[] = [
  { side: 'N', offset: 0, dir: 'in' }, // entry, from below
  { side: 'S', offset: 0, dir: 'out' }, // straight ahead: no sticker
  { side: 'E', offset: 0, dir: 'out' }, // right: approved sticker
  { side: 'W', offset: 0, dir: 'out' }, // left: refused sticker
];

export const PORTS: Record<string, Port[]> = {
  BP_ConveyorBelt_Straight_Tier1: straightThrough,
  BP_ConveyorBelt_Corner_Tier1: cornerLeft,
  BP_ConveyorBelt_Bridger: straightThrough,
  BP_ConveyorBelt_Pauser: straightThrough,
  BP_ConveyorBelt_AutoPauser: straightThrough,
  BP_ConveyorBelt_Launcher: straightThrough,
  BP_ConveyorBelt_Speedway: straightThrough,
  BP_ConveyorBelt_Loader: straightThrough,
  BP_ConveyorBelt_Unloader: straightThrough,
  // The only sorting object (see `stickerVerifier`). The CriteriaScanner_* entries below
  // inspect but do not sort.
  BP_ConveyorBelt_Scanner2_Tier1: stickerVerifier,
  BP_ConveyorBelt_CriteriaScanner_Weight: straightThrough,
  BP_ConveyorBelt_CriteriaScanner_SerialNumber: straightThrough,
  BP_ConveyorBelt_CriteriaScanner_Country: straightThrough,
  BP_ConveyorBelt_CriteriaScanner_CargoType: straightThrough,
  BP_ConveyorBelt_CriteriaScanner_Stamp: straightThrough,
  BP_ConveyorBelt_CriteriaScanner_ContentsProhibited: straightThrough,
  BP_ConveyorBelt_StickerApplier_Approve: straightThrough,
  BP_ConveyorBelt_StickerApplier_Deny: straightThrough,
  BP_ConveyorBelt_Joiner: twoInOneOut,
  BP_ConveyorBelt_Joiner_3Way: threeInOneOut,
  BP_ConveyorBelt_Joiner_2WayT: twoOpposedInOneOut,
  BP_ConveyorBelt_Splitter: oneInTwoOut,
  BP_ConveyorBelt_Splitter_2Way: oneInTwoOut,
  BP_ConveyorBelt_Diverter: oneInThreeOut,
  BP_ConveyorBelt_CountryDiverter2: oneInThreeOut,
  BP_ConveyorBelt_Elevator: elevator,
  BP_StorageRack_Medium: sinkOnly,
  BP_StorageRack_Large: sinkOnly,
  BP_StorageRack_ExtraLarge: sinkOnly,
};
