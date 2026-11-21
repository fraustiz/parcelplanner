# Extraction des données de Parcel Simulator

Procédure reproductible pour régénérer `data/raw/` après une mise à jour du jeu.

## Contexte technique

| Élément | Valeur |
|---|---|
| Jeu | Parcel Simulator, Steam app `2424010` |
| Moteur | Unreal Engine **5.7.4** (`++UE5+Release-5.7`) depuis la mise à jour du 30 septembre 2026, 5.3 avant |
| Empaquetage | IoStore, `parcel-Windows.utoc` / `.ucas`, compressé en Oodle |
| Chiffrement | **aucun** : GUID de clé nul |
| Sauvegardes | GVAS non chiffré, `%LOCALAPPDATA%\parcel\Saved\SaveGames\` |

Aucune clé AES n'est nécessaire. En revanche les paquets utilisent la
**sérialisation non versionnée** : les noms de propriétés ne sont pas stockés dans les
assets. Sans fichier de mappings (`.usmap`), aucune donnée n'est lisible : c'est le seul
verrou réel. Le fichier de mappings dépend de la version du jeu et se régénère après chaque
mise à jour.

Repère de version : la chaîne `++UE5+Release-5.x` dans `parcel-Win64-Shipping.exe`. Un en-tête
de paquet lu avec la mauvaise version échoue dans `LoadNameBatch` (« Read size is bigger than
remaining archive length ») : c'est le signe qu'il faut changer `UE_VERSION`, pas les mappings.

## Étape 1 : générer les mappings avec UE4SS

Nécessaire une fois par version du jeu.

1. Installer [UE4SS](https://github.com/UE4SS-RE/RE-UE4SS) **v4.0.0 ou plus** dans
   `parcel\Binaries\Win64\` (`dwmapi.dll` à côté de l'exécutable, dossier `ue4ss\`).
   La 3.0.1 plante au démarrage sur UE 5.7.
2. Vérifier que `ue4ss\UE4SS-settings.ini` n'est **pas vide**. Un fichier vide (laissé par
   certains gestionnaires de mods) empêche UE4SS de démarrer, sans message ni journal.
   Ne pas forcer `MajorVersion` / `MinorVersion` : la détection automatique est juste.
3. Activer le mod `Keybinds` dans `ue4ss\Mods\mods.txt` (`Keybinds : 1`).
4. Lancer le jeu et appuyer sur **Ctrl + 6 du pavé numérique** au menu principal.
5. Le fichier apparaît dans `ue4ss\`, nommé d'après la version, par exemple
   `parcel-5.7.4-51494982+++UE5+Release-5.7-30afe5ff.usmap` (~2 Mo, types Blueprint compris).
   Le journal `ue4ss\UE4SS.log` confirme « Mappings Generation Completed Successfully ».

## Étape 2 : extraire les assets avec `scripts/game-extract`

Petit outil .NET (SDK 10) autour de [CUE4Parse](https://github.com/FabianFG/CUE4Parse), la
bibliothèque de FModel. Il remplace FModel et lit en plus le bytecode des Blueprints.

```powershell
cd scripts/game-extract
dotnet run -- list "BP_ConveyorBelt_Joiner"                  # chemins des paquets, sans mappings
dotnet run -- grep "Core/.*\.uasset$" RandomBoolWithWeight   # qui contient ce texte, sans mappings
dotnet run -- dump "^parcel/Content/Core/Blueprints/.*\.uasset$" <sortie> <fichier.usmap>
```

`dump` écrit un JSON par paquet en reproduisant l'arborescence de FModel
(`<sortie>\parcel\Content\Core\...`), soit 1 111 fichiers et ~90 Mo pour `Core/Blueprints`.
Variables d'environnement : `PARCEL_PAKS` (dossier `Content\Paks`, chemin Steam par défaut) et
`UE_VERSION` (`GAME_UE5_7` par défaut).

Pour lire une fonction Blueprint (les chances, minuteries et poids codés en dur) :

```powershell
python scripts/game-extract/kismet.py <sortie>\...\AC_MoneyManager.json GetUpgradeDeliverySpeed
```

**Ne pas charger les mods.** `RealCountries_P` remplace les pays fictifs du jeu par de vrais
pays et corromprait le catalogue. L'outil ne monte que les archives du dossier `Paks`, pas
`LogicMods`.

## Étape 3 : construire `data/raw/`

Le script `scripts/build-catalogue.ps1` lit l'export et produit :

```powershell
./scripts/build-catalogue.ps1 -Root "<sortie de l'étape 2>"
```

Les fichiers sont écrits dans `data/raw/` du dépôt (option `-Out` pour un autre dossier,
utile pour comparer avant d'écraser). Ensuite `npm run catalogue` régénère
`src/data/generated/catalogue.json`.

| Fichier | Source | Contenu |
|---|---|---|
| `shop-items.json` | `AC_MoneyManager.ShopItems` + CDO de chaque Blueprint | 51 objets achetables, prix, nom, description |
| `dt-upgrades-tiered.json` | `DT_TieredUpgrades` | améliorations par palier, `BasePrice`, `MaxTier` |
| `dt-upgrades-legacy.json` | `DT_Upgrades` | ancien système, conservé pour référence |
| `dt-licences.json` | `DT_Licences` | licences, coût, outil requis, bonus de revenu |
| `dt-licence-for-tier.json` | `DT_RequiredLicenceForTier` | licence imposée par palier d'entrepôt |
| `dt-cargo-types.json` | `DT_CargoTypes` | Road, Rail, Air, Maritime |
| `dt-countries.json` | `DT_Countries` | les 12 pays fictifs |
| `dt-flooring.json` | `DT_FlooringOptions` | revêtements de sol |

## Où vivent les données dans le jeu

- **Prix d'un objet** — propriété `PurchaseInfo` du *Class Default Object* du Blueprint,
  structure `{ Name, Description, Price, ShopImage }`
- **Liste de la boutique** — tableau `ShopItems` de `AC_MoneyManager`, dans l'ordre
  d'affichage
- **Prix d'amélioration d'un objet** — propriété `UpgradePrice`
- **Vitesse d'un tapis** — propriété `Speed` (50, 100, 200 ou 600)
- **Améliorations globales** — `DT_TieredUpgrades`, avec `BasePrice` et `MaxTier`
- **Extensions d'entrepôt** — `BP_WarehouseTier`, `BP_WarehouseExpansion`,
  `BP_Warehouse_2_Expansion`
- Les noms de champs des structs Blueprint sont suffixés `_<index>_<GUID32>`. Ce suffixe
  **change à chaque recompilation du struct** : il faut le supprimer avant toute
  comparaison, jamais coder un nom complet en dur.
- **Les références d'objet ne sont pas des chaînes.** Un champ comme `RequiredTool` arrive
  sous la forme `{ "ObjectName": "BlueprintGeneratedClass'BP_OpeningKit_C'", "ObjectPath": … }`.
  Il faut extraire l'identifiant depuis `ObjectName` et retirer le suffixe `_C`. Un test
  `typeof value === 'string'` échoue silencieusement et laisse le champ vide.
- **Attention au BOM.** `Set-Content -Encoding utf8` sous PowerShell 5.1 écrit un BOM UTF-8
  que `JSON.parse` de Node refuse. `build-catalogue.ps1` écrit désormais via
  `UTF8Encoding($false)`, et les lecteurs Node retirent le BOM par précaution.

## Valeurs codées en dur dans les Blueprints

Lues dans le bytecode (version 5.7.4) avec `kismet.py`. Aucune n'est dans une table de données.

| Donnée | Valeur | Source |
|---|---|---|
| Colis valide | 50 % (les trois premiers colis d'une partie sont scriptés) | `BP_Parcel.ValidChance`, `BP_DeliveryManager.GetValidChanceWithSubmitCount` |
| Critère invalide | un seul par colis invalide, tiré à parts égales parmi les critères débloqués | `AC_CriteriaManager.GetUnlockedCriteriaAndRandomInvalid` |
| Déblocage des critères | pays et poids d'emblée, numéro de série 6, timbre 12, contenu 20 | `AC_CriteriaManager.CriteriaValidCountUnlockMap` |
| Type de fret | poids route 2 / rail 2 au palier 0 ; + air 1 aux paliers 1 à 3 ; route 4 / rail 4 / air 2 / maritime 1 dès le palier 4 | `AC_CriteriaManager.GetRandomWeightedValidCargoType` |
| Autocollant déjà posé (toujours le bon) | (ln(palier + 2) / ln 12 × 35 + 10) % | `BP_Parcel.RandomlyTryPreAttachInspectionSticker` |
| Colis ouvrable | 10 % dès qu'un critère d'ouverture est débloqué | `AC_CriteriaManager.OpenableSpawnChance` |
| Scanner de critère | à gauche si le critère testé est l'invalide du colis, sinon à droite | `BP_ConveyorBelt_CriteriaScanner`, `Scan and Unpause` |
| Vérificateur d'autocollant | approuvé à droite, refusé à gauche, sans autocollant tout droit | `BP_ConveyorBelt_Scanner2`, `Scan and Unpause` |
| Temps de scan | 10 s, 5 s, 1 s selon le palier de l'objet ; le colis s'arrête pendant le scan | `ScanSpeed` et son changement à l'amélioration |
| Vitesse des tapis | `BaseSpeed` 50 cm/s au palier 1, × 1,5 au palier 2, × 2 au palier 3 ; convoyeur rapide 200 ; un tapis droit fait 100 cm (une case) | `BP_ConveyorBelt`, spline de `BP_ConveyorBelt_Straight` |
| Colis par camion | 3 / 5 / 7 (10 prévu mais non achetable) | `AC_MoneyManager.GetUpgradeNumberParcelsToSpawn` |
| Minuterie entre camions | 40 / 30 / 20 / 10 s | `AC_MoneyManager.GetUpgradeDeliverySpeed` |
| Journée de livraison | de 9 h à 17 h exclu, une minute de jeu par seconde réelle : 480 s | `BP_ParcelGameInstance.HandleTime`, `TimeRate = 1.0` |
| Coût d'amélioration | `UpgradePrice × palier actuel` | `BP_ConveyorBelt` |
| Extension d'entrepôt | 700 + 300 × palier possédé ; second entrepôt 500 000 | `BP_WarehouseExpansion.SetInteractTextAndPriceBasedOnTier` |
| Capacité des étagères | 4 emplacements de base + 4 / 8 / 12, soit 8 / 12 / 16 | composants `ParcelSpawnLocation` de `BP_StorageRack*` |

## Ce qui manque encore

| Manque | Piste |
|---|---|
| Dimension exacte des 4 objets « larges » | Voir la section grille ci-dessous : le jeu ne distingue que normal et large. Reste à mesurer combien de cases occupent les 4 concernés |
| Ports d'entrée / sortie | Absents des données. À décrire à la main par type d'objet : une trentaine de types de tapis, c'est tenable |
| Géométrie des 17 extensions | À reconstruire depuis les `Transform` des 17 acteurs d'extension de la carte `ParcelSimulator` (fichier de 25 Mo). Non fait : la v1 ne conditionne pas la pose aux extensions |

## Le système de grille

Source : `Core/Blueprints/Actors/Placeable/Grid/BP_GridManager`.

| Propriété | Valeur | Interprétation |
|---|---|---|
| `FirstBlock_HorizontalSize` / `VerticalSize` | 20 / 20 | **Entrepôt 1 : grille de 20 × 20 cases** |
| `SecondBlock_HorizontalSize` / `VerticalSize` | 40 / 30 | **Entrepôt 2 : grille de 40 × 30 cases** |
| `GridOrigin` | 0, 0, 0 | origine de la grille |
| `BoxCollisionBaseHeight` | 60 | hauteur de collision au niveau 0 |
| `BoxCollisionHeightIncrementPerLevel` | 20 | **confirme les niveaux empilés** |

Autres pièces du système : `BP_GridCell`, `AC_GridsManager`, `E_GridManagerID`,
`BP_ISM_DynamicGrid`, et les matériaux de retour visuel `M_PlacementValid`,
`M_PlacementValidAlt`, `M_PlacementInvalid` — utiles comme référence pour la surbrillance de
l'éditeur.

### L'emprise des objets est binaire

L'interface `BPI_GridPlaceable` n'expose que trois fonctions :
`GetAssociatedGridManagerID`, `IsWidePlaceable`, `GetIsBlockedWideActor`.

**Le jeu ne connaît donc que deux tailles : une case, ou « large ».** Il n'existe aucune
emprise arbitraire en largeur × profondeur.

Seuls quatre objets surchargent `IsWidePlaceable` :

- `BP_ConveyorBelt_CountryDiverter2` (et sa variante `_Headless`)
- `BP_ConveyorBelt_Elevator`
- `BP_ConveyorBelt_Speedway`
- `BP_StorageRack` (donc les trois tailles de rack qui en héritent)

**Tous les autres objets occupent une seule case.** C'est la simplification la plus utile de
toute l'extraction : elle réduit le problème de l'emprise à la mesure de quatre objets, au
lieu d'un relevé sur cinquante.

La taille d'une case en unités Unreal n'est pas dans ces propriétés. Elle se déduit
empiriquement en croisant `GridCellIdentifier` et `Transform` dans une sauvegarde réelle,
via la fonction `GridCellIdToXY_Coords` de `ParcelFunctionLibrary`.

## Données confirmées

### Objets, extraits de prix notables

| Objet | Prix |
|---|---|
| Straight / Corner Conveyor | 100 |
| Pauser Conveyor | 125 |
| Joiner Conveyor | 350 |
| Bridger Conveyor | 500 |
| Loader / Unloader Conveyor | 600 |
| Launcher Conveyor | 650 |
| Smart Splitter Conveyor | 800 |
| Multi Joiner Conveyor | 850 |
| Cargo Type Diverter | 1 200 |
| Contents Inspection Diverter | 1 250 |
| Scanner Conveyor (Weight / Serial / Country / Cargo / Stamp) | 1 500 |
| Scanner Conveyor (Contents – Prohibited) | 2 000 |
| Sticker Applier (Approve / Deny) | 3 000 |
| Speedway Conveyor | 5 000 |
| Country Diverter Conveyor | 10 000 |
| Vertical Elevator Conveyor | 10 000 |
| Auto Pauser Conveyor | 30 000 (50 000 avant la mise à jour du 30 juillet 2026) |
| Storage Rack Medium / Large / ExtraLarge | 500 / 900 / 1 600 |
| Pallet / Medium / Large | 125 / 500 / 2 000 |

`BP_ConveyorBelt_Elevator` (dossier `Chute`) est l'objet qui relie deux étages du second
entrepôt. Prix 10 000, `UpgradePrice` 10 000.

### Licences

| Licence | Coût | Palier requis | Outil | Bonus / colis |
|---|---|---|---|---|
| Weight | 300 | 0 | `BP_KillergramScales` | +10 |
| SerialNumber | 300 | 0 | `BP_Keypad` | +15 |
| ContentsProhibited | 500 | 3 | `BP_OpeningKit` | +10 |
| Stamp | 500 | 5 | — | +10 |
| Country | 0 | 0 | `BP_InspectionTablet` | 0 (par défaut) |
| CargoType | 0 | 0 | — | 0 (par défaut) |

Licence imposée par palier d'entrepôt : 1 → Weight, 2 → SerialNumber,
4 → ContentsProhibited, 6 → Stamp.

### Améliorations par palier

| Amélioration | Palier max | Prix de base | Palier d'entrepôt requis |
|---|---|---|---|
| Delivery Speed | 3 | 500 | 2 |
| Delivery Size | 2 | 500 | 2 |
| Conveyor Deliveries | 3 | 1 500 | 2 |
| Export Size | 2 | 1 000 | 6 |
| Automatic Exports | 1 | 3 000 | 10 |
| Storage Rack Signs | 1 | 1 500 | 8 |
| Pallet Build Mode | 1 | 5 000 | 11 |
| Flooring | 1 | 5 000 | 14 |

La formule liant `BasePrice` au prix du palier *n* n'est pas dans les données : elle est
implémentée dans un Blueprint, pas encore lu.

### Paramètres de livraison

Relevés dans les descriptions de `DT_Upgrades` et `DT_TieredUpgrades` :

- Livraison de base : **3 colis**, **40 secondes**
- `Delivery Size` : +2 colis par palier, 2 paliers → 3 → 5 → **7 colis**
- `Delivery Speed` : −10 secondes par palier, 3 paliers → 40 → 30 → 20 → **10 secondes**

Les 7 colis par livraison concordent avec le chiffre avancé par la communauté. Les deux
minuteries sont confirmées dans le bytecode (voir « Valeurs codées en dur »).

**Cadence réelle.** La journée de livraison dure 480 s (9 h à 17 h exclu, une minute de jeu
par seconde). Le premier camion arrive après une minuterie complète et aucun n'arrive à 17 h :
une porte reçoit ⌈480 / intervalle⌉ − 1 camions, soit 11, 15 et 23 aux trois premiers
niveaux, exactement les comptages des joueurs. Au dernier niveau, la minuterie de 10 s n'est
pas ce qui limite : la porte ne rouvre qu'une fois les colis du camion précédent sortis. Le
comptage communautaire de 26 camions par jour donne un intervalle effectif de 18 s, que
`src/data/deliveries.ts` garde comme plancher mesuré.
