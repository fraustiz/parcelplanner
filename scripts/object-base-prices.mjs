/**
 * Base prices the game has changed since the extraction in `data/raw` was taken.
 *
 * Each entry overrides the extraction silently, so it must name its source:
 * the developer's patch notes, the game data, or two independent sources that
 * agree. Remove an entry once a re-extraction carries it; `catalogue.test.ts`
 * fails when an override equals the raw data.
 */
export const OBJECT_BASE_PRICES = {
  // Dev patch notes, 2026-07-30: "Reduced the tier you unlock Auto Pauser
  // Conveyors to Tier 15, and reduced their price to $30k". The extraction
  // still carries the old 50000.
  BP_ConveyorBelt_AutoPauser: 30000,
};
