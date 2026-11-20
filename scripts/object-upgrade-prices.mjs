/**
 * Per-object upgrade step prices, by catalogue id.
 *
 * From the community planning spreadsheet, not the game data: the extraction
 * only exposes `UpgradePrice` for three objects. The sheet reproduces all 28
 * extracted base prices and those three upgrade prices, but is not infallible
 * (PalletPlacement: 25000 vs 5000 in DT_TieredUpgrades), so extracted data wins.
 *
 * Lvl 3 is 2x Lvl 2 for every object: the step doubles per tier (`tierPrice` in
 * src/core/cost.ts). Objects absent here cannot be upgraded (maxTier 1).
 */
export const OBJECT_UPGRADE_PRICES = {
  // Also confirmed by the game data.
  BP_ConveyorBelt_Launcher: 250,
  BP_ConveyorBelt_Speedway: 5000,
  BP_ConveyorBelt_Elevator: 10000,

  // Sheet only: the game data leaves these null.
  BP_ConveyorBelt_Straight_Tier1: 50,
  BP_ConveyorBelt_Corner_Tier1: 50,
  BP_ConveyorBelt_Joiner: 50,
  BP_ConveyorBelt_Joiner_3Way: 50,
  // From the in-game shop: 50 for tier 2, 100 for tier 3.
  BP_ConveyorBelt_Joiner_2WayT: 50,
  BP_ConveyorBelt_Bridger: 50,
  BP_ConveyorBelt_Loader: 50,
  BP_ConveyorBelt_Unloader: 50,
  BP_ConveyorBelt_Pauser: 50,
  BP_ConveyorBelt_AutoPauser: 50,
  BP_ConveyorBelt_Diverter: 50,
  BP_ConveyorBelt_Splitter_2Way: 50,
  BP_ConveyorBelt_Splitter: 50,
  BP_ConveyorBelt_StickerApplier_Approve: 50,
  BP_ConveyorBelt_StickerApplier_Deny: 50,

  // The sticker checker sits on its own at 2000, between the plain belts and
  // the criteria scanners.
  BP_ConveyorBelt_Scanner2_Tier1: 2000,

  // Every criteria scanner: 5000.
  BP_ConveyorBelt_CriteriaScanner_Weight: 5000,
  BP_ConveyorBelt_CriteriaScanner_SerialNumber: 5000,
  BP_ConveyorBelt_CriteriaScanner_Country: 5000,
  BP_ConveyorBelt_CriteriaScanner_CargoType: 5000,
  BP_ConveyorBelt_CriteriaScanner_Stamp: 5000,
  BP_ConveyorBelt_CriteriaScanner_ContentsProhibited: 5000,
};

/**
 * `MaxUpgradeTier` on the BP_ConveyorBelt base class; no BP_* actor in the
 * export overrides it.
 */
export const MAX_UPGRADE_TIER = 3;
