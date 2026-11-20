# Extraction des données de Parcel Simulator

Procédure reproductible pour régénérer `data/raw/` après une mise à jour du jeu.

## Contexte technique

| Élément | Valeur |
|---|---|
| Jeu | Parcel Simulator, Steam app `2424010` |
| Moteur | Unreal Engine **5.3** (`++UE5+Release-5.3`) |
| Empaquetage | IoStore, `parcel-Windows.utoc` / `.ucas` (2,2 Go), version 5 |
| Chiffrement | **aucun** — `ContainerFlags = 9` (Compressed + Indexed), GUID de clé nul |
| Assets | 11 615 entrées dans le TOC, 9 373 fichiers exploitables |
| Sauvegardes | GVAS non chiffré, `%LOCALAPPDATA%\parcel\Saved\SaveGames\` |

Aucune clé AES n'est nécessaire. En revanche les paquets utilisent la
**sérialisation non versionnée** : les noms de propriétés ne sont pas stockés dans les
assets. Sans fichier de mappings, aucune donnée n'est lisible — c'est le seul verrou réel.

## Étape 1 — Générer les mappings avec UE4SS

Nécessaire une fois, et à refaire après chaque mise à jour du jeu.

1. Installer [UE4SS](https://github.com/UE4SS-RE/RE-UE4SS) dans
   `parcel\Binaries\Win64\` (version utilisée : 3.0.1 Beta)
2. Dans `ue4ss\UE4SS-settings.ini`, section `[Debug]` :
   ```ini
   GuiConsoleEnabled = 1
   GuiConsoleVisible = 1
   ```
3. Lancer le jeu. La console UE4SS s'ouvre à côté.
4. Onglet `Dumpers` → générer le `.usmap`, ou taper `dumpusmap` dans l'onglet `Console`
5. Le fichier apparaît en `ue4ss\Mappings.usmap` (~1,4 Mo)

Remettre ensuite les deux réglages à `0` pour masquer la console.

## Étape 2 — Extraire les assets avec FModel

1. Installer [FModel](https://fmodel.app) (nécessite le runtime .NET Desktop 8)
2. `Add Undetected Game` → dossier :
   `...\steamapps\common\Parcel Simulator\parcel\Content\Paks`
3. **`UE Versions` → `GAME_UE5_3`** — une version fausse casse tout silencieusement
4. Laisser le champ AES vide
5. `Settings` → activer **`Local Mapping File (drag & drop)`**, puis renseigner
   **`Mapping File Path`** avec le `Mappings.usmap` de l'étape 1

   Ce réglage ne peut pas être injecté dans `AppSettings.json` : FModel ne charge les
   mappings que lorsqu'ils sont déclarés depuis l'interface.
6. Onglet `Archives` → `Loading Mode: Multiple` → cocher **uniquement**
   `parcel-Windows.pak` et `parcel-Windows.utoc` → `Load`

   **Ne pas charger les mods.** `RealCountries_P` remplace les pays fictifs du jeu par de
   vrais pays et corromprait le catalogue.
7. Onglet `Folders` → clic droit sur `parcel/Content/Core` →
   **`Save Folder's Packages Properties (.json)`**

   Bien prendre cette entrée, et non `Export Folder's Packages Raw Data`, qui n'écrit
   aucun JSON.

Résultat attendu : environ 4 400 fichiers JSON, ~136 Mo, dans `Output\Exports\`.

## Étape 3 — Construire `data/raw/`

Le script `scripts/build-catalogue.ps1` lit l'export FModel et produit :

```powershell
./scripts/build-catalogue.ps1 -Root "<dossier FModel>\Output\Exports"
```

Les fichiers sont écrits dans `data/raw/` du dépôt (option `-Out` pour un autre dossier).

| Fichier | Source | Contenu |
|---|---|---|
| `shop-items.json` | `AC_MoneyManager.ShopItems` + CDO de chaque Blueprint | 50 objets achetables, prix, nom, description |
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

## Ce qui manque encore

| Manque | Piste |
|---|---|
| Dimension exacte des 4 objets « larges » | Voir la section grille ci-dessous : le jeu ne distingue que normal et large. Reste à mesurer combien de cases occupent les 4 concernés |
| Ports d'entrée / sortie | Absents des données. À décrire à la main par type d'objet : une trentaine de types de tapis, c'est tenable |
| Prix de 6 objets sur 50 | `PurchaseInfo` porté par une classe parente. Il faut remonter la chaîne d'héritage. Concerne les outils liés aux licences (`Scales`, `Keypad`, `OpeningKit`), `Scanner2_Tier1` et les deux papiers peints |
| `Speed` et `UpgradePrice` complets | Même cause : définis sur les classes de base (`BPC_ConveyorBelt`, `BP_ConveyorBelt`), pas sur les feuilles |
| Géométrie des 17 extensions | À reconstruire depuis les `Transform` des 17 acteurs d'extension de la carte `ParcelSimulator` (fichier de 25 Mo). Non fait : la v1 ne conditionne pas la pose aux extensions |
| Progression du prix des extensions | `BasePrice = 700` est confirmé dans `BP_WarehouseExpansion`. L'incrément par palier est calculé dans un graphe Blueprint non lu |

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
| Auto Pauser Conveyor | 50 000 |
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
| Pallet Build Mode | 1 | 5 000 | 13 |
| Flooring | 1 | 5 000 | 14 |

La formule liant `BasePrice` au prix du palier *n* n'est pas dans les données : elle est
implémentée dans un Blueprint. À déterminer.

### Paramètres de livraison

Relevés dans les descriptions de `DT_Upgrades` et `DT_TieredUpgrades` :

- Livraison de base : **3 colis**, **40 secondes**
- `Delivery Size` : +2 colis par palier, 2 paliers → 3 → 5 → **7 colis**
- `Delivery Speed` : −10 secondes par palier, 3 paliers → 40 → 30 → 20 → **10 secondes**

Les 7 colis par livraison concordent avec le chiffre avancé par la communauté.

En revanche la durée maximale ne concorde pas. Le relevé communautaire suppose 30 minutes
de déchargement, ce qui correspond au **premier** palier de `Delivery Speed`, pas au
dernier. Si le troisième palier ramène bien la durée à 10 secondes, le nombre de créneaux
par porte est très supérieur à 16 et le plafond de 560 colis/jour est sous-estimé.

**À vérifier avant tout calcul de colis par jour.** Il faut établir la correspondance entre
les secondes réelles et les minutes de l'horloge du jeu, et confirmer qu'aucune autre
contrainte ne limite la cadence. Tant que ce point n'est pas tranché, aucun chiffre de
colis/jour ne doit être affiché comme exact.
