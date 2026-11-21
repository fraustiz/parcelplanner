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
 * The criteria scanners, both splitters and the racks were checked against a real layout of
 * about 3700 objects (see their tables). The others were authored from the game's icons, not
 * checked in game. If one connects mirrored, re-derive it from `STEP`, not the label.
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

/**
 * The content inspection diverter (`BP_ConveyorBelt_Splitter_2Way`) runs down the screen in its
 * reference orientation, towards the yellow edge of its artwork: fed through `S`, out through
 * `N` and `E`. In a real layout all 16 of its placements were fed and both arms connected with
 * this table; with the up-running one other splitters use, none was fed.
 */
const twoWaySplitter: Port[] = [
  { side: 'S', offset: 0, dir: 'in' },
  { side: 'N', offset: 0, dir: 'out' },
  { side: 'E', offset: 0, dir: 'out' },
];

/**
 * Also the smart splitter (`BP_ConveyorBelt_Splitter`), whose artwork points both ways: in a
 * real layout of 335 of them, every one fed its straight output and exactly one side arm, 209
 * on the left and 126 on the right. A side arm with nothing in front of it is never chosen.
 */
const oneInThreeOut: Port[] = [
  { side: 'N', offset: 0, dir: 'in' },
  { side: 'S', offset: 0, dir: 'out' },
  { side: 'E', offset: 0, dir: 'out' },
  { side: 'W', offset: 0, dir: 'out' },
];

/**
 * The smart splitter also merges: in the same layout, belts feed some of them through their
 * side arms, as well as from behind, and one belt leaves through the remaining side. The graph
 * rewires such a splitter (see `reversible`).
 */
const smartSplitter: Port[] = oneInThreeOut.map((port) => ({ ...port, reversible: true }));

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

/**
 * The country diverter, three cells long: in at one end, straight out at the other, and a side
 * exit on both sides of every one of its three cells, one per country lane. In a real layout
 * belts left it from all six sides; with one exit a side, 16 of them were never fed.
 */
const countryDiverter: Port[] = [
  { side: 'N', offset: 0, dir: 'in' },
  { side: 'S', offset: 0, dir: 'out' },
  ...[0, 1, 2].flatMap((offset): Port[] => [
    { side: 'E', offset, dir: 'out' },
    { side: 'W', offset, dir: 'out' },
  ]),
];

/** Takes a parcel in on floor 0 and delivers it on the floor above. */
const elevator: Port[] = [
  { side: 'N', offset: 0, dir: 'in', floorDelta: 0 },
  { side: 'S', offset: 0, dir: 'out', floorDelta: 1 },
];

/**
 * Racks accept parcels but do not pass them on. A loader can feed either short end: a real
 * layout puts one at each end of every rack, as many on one end as on the other.
 */
const sinkOnly: Port[] = [
  { side: 'N', offset: 0, dir: 'in' },
  { side: 'S', offset: 0, dir: 'in' },
];

/**
 * The Sticker Verification Conveyor (`BP_ConveyorBelt_Scanner2_Tier1`):
 * right = approved sticker, left = refused sticker, straight ahead = no sticker.
 * With flow running up the screen, straight ahead is `S`, right is `E` and left is `W`.
 */
const stickerVerifier: Port[] = [
  { side: 'N', offset: 0, dir: 'in' }, // entry, from below
  { side: 'S', offset: 0, dir: 'out' }, // straight ahead: no sticker
  { side: 'E', offset: 0, dir: 'out' }, // right: approved sticker
  { side: 'W', offset: 0, dir: 'out' }, // left: refused sticker
];

/**
 * The criteria scanners (`BP_ConveyorBelt_CriteriaScanner_*`): right = the parcel meets the day's
 * criterion, left = it does not, and nothing straight ahead. Read off the artwork (green right
 * edge, red left edge, no yellow front edge unlike the sticker verifier) and off a real layout,
 * where every one of them feeds a belt on each side and none in front.
 */
const criteriaScanner: Port[] = [
  { side: 'N', offset: 0, dir: 'in' }, // entry, from below
  { side: 'E', offset: 0, dir: 'out' }, // right: meets the criterion
  { side: 'W', offset: 0, dir: 'out' }, // left: does not
];

/**
 * The sticker appliers run down the screen in their reference orientation: fed through `S`, out
 * through `N`. In a real layout three of their four placements connect this way round and the
 * fourth, at 59/41 in the second warehouse, is fed through `N`. Read as a working layout, the
 * piece takes parcels from either end, so it is reversible: fed through `N`, it runs the other way.
 * Worth checking in game.
 */
const stickerApplier: Port[] = [
  { side: 'S', offset: 0, dir: 'in', reversible: true },
  { side: 'N', offset: 0, dir: 'out', reversible: true },
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
  BP_ConveyorBelt_Scanner2_Tier1: stickerVerifier,
  BP_ConveyorBelt_CriteriaScanner_Weight: criteriaScanner,
  BP_ConveyorBelt_CriteriaScanner_SerialNumber: criteriaScanner,
  BP_ConveyorBelt_CriteriaScanner_Country: criteriaScanner,
  BP_ConveyorBelt_CriteriaScanner_CargoType: criteriaScanner,
  BP_ConveyorBelt_CriteriaScanner_Stamp: criteriaScanner,
  BP_ConveyorBelt_CriteriaScanner_ContentsProhibited: criteriaScanner,
  BP_ConveyorBelt_StickerApplier_Approve: stickerApplier,
  BP_ConveyorBelt_StickerApplier_Deny: stickerApplier,
  BP_ConveyorBelt_Joiner: twoInOneOut,
  BP_ConveyorBelt_Joiner_3Way: threeInOneOut,
  BP_ConveyorBelt_Joiner_2WayT: twoOpposedInOneOut,
  BP_ConveyorBelt_Splitter: smartSplitter,
  BP_ConveyorBelt_Splitter_2Way: twoWaySplitter,
  BP_ConveyorBelt_Diverter: oneInThreeOut,
  BP_ConveyorBelt_CountryDiverter2: countryDiverter,
  BP_ConveyorBelt_Elevator: elevator,
  BP_StorageRack_Medium: sinkOnly,
  BP_StorageRack_Large: sinkOnly,
  BP_StorageRack_ExtraLarge: sinkOnly,
};
