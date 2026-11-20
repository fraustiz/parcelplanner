/**
 * Filename (in assets/shapes/) -> catalogue id. Edit only this file to fix a
 * mapping or add an SVG. build-shapes.mjs fails on an unmapped file, a mapping
 * to a missing file or catalogue id, or two files with the same id and variant.
 *
 * Entries marked "INFERRED" have no obvious English counterpart; they were
 * matched from the game's English UI strings.
 *
 * Variants: a value may be `{ id, variant }`, keyed `id#variant` in shapes.json
 * and chosen by `shapeKey` in src/data/shapes.ts.
 *   - Storage racks are labelled in-world: 'fr' or 'en', by interface language.
 *   - The vertical elevator shows 'bas' from the ground floor and 'haut' from the
 *     upper one: the variant follows the floor being viewed, not the placement.
 */
export const SVG_TO_CATALOGUE_ID = {
  'Convoyeur Simple.svg': 'BP_ConveyorBelt_Straight_Tier1',
  'Convoyeur en Virage.svg': 'BP_ConveyorBelt_Corner_Tier1',
  'Convoyeur Pont.svg': 'BP_ConveyorBelt_Bridger',
  'Convoyeur de Chargement.svg': 'BP_ConveyorBelt_Loader',
  'Convoyeur de Déchargement.svg': 'BP_ConveyorBelt_Unloader',
  'Convoyeur de Pause.svg': 'BP_ConveyorBelt_Pauser',
  'Convoyeur de Lancement.svg': 'BP_ConveyorBelt_Launcher',
  "Convoyeur de Vérification d'Autocollants.svg": 'BP_ConveyorBelt_Scanner2_Tier1',
  'Convoyeur Scanner (Poids).svg': 'BP_ConveyorBelt_CriteriaScanner_Weight',
  'Convoyeur Scanner (Numéro de Série).svg': 'BP_ConveyorBelt_CriteriaScanner_SerialNumber',
  'Convoyeur Scanner (Pays).svg': 'BP_ConveyorBelt_CriteriaScanner_Country',
  'Convoyeur Scanner (Type de Fret).svg': 'BP_ConveyorBelt_CriteriaScanner_CargoType',
  'Convoyeur Scanner (Timbre).svg': 'BP_ConveyorBelt_CriteriaScanner_Stamp',
  'Convoyeur Scanner (Contenu - Interdit).svg': 'BP_ConveyorBelt_CriteriaScanner_ContentsProhibited',
  'Convoyeur de Déviation en fonction du Type de Fret.svg': 'BP_ConveyorBelt_Diverter',
  'Convoyeur de Déviation pour Inspection du Contenu.svg': 'BP_ConveyorBelt_Splitter_2Way',
  'Convoyeur de Déviation en fonction du Type de Pays.svg': 'BP_ConveyorBelt_CountryDiverter2',
  "Convoyeur d'Application d'Autocollants (Accepter).svg": 'BP_ConveyorBelt_StickerApplier_Approve',
  "Convoyeur d'Application d'Autocollants (Refuser).svg": 'BP_ConveyorBelt_StickerApplier_Deny',
  'Convoyeur Séparateur Intelligent.svg': 'BP_ConveyorBelt_Splitter',
  // INFERRED: the game calls this the "Multi Joiner Conveyor" in English.
  'Convoyeur multiconnexions.svg': 'BP_ConveyorBelt_Joiner_3Way',
  // INFERRED: the game calls this the "Joiner Conveyor" in English.
  'Convoyeur à 3 branches.svg': 'BP_ConveyorBelt_Joiner',
  // The T-Joiner. The game gives it the same French name as the one above
  // (see scripts/object-names-fr.mjs).
  'Convoyeur en T.svg': 'BP_ConveyorBelt_Joiner_2WayT',
  'Convoyeur Rapide.svg': 'BP_ConveyorBelt_Speedway',
  'Convoyeur automatique de Pause.svg': 'BP_ConveyorBelt_AutoPauser',

  // Two drawings per object (see the variants note above).
  'Convoyeur Monte-charge vertical (Bas).svg': { id: 'BP_ConveyorBelt_Elevator', variant: 'bas' },
  'Convoyeur Monte-charge vertical (Haut).svg': { id: 'BP_ConveyorBelt_Elevator', variant: 'haut' },
  'Étagère de Stockage (Petite) FR.svg': { id: 'BP_StorageRack_Medium', variant: 'fr' },
  'Étagère de Stockage (Petite) EN.svg': { id: 'BP_StorageRack_Medium', variant: 'en' },
  'Étagère de Stockage (Moyenne) FR.svg': { id: 'BP_StorageRack_Large', variant: 'fr' },
  'Étagère de Stockage (Moyenne) EN.svg': { id: 'BP_StorageRack_Large', variant: 'en' },
  'Étagère de Stockage (Grande) FR.svg': { id: 'BP_StorageRack_ExtraLarge', variant: 'fr' },
  'Étagère de Stockage (Grande) EN.svg': { id: 'BP_StorageRack_ExtraLarge', variant: 'en' },
};

/** The catalogue id a mapping entry points at, whether or not it is a variant. */
export const idOf = (entry) => (typeof entry === 'string' ? entry : entry.id);

/** The shapes.json key for a mapping entry: the bare id, or `id#variant`. */
export const keyOf = (entry) =>
  typeof entry === 'string' ? entry : `${entry.id}#${entry.variant}`;
