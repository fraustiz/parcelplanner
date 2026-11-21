import generatedSvgIcons from './generated/object-icons.json';
import { COUNTRIES, countryFlag } from './countries';

/**
 * Canvas icons for the criteria scanners and related objects, extracted from the game UI (FModel),
 * keyed by catalogue id. Most objects have none.
 *
 * src/render/renderer.ts stamps them on a placed object, recoloured to solid black (blackenIcon in
 * GridCanvas.tsx). Palette icons come from `PALETTE_ICONS` below.
 */
/**
 * The parcel drawn on the belts by the live preview. Never recoloured, so a stopped parcel is
 * marked with a ring rather than a tint.
 */
export const PARCEL_ICON = '/parcel.png';

/**
 * Icon paths the canvas draws as authored. Everything else is repainted solid black, because
 * the game's pale glyphs vanish on pale scanner artwork. An explicit list, not a guess from the path.
 */
export const KEEP_OWN_COLOURS: ReadonlySet<string> = new Set([
  PARCEL_ICON,
  // A flag is its colours: both sets, the game's and the RealCountries mod's.
  ...COUNTRIES.flatMap((id) => [countryFlag(id, false)!, countryFlag(id, true)!]),
]);

export const OBJECT_ICONS: Record<string, string> = {
  BP_ConveyorBelt_CriteriaScanner_Weight: '/criteria/weight-icon.png',
  BP_ConveyorBelt_CriteriaScanner_CargoType: '/criteria/cargo-type-icon.png',
  BP_ConveyorBelt_CriteriaScanner_SerialNumber: '/criteria/serial-number-icon.png',
  BP_ConveyorBelt_CriteriaScanner_ContentsProhibited: '/criteria/contents-icon.png',
  BP_ConveyorBelt_CriteriaScanner_Country: '/criteria/country-flag-icon.png',
  BP_ConveyorBelt_CriteriaScanner_Stamp: '/criteria/stamp.png',
  BP_ConveyorBelt_Diverter: '/criteria/cargo-type-icon.png',
  BP_ConveyorBelt_CountryDiverter2: '/criteria/country-flag-icon.png',
  BP_ConveyorBelt_Splitter_2Way: '/criteria/contents-icon.png',
};

/**
 * Palette icons that override an object's grid artwork (which the palette draws by default, see
 * src/components/ObjectIcon.tsx). Generated from public/objects/ by scripts/build-object-icons.mjs:
 * drop a file named after the catalogue id there. See public/objects/README.md.
 */
export const PALETTE_ICON_OVERRIDES: Record<string, string> =
  generatedSvgIcons as Record<string, string>;

/**
 * The game's E_CargoType values mapped to their icon, keyed by the strings in a `Door`'s
 * `cargoTypes` (src/data/doors.ts), which the renderer uses to label export door bays.
 */
export const CARGO_TYPE_ICONS: Record<'Road' | 'Rail' | 'Air' | 'Maritime', string> = {
  Road: '/cargo_types/road_icon.png',
  Rail: '/cargo_types/rail_icon.png',
  Air: '/cargo_types/air_icon.png',
  Maritime: '/cargo_types/maritime_icon.png',
};

/**
 * The glyph for a country export door's bay. The game data has no per-door country
 * (src/data/doors.ts), so one generic flag is used.
 */
export const COUNTRY_DOOR_ICON = '/criteria/country-flag-icon.png';
