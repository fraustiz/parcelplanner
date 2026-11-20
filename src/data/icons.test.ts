// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CARGO_TYPE_ICONS, COUNTRY_DOOR_ICON, KEEP_OWN_COLOURS, OBJECT_ICONS, PARCEL_ICON } from './icons';

/**
 * Every icon path points at a file that exists. The canvas skips images that fail to load
 * without an error, so a missing file would otherwise go unnoticed.
 */
describe('the icon files behind the icon paths', () => {
  const publicDir = join(process.cwd(), 'public');
  const declared: [string, string][] = [
    ['PARCEL_ICON', PARCEL_ICON],
    ['COUNTRY_DOOR_ICON', COUNTRY_DOOR_ICON],
    ...Object.entries(OBJECT_ICONS).map(([k, v]) => [`OBJECT_ICONS.${k}`, v] as [string, string]),
    ...Object.entries(CARGO_TYPE_ICONS).map(([k, v]) => [`CARGO_TYPE_ICONS.${k}`, v] as [string, string]),
  ];

  it.each(declared)('%s exists in public/', (_name, path) => {
    expect(existsSync(join(publicDir, path))).toBe(true);
  });

  it('serves the parcel from the artwork folder, not from code', () => {
    // The parcel is a file rendered as authored, not an inline copy of the shape.
    expect(PARCEL_ICON.endsWith('.png')).toBe(true);
  });
});

describe('which icons the canvas is allowed to recolour', () => {
  it('leaves the parcel in its own colours', () => {
    // The canvas cache repaints images solid black, which suits the pale criteria glyphs but
    // not a drawing with its own colours.
    expect(KEEP_OWN_COLOURS.has(PARCEL_ICON)).toBe(true);
  });

  it('still blackens the glyphs stamped onto objects', () => {
    // The glyphs stamped on a placed object's artwork must still be blackened to be visible.
    for (const path of Object.values(OBJECT_ICONS)) {
      expect(KEEP_OWN_COLOURS.has(path)).toBe(false);
    }
    expect(KEEP_OWN_COLOURS.has(COUNTRY_DOOR_ICON)).toBe(false);
  });
});
