# Contributing to ParcelPlanner

Thanks for helping. Bug reports, data fixes after a game update and new
features are all welcome.

## Before you start

- For anything bigger than a fix, open an issue first so we can agree on the
  approach.
- Keep pull requests small and focused on one change.
- Run `npm test` and `npm run build` before opening the pull request.

## Rules that must not be broken

1. **`src/data/share-object-ids.ts` is append-only.** Each object's position
   in that list is how it is written into share links. Reordering or removing
   an entry silently breaks every link already shared. New objects go at the
   end.
2. **The share link format is frozen.** Tests pin the exact encoding of
   existing plans. A plan with no new feature must encode byte for byte as
   before. New data goes in a new block after the existing ones.
3. **`src/core/` stays pure TypeScript.** No React, no DOM. Game logic inside
   a React component is a bug.
4. **Compass labels are inverted on screen.** In `src/data/ports.ts`, N means
   +y, which is *down* on the grid. Read the warning at the top of that file
   before touching ports.
5. **Never trust user data blindly.** Share payloads and imported spreadsheets
   come from strangers. Keep the existing validation.

## Updating the game data

After a game patch, follow [`docs/game-data/extraction.md`](docs/game-data/extraction.md)
to export the tables, then regenerate:

```bash
npm run catalogue
npm run shapes
npm run ui-shapes
npm run icons
```

Some numbers are community-sourced rather than read from the game files. They
are marked as such in `src/data/`. If you can confirm one in game, say how in
the pull request.

## Code style

- TypeScript, strict. Comments explain *why*, not *what*.
- Tests sit next to the code (`*.test.ts`, `*.test.tsx`) and use Vitest.
- User-facing text goes through `src/i18n/` and needs both English and French.

## Licence of contributions

By opening a pull request, you agree that your contribution is released under
the project's licence, the [GNU AGPL v3.0](LICENSE).
