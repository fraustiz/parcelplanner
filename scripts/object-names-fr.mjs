/**
 * French display names, by catalogue id. The game data only exposes English
 * names (`PurchaseInfo.Name`).
 *
 * These are the game's official French names, matching the filenames in
 * assets/shapes/ verbatim. Take a new object's name from its SVG filename
 * rather than translating it.
 *
 * transform-catalogue.mjs fails on an id missing from the catalogue and lists
 * catalogue objects with no French name.
 */
export const OBJECT_NAMES_FR = {
  // Names from the SVG filenames.
  BP_ConveyorBelt_Straight_Tier1: 'Convoyeur Simple',
  BP_ConveyorBelt_Corner_Tier1: 'Convoyeur en Virage',
  BP_ConveyorBelt_Bridger: 'Convoyeur Pont',
  BP_ConveyorBelt_Loader: 'Convoyeur de Chargement',
  BP_ConveyorBelt_Unloader: 'Convoyeur de Déchargement',
  BP_ConveyorBelt_Pauser: 'Convoyeur de Pause',
  BP_ConveyorBelt_Launcher: 'Convoyeur de Lancement',
  BP_ConveyorBelt_Scanner2_Tier1: "Convoyeur de Vérification d'Autocollants",
  BP_ConveyorBelt_CriteriaScanner_Weight: 'Convoyeur Scanner (Poids)',
  BP_ConveyorBelt_CriteriaScanner_SerialNumber: 'Convoyeur Scanner (Numéro de Série)',
  BP_ConveyorBelt_CriteriaScanner_Country: 'Convoyeur Scanner (Pays)',
  BP_ConveyorBelt_CriteriaScanner_CargoType: 'Convoyeur Scanner (Type de Fret)',
  BP_ConveyorBelt_CriteriaScanner_Stamp: 'Convoyeur Scanner (Timbre)',
  BP_ConveyorBelt_CriteriaScanner_ContentsProhibited: 'Convoyeur Scanner (Contenu - Interdit)',
  BP_ConveyorBelt_Diverter: 'Convoyeur de Déviation en fonction du Type de Fret',
  BP_ConveyorBelt_Splitter_2Way: 'Convoyeur de Déviation pour Inspection du Contenu',
  BP_ConveyorBelt_CountryDiverter2: 'Convoyeur de Déviation en fonction du Type de Pays',
  BP_ConveyorBelt_StickerApplier_Approve: "Convoyeur d'Application d'Autocollants (Accepter)",
  BP_ConveyorBelt_StickerApplier_Deny: "Convoyeur d'Application d'Autocollants (Refuser)",
  BP_ConveyorBelt_Splitter: 'Convoyeur Séparateur Intelligent',
  BP_ConveyorBelt_Joiner_3Way: 'Convoyeur multiconnexions',
  BP_ConveyorBelt_Joiner: 'Convoyeur à 3 branches',
  // The game names both joiners "Convoyeur à 3 branches" in French, so this
  // one adds its junction shape. Replace it if the game gives it its own name.
  BP_ConveyorBelt_Joiner_2WayT: 'Convoyeur à 3 branches (en T)',

  // No SVG yet: translated for this app.
  BP_ConveyorBelt_Elevator: 'Convoyeur Monte-charge vertical',
  BP_ConveyorBelt_Speedway: 'Convoyeur Rapide',
  BP_ConveyorBelt_AutoPauser: 'Convoyeur automatique de Pause',
  // The shop labels are off by one against the ids (BP_StorageRack_Medium is
  // sold as "Small"); the French follows the shop label.
  BP_StorageRack_Medium: 'Étagère de Stockage (Petite)',
  BP_StorageRack_Large: 'Étagère de Stockage (Moyenne)',
  BP_StorageRack_ExtraLarge: 'Étagère de Stockage (Grande)',
};
