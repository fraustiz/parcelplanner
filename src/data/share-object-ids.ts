/**
 * The frozen object order for share links. Append only: never reorder, never remove.
 *
 * Links store objects by index here, which keeps them short. The catalogue's own order follows
 * the game's `shopOrder`, which a patch can shift, silently decoding old links to the wrong objects.
 * An object removed from the catalogue keeps its entry so later indices do not move.
 *
 * share-object-ids.test.ts checks this covers the catalogue and spot-checks fixed positions,
 * so a reorder fails a test.
 */
export const SHARE_OBJECT_IDS: readonly string[] = [
  'BP_ConveyorBelt_Straight_Tier1',
  'BP_ConveyorBelt_Corner_Tier1',
  'BP_ConveyorBelt_Joiner',
  'BP_ConveyorBelt_Joiner_3Way',
  'BP_ConveyorBelt_Bridger',
  'BP_ConveyorBelt_Loader',
  'BP_ConveyorBelt_Unloader',
  'BP_ConveyorBelt_Pauser',
  'BP_ConveyorBelt_AutoPauser',
  'BP_ConveyorBelt_Launcher',
  'BP_ConveyorBelt_Speedway',
  'BP_ConveyorBelt_Elevator',
  'BP_ConveyorBelt_Scanner2_Tier1',
  'BP_ConveyorBelt_CriteriaScanner_Weight',
  'BP_ConveyorBelt_CriteriaScanner_SerialNumber',
  'BP_ConveyorBelt_CriteriaScanner_Country',
  'BP_ConveyorBelt_CriteriaScanner_CargoType',
  'BP_ConveyorBelt_CriteriaScanner_Stamp',
  'BP_ConveyorBelt_CriteriaScanner_ContentsProhibited',
  'BP_ConveyorBelt_Diverter',
  'BP_ConveyorBelt_Splitter',
  'BP_ConveyorBelt_Splitter_2Way',
  'BP_ConveyorBelt_CountryDiverter2',
  'BP_ConveyorBelt_StickerApplier_Approve',
  'BP_ConveyorBelt_StickerApplier_Deny',
  'BP_StorageRack_Medium',
  'BP_StorageRack_Large',
  'BP_StorageRack_ExtraLarge',
  // New ids go at the end: a position here is a promise to every link already shared.
  'BP_ConveyorBelt_Joiner_2WayT',
];

/**
 * The frozen country-door order for share links (`Plan.doorCountries`). Append only, like
 * the list above: a link stores a door as its index here. share-object-ids.test.ts checks it
 * names every country door in src/data/doors.ts.
 */
export const SHARE_COUNTRY_DOOR_IDS: readonly string[] = [
  'second-country-0-a',
  'second-country-0-b',
  'second-country-0-c',
  'second-country-0-d',
  'second-country-0-e',
  'second-country-0-f',
  'second-country-1-b',
  'second-country-1-c',
  'second-country-1-d',
  'second-country-1-e',
  'second-country-1-f',
  'second-country-1-g',
];

/** Index of `objectId` in the frozen order, or -1 if it is not there. */
export const shareIndexOf = (objectId: string): number => SHARE_OBJECT_IDS.indexOf(objectId);


/**
 * The frozen order of the export doors sorted by cargo type, for share links
 * (`Plan.doorCargo`): a link stores a door as its index here. Append only.
 */
export const SHARE_CARGO_DOOR_IDS: readonly string[] = [
  'main-export-air-0',
  'main-export-maritime-0',
  'main-export-road-rail-0',
  'main-export-road-0',
  'main-export-rail-0',
  'main-export-air-maritime-0',
];

/**
 * The frozen game-version order for share links. Append only, like the list above.
 *
 * `Plan.gameVersion` lets TopBar warn when a plan was drawn against another game build. A known
 * version travels as its index here, an unknown one as the literal string. It is never implied as
 * "current", or old links would never trigger the warning.
 *
 * On re-extraction, append the new version here and change CATALOGUE_GAME_VERSION.
 */
export const SHARE_GAME_VERSIONS: readonly string[] = [
  'UE5.3-2026-07',
];
