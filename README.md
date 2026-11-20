# ParcelPlanner

A free warehouse planner for [Parcel Simulator](https://store.steampowered.com/app/2424010/Parcel_Simulator/).
Lay out conveyors, scanners, routers and storage racks on a grid, see what the
build will cost, and share the layout with a link, before building it in game.

Live at **https://parcelplanner.app**, in English and French, with no account.

## Features

- Top-down grid editor for both warehouses (and the Regional Sorting Centre's
  mezzanine), plus a workshop grid to build modules and paste them in.
- Running cost of placed objects, upgrade tiers and warehouse expansions.
- Placement checks (collisions, out of bounds), reserved areas, custom colours.
- Multi-select, copy and paste, rotate and mirror, undo and redo, touch gestures.
- Storage planner: rack capacity needed for a delivery schedule.
- Import of the game's official floor-plan spreadsheet (`.xlsx`).
- Share links: the plan in the URL fragment (`#p=`, never sent to the server)
  or a short link (`/s/<id>`) with a preview image. PNG export with a legend.

The plan you are building lives in your browser's `localStorage`. The site sets
no cookie.

## Running it

Requires Node.js 20.9 or later. Use Node 22 LTS to run the tests: under
Node 26, the built-in `localStorage` clashes with jsdom and many
component tests fail.

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # vitest
npm run build    # regenerates the game data, then next build
npm start
```

Nothing has to be configured to run it locally. Every setting is optional and
documented in [`.env.example`](.env.example): where short links and
suggestions are stored, the suggestions page key, Sentry and Umami.

In production, the data directory **must** be a persistent volume, or every
deploy deletes all short links. See [`docs/short-links.md`](docs/short-links.md).

## How the code is organised

| Folder | Contents |
|---|---|
| `src/core/` | Pure TypeScript domain logic: grid, cost, validation, share encoding, import. No React, no DOM. |
| `src/data/` | Game tables: catalogue, ports, shapes, doors, warehouses, tiers. `generated/` is built from `data/raw/` and `assets/`. |
| `src/store/` | Editor state (zustand) and undo/redo commands. |
| `src/render/` | Canvas renderer, shared with the server-side SVG previews. |
| `src/components/` | React UI. |
| `src/server/` | Short-link store, suggestions, rate limiting. |
| `scripts/` | Build-time data generation. |
| `data/raw/` | Tables exported from the game. See [`docs/game-data/extraction.md`](docs/game-data/extraction.md). |

## Contributing

Pull requests are welcome, especially to keep the game data up to date after
a game patch. Read [CONTRIBUTING.md](CONTRIBUTING.md) first: a few things,
like the order of `src/data/share-object-ids.ts`, must never change.

## Licence

The code is released under the [GNU Affero General Public License v3.0](LICENSE).
If you run a modified version for other people, you must share its source
under the same licence.

**Name and logo.** "ParcelPlanner" and its logo are not covered by the code
licence. A fork is welcome, under another name and logo.

**Game content.** Parcel Simulator, its name, and the data and icons taken
from it belong to their owners. ParcelPlanner is a fan project, not affiliated
with or endorsed by the game's developers. If you represent them and want
something changed or removed, open an issue and it will be done.

The floor-plan spreadsheet in `assets/fixtures/` is Parcel Simulator's
official template, included unchanged as a test fixture for the importer.

If you find ParcelPlanner useful, you can support it on [Ko-fi](https://ko-fi.com/fraustiz).
