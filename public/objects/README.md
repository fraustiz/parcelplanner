# Palette icon overrides

The palette does NOT normally need an icon file. By default it draws each
object's own grid artwork (the same `assets/shapes/*.svg` data the canvas
renders), so a palette row always looks like the thing it places, and the two
can never drift apart because there is only one drawing. See
`src/components/ObjectIcon.tsx`.

This folder is the override for when that is not what you want: an object with
no artwork yet (the elevator, the speedway, the storage racks), or one whose
artwork is unreadable at 24px.

Drop an SVG here named after the catalogue object id it belongs to, and it
replaces that object's palette icon on the next build. No code change is
needed anywhere.

    public/objects/BP_StorageRack_Medium.svg   ->  palette icon for BP_StorageRack_Medium

The file is served exactly as authored: nothing parses, rewrites, or
recolours it. Sizing is handled by CSS, so any viewBox works, but a square one
lines up best with the rest of the palette.

Catalogue ids are the `id` field in `src/data/generated/catalogue.json`; run
`npm run catalogue` to regenerate it. A file named after an id that does not
exist FAILS the build with a message naming the file, rather than being
quietly ignored.

This only affects the palette. What is drawn on the grid always comes from
`assets/shapes/`.
