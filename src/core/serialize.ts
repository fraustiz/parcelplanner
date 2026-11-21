import { SHARE_COUNTRY_DOOR_IDS, SHARE_GAME_VERSIONS, SHARE_OBJECT_IDS, shareIndexOf } from '@/data/share-object-ids';
import { COUNTRIES, isCountry } from '@/data/countries';
import { isObjectColour, OBJECT_COLOURS } from '@/data/colours';
import { CARGO_CHOICES, CARGO_DIVERTER, cleanDiverterSettings, COUNTRY_DIVERTER, COUNTRY_DIVERTER_CELLS } from './diverters';
import { rotatedFootprint } from './grid';
import type { Cell, Placement, Plan, PlanNote } from './types';
import { zoneObjectId, zoneSize } from './zone';

/** Saved plans and old share links may have placements without `warehouse`.
 * A plan is never discarded for it: it defaults to 'main' here, at the parse
 * boundary, so every other reader can rely on the field. */
const DEFAULT_PLACEMENT_WAREHOUSE = 'main';

/** Beyond this, share by file download instead of a URL fragment. */
export const MAX_FRAGMENT_LENGTH = 8000;

export function planToJson(plan: Plan): string {
  return JSON.stringify(plan);
}

const isWarehouse = (v: unknown): boolean => v === 'main' || v === 'second' || v === 'workshop';

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

function isCell(value: unknown): value is Cell {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return isFiniteNumber(v.x) && isFiniteNumber(v.y);
}

/**
 * `warehouse` is optional here although `Placement` requires it: older plans
 * lack it, and this only checks shape. `planFromJson` fills it in afterwards
 * (see DEFAULT_PLACEMENT_WAREHOUSE), never rejecting it.
 */
function isPlacement(value: unknown): value is Placement {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.objectId === 'string' &&
    (v.warehouse === undefined || isWarehouse(v.warehouse)) &&
    isFiniteNumber(v.floor) &&
    isCell(v.cell) &&
    (v.rotation === 0 || v.rotation === 90 || v.rotation === 180 || v.rotation === 270) &&
    // Optional too, but needs no migration: every reader treats undefined as
    // not mirrored.
    (v.mirrored === undefined || typeof v.mirrored === 'boolean') &&
    (v.label === undefined || typeof v.label === 'string') &&
    isFiniteNumber(v.tier)
  );
}

/**
 * A note's shape, checked because this reads a URL a stranger sent.
 * `warehouse` and `floor` are required: no older note shape exists.
 */
function isNote(value: unknown): value is PlanNote {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    isWarehouse(v.warehouse) &&
    isFiniteNumber(v.floor) &&
    isCell(v.cell) &&
    typeof v.text === 'string'
  );
}

function isPlan(value: unknown): value is Plan {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.gameVersion === 'string' &&
    isWarehouse(v.warehouse) &&
    Array.isArray(v.placements) && v.placements.every(isPlacement) &&
    (v.ownedTiers === undefined || (Array.isArray(v.ownedTiers) && v.ownedTiers.every(isFiniteNumber))) &&
    (v.notes === undefined || (Array.isArray(v.notes) && v.notes.every(isNote))) &&
    (v.doorCountries === undefined || isRecord(v.doorCountries))
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The door assignments worth keeping: a known country door to a known country id. Anything
 * else (a door this app does not have, a display name, a number) is dropped rather than
 * rejected, like an unknown colour, and the field goes away when nothing is left.
 */
function cleanDoorCountries(value: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  const kept = Object.entries(value).filter(
    (entry): entry is [string, string] => SHARE_COUNTRY_DOOR_IDS.includes(entry[0]) && isCountry(entry[1]),
  );
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/**
 * A trust boundary: `json` may come from a URL a stranger sent, so every field
 * is checked by shape and malformed input throws here, not deep in the editor.
 *
 * Old plans may still carry `expansions`, `licences` or `upgrades`; they are
 * ignored rather than rejected, and `planToJson` does not write them back.
 */
export function planFromJson(json: string): Plan {
  const parsed: unknown = JSON.parse(json);
  if (!isPlan(parsed)) {
    throw new Error('not a ParcelPlanner plan');
  }
  const { doorCountries, ...rest } = parsed;
  const doors = cleanDoorCountries(doorCountries);
  return {
    ...rest,
    ...(doors !== undefined ? { doorCountries: doors } : {}),
    placements: parsed.placements.map(({ colour, ...p }) => ({
      ...cleanDiverterSettings(p as Placement, isCountry),
      warehouse: p.warehouse ?? DEFAULT_PLACEMENT_WAREHOUSE,
      // A colour the app no longer offers (e.g. the dropped cyan #00a2ba) is
      // removed rather than rejected: it would go straight into a canvas fillStyle.
      ...(typeof colour === 'string' && isObjectColour(colour)
        ? { colour: colour.toLowerCase() }
        : {}),
    })),
  };
}

const toBase64Url = (bytes: Uint8Array<ArrayBuffer>): string => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

async function through(stream: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

const SHARE_VERSION = 2;
/** Building by index, for the header, notes and zones. Append only, like
 * SHARE_OBJECT_IDS. Placement columns have one bit for it, so only the first
 * two fit there (see the workshop block). */
const WAREHOUSES_BY_INDEX = ['main', 'second', 'workshop'] as const;

/**
 * First byte of the binary format. The older text formats start with `'2'`
 * (byte 50) or `'{'` (123), so the first byte tells them apart.
 */
const SHARE_VERSION_BINARY = 3;

/** Signed to unsigned, so small negative deltas (frequent: every row starts
 * left of the last) stay one varint byte. */
const zigzag = (n: number): number => (n < 0 ? -n * 2 - 1 : n * 2);
const unzigzag = (n: number): number => (n % 2 === 1 ? -(n + 1) / 2 : n / 2);

function writeVarint(out: number[], value: number): void {
  let v = value;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 0x80);
  }
  out.push(v);
}

/** Reads varints, refusing to run off the end: a truncated payload from a
 * stranger's URL must throw, not yield undefined. */
class ByteReader {
  private at = 0;
  constructor(private readonly bytes: Uint8Array) {}

  varint(): number {
    let result = 0;
    let shift = 1;
    for (;;) {
      if (this.at >= this.bytes.length) throw new Error('not a ParcelPlanner plan');
      const byte = this.bytes[this.at++]!;
      result += (byte & 0x7f) * shift;
      if ((byte & 0x80) === 0) return result;
      shift *= 0x80;
      if (shift > 2 ** 42) throw new Error('not a ParcelPlanner plan');
    }
  }

  /** Whether every byte has been read. Distinguishes "this payload predates a
   * column" from "this payload is truncated". */
  exhausted(): boolean {
    return this.at >= this.bytes.length;
  }

  bytesOf(length: number): Uint8Array {
    if (length < 0 || this.at + length > this.bytes.length) {
      throw new Error('not a ParcelPlanner plan');
    }
    const slice = this.bytes.subarray(this.at, this.at + length);
    this.at += length;
    return slice;
  }
}

/**
 * Packs a plan into bytes column by column: every object index, then every
 * y-delta, x-delta and flags byte. Deflate compresses long runs of similar
 * numbers far better than interleaved fields (about 15% here).
 *
 * Measured on a real 173-object layout: 9086 characters as plain JSON, 375 in
 * this format, 384 with the colour column. Length tracks object count, about
 * 2.2 characters each after a 10-character header, and per-column entropy puts
 * the floor near 266, so a short link for a big layout needs a server.
 *
 * Placements come back sorted, which is what allows position deltas. Nothing
 * depends on their order.
 */
function packPlanBinary(plan: Plan): Uint8Array<ArrayBuffer> {
  // Zones travel in their own block at the end: an id SHARE_OBJECT_IDS does not
  // hold would go out as index 0 and come back as the first object in the list.
  const zones = plan.placements.filter((p) => zoneSize(p.objectId) !== null);
  // Workshop objects get their own block too, last: the columns have one bit
  // for the building, enough for main or second only.
  const objects = plan.placements.filter((p) => zoneSize(p.objectId) === null);
  const built = objects.filter((p) => p.warehouse !== 'workshop');
  const benched = objects.filter((p) => p.warehouse === 'workshop');

  const out: number[] = [SHARE_VERSION_BINARY, WAREHOUSES_BY_INDEX.indexOf(plan.warehouse)];

  // A known game version travels as its index; 0 means an unknown one, spelt
  // out next. See SHARE_GAME_VERSIONS for why it is not omitted.
  const known = SHARE_GAME_VERSIONS.indexOf(plan.gameVersion);
  writeVarint(out, known + 1);
  if (known < 0) {
    const version = new TextEncoder().encode(plan.gameVersion);
    writeVarint(out, version.length);
    out.push(...version);
  }

  // 0 means no ownedTiers field, which reads as every tier owned, not none.
  // Otherwise 1 + the count, then ascending deltas (a full set deflates to nothing).
  if (plan.ownedTiers === undefined) {
    writeVarint(out, 0);
  } else {
    const tiers = [...plan.ownedTiers].sort((a, b) => a - b);
    writeVarint(out, tiers.length + 1);
    let previous = 0;
    for (const tier of tiers) {
      writeVarint(out, zigzag(tier - previous));
      previous = tier;
    }
  }

  writeColumns(out, built);

  // Notes go after the columns, and only when needed. Links without notes end
  // at the colours column, and the reader treats that end as "no notes", so the
  // version byte stays the same. A plan with zones or workshop objects writes
  // the notes count even when zero, to keep the later blocks where the reader
  // looks for them.
  const notes = plan.notes ?? [];
  // Door countries go last of all (see below); every block before them is then written,
  // empty if need be, so the reader finds them.
  const countries = doorCountryPairs(plan);
  // Diverter settings go after the door countries, so they too force every earlier block.
  const set = plan.placements.filter((p) => p.diverterCountries !== undefined || p.diverterCargo !== undefined);
  const later = countries.length > 0 || set.length > 0;
  if (notes.length > 0 || zones.length > 0 || benched.length > 0 || later) {
    writeVarint(out, notes.length);
    const text = new TextEncoder();
    for (const note of notes) {
      writeVarint(out, zigzag(note.cell.x));
      writeVarint(out, zigzag(note.cell.y));
      writeVarint(out, WAREHOUSES_BY_INDEX.indexOf(note.warehouse));
      writeVarint(out, note.floor);
      // Length-prefixed UTF-8 bytes, not characters, so accented notes survive.
      const encoded = text.encode(note.text);
      writeVarint(out, encoded.length);
      out.push(...encoded);
    }
  }

  // Zones, after the notes: a link that ends before them has none. Written as
  // the ground they cover (rotation 0, same top-left cell): a zone has no front.
  if (zones.length > 0 || benched.length > 0 || later) {
    writeVarint(out, zones.length);
    const text = new TextEncoder();
    for (const zone of zones) {
      const { w, h } = rotatedFootprint(zoneSize(zone.objectId)!, zone.rotation);
      writeVarint(out, zigzag(zone.cell.x));
      writeVarint(out, zigzag(zone.cell.y));
      writeVarint(out, WAREHOUSES_BY_INDEX.indexOf(zone.warehouse));
      writeVarint(out, zone.floor);
      writeVarint(out, w);
      writeVarint(out, h);
      // The same 0-or-1+index the colours column uses.
      writeVarint(out, zone.colour ? OBJECT_COLOURS.indexOf(zone.colour.toLowerCase()) + 1 : 0);
      const label = text.encode(zone.label ?? '');
      writeVarint(out, label.length);
      out.push(...label);
    }
  }

  // Workshop objects, last, in the same columns; their position marks them as
  // the workshop's. A link that ends before this block has nothing on the bench.
  if (benched.length > 0 || later) writeColumns(out, benched);

  // Country doors, last: a count, then each door's index in SHARE_COUNTRY_DOOR_IDS and its
  // country's in COUNTRIES. A link that ends before this block assigns none.
  if (later) {
    writeVarint(out, countries.length);
    for (const [door, country] of countries) {
      writeVarint(out, door);
      writeVarint(out, country);
    }
  }

  // Diverter settings, last: a count, then each diverter's place (building,
  // floor, cell) and its screens, 0 for unset and otherwise 1 + the index in
  // COUNTRIES or CARGO_CHOICES. Placements carry no stable id in a link, so the
  // reader finds the diverter by where it stands.
  if (set.length > 0) {
    writeVarint(out, set.length);
    for (const p of set) {
      writeVarint(out, WAREHOUSES_BY_INDEX.indexOf(p.warehouse));
      writeVarint(out, p.floor);
      writeVarint(out, zigzag(p.cell.x));
      writeVarint(out, zigzag(p.cell.y));
      if (p.objectId === COUNTRY_DIVERTER) {
        writeVarint(out, 0);
        for (let cell = 0; cell < COUNTRY_DIVERTER_CELLS; cell++) {
          for (const side of ['left', 'right'] as const) {
            writeVarint(out, COUNTRIES.indexOf(p.diverterCountries?.[cell]?.[side] ?? '') + 1);
          }
        }
      } else {
        writeVarint(out, 1);
        for (const way of ['left', 'forward', 'right'] as const) {
          const choice = p.diverterCargo?.[way];
          writeVarint(out, choice === undefined ? 0 : CARGO_CHOICES.indexOf(choice) + 1);
        }
      }
    }
  }
  return new Uint8Array(out);
}

/** The plan's door assignments as (door index, country index) pairs, in door order,
 * leaving out any the frozen lists do not hold. */
function doorCountryPairs(plan: Plan): [number, number][] {
  return Object.entries(plan.doorCountries ?? {})
    .map(([door, country]) => [SHARE_COUNTRY_DOOR_IDS.indexOf(door), COUNTRIES.indexOf(country)] as [number, number])
    .filter(([door, country]) => door >= 0 && country >= 0)
    .sort((a, b) => a[0] - b[0]);
}

/**
 * Placements as count-prefixed columns (object index, y-delta, x-delta, flags,
 * colour), sorted so positions can be deltas. See packPlanBinary.
 * The flags' building bit is 1 for the second warehouse and 0 otherwise; the
 * workshop block is identified by its position, not by this bit.
 */
function writeColumns(out: number[], placements: readonly Placement[]): void {
  const sorted = [...placements].sort((a, b) =>
    WAREHOUSES_BY_INDEX.indexOf(a.warehouse) - WAREHOUSES_BY_INDEX.indexOf(b.warehouse)
    || a.floor - b.floor || a.cell.y - b.cell.y || a.cell.x - b.cell.x);

  const objects: number[] = [];
  const dys: number[] = [];
  const dxs: number[] = [];
  const flags: number[] = [];
  // 0 for its own colour, otherwise 1 + the index in OBJECT_COLOURS. A separate
  // column, so an unpainted layout is a run of zeros that deflates away.
  const colours: number[] = [];
  let lastY = 0;
  let lastX = 0;
  for (const p of sorted) {
    objects.push(Math.max(0, shareIndexOf(p.objectId)));
    dys.push(zigzag(p.cell.y - lastY));
    dxs.push(zigzag(p.cell.x - lastX));
    lastY = p.cell.y;
    lastX = p.cell.x;
    // Bits 0-1 rotation, 2 mirrored, 3 warehouse, 4-7 floor, 8+ tier. Usually one
    // byte; a higher tier widens the varint instead of wrapping into the floor.
    colours.push(p.colour ? OBJECT_COLOURS.indexOf(p.colour.toLowerCase()) + 1 : 0);
    flags.push(
      (p.rotation / 90)
      | ((p.mirrored ? 1 : 0) << 2)
      | ((p.warehouse === 'second' ? 1 : 0) << 3)
      | (p.floor << 4)
      | ((p.tier - 1) * 256),
    );
  }

  writeVarint(out, sorted.length);
  for (const column of [objects, dys, dxs, flags, colours]) {
    for (const value of column) writeVarint(out, value);
  }
}

/** Reads what writeColumns wrote. `home`, when given, is the building every
 * placement in the block belongs to, whatever its flags bit says. */
function readColumns(reader: ByteReader, home?: Placement['warehouse']): Placement[] {
  const count = reader.varint();
  const read = (): number[] => Array.from({ length: count }, () => reader.varint());
  const objects = read();
  const dys = read();
  const dxs = read();
  const flags = read();
  // Links made before colours end here. A missing column means nothing was
  // painted, not a corrupt payload.
  const colours = reader.exhausted() ? new Array<number>(count).fill(0) : read();

  const placements: Placement[] = [];
  let lastY = 0;
  let lastX = 0;
  for (let i = 0; i < count; i++) {
    lastY += unzigzag(dys[i]!);
    lastX += unzigzag(dxs[i]!);
    const objectId = SHARE_OBJECT_IDS[objects[i]!];
    if (objectId === undefined) throw new Error('not a ParcelPlanner plan');
    const bits = flags[i]!;
    const warehouse = home ?? WAREHOUSES_BY_INDEX[(bits >> 3) & 1];
    placements.push({
      // Fresh ids: the originals are never sent.
      id: crypto.randomUUID(),
      objectId,
      warehouse: warehouse ?? 'main',
      floor: (bits >> 4) & 15,
      cell: { x: lastX, y: lastY },
      rotation: ((bits & 3) * 90) as Placement['rotation'],
      ...((bits & 4) === 4 ? { mirrored: true } : {}),
      // Only the app's own colours are honoured: a stranger's payload goes
      // straight into a canvas fillStyle. Out-of-range indexes leave the field
      // absent, not undefined, which is what readers test for.
      ...(OBJECT_COLOURS[(colours[i] ?? 0) - 1] !== undefined
        ? { colour: OBJECT_COLOURS[colours[i]! - 1]! }
        : {}),
      tier: Math.floor(bits / 256) + 1,
    });
  }
  return placements;
}

function unpackPlanBinary(bytes: Uint8Array): Plan {
  const reader = new ByteReader(bytes.subarray(1));
  const planWarehouse = WAREHOUSES_BY_INDEX[reader.varint()];
  if (planWarehouse === undefined) throw new Error('not a ParcelPlanner plan');

  const known = reader.varint();
  const gameVersion = known === 0
    ? new TextDecoder().decode(reader.bytesOf(reader.varint()))
    : SHARE_GAME_VERSIONS[known - 1];
  if (gameVersion === undefined) throw new Error('not a ParcelPlanner plan');

  const tierCount = reader.varint();
  let ownedTiers: number[] | undefined;
  if (tierCount > 0) {
    ownedTiers = [];
    let previous = 0;
    for (let i = 0; i < tierCount - 1; i++) {
      previous += unzigzag(reader.varint());
      ownedTiers.push(previous);
    }
  }

  const placements = readColumns(reader);

  const plan: Plan = { gameVersion, warehouse: planWarehouse, placements };
  if (ownedTiers !== undefined) plan.ownedTiers = ownedTiers;

  // Running out here means the payload predates notes; links without notes end
  // at the colours column, which is why `exhausted` exists.
  if (!reader.exhausted()) {
    const notes: PlanNote[] = [];
    const count = reader.varint();
    const text = new TextDecoder();
    for (let i = 0; i < count; i++) {
      const x = unzigzag(reader.varint());
      const y = unzigzag(reader.varint());
      const warehouse = WAREHOUSES_BY_INDEX[reader.varint()];
      const floor = reader.varint();
      const length = reader.varint();
      if (warehouse === undefined) throw new Error('not a ParcelPlanner plan');
      notes.push({
        // Fresh ids, as for placements.
        id: crypto.randomUUID(),
        warehouse,
        floor,
        cell: { x, y },
        text: text.decode(reader.bytesOf(length)),
      });
    }
    if (notes.length > 0) plan.notes = notes;
  }

  // Running out here means the payload predates zones, or has none.
  if (!reader.exhausted()) {
    const count = reader.varint();
    const text = new TextDecoder();
    for (let i = 0; i < count; i++) {
      const x = unzigzag(reader.varint());
      const y = unzigzag(reader.varint());
      const warehouse = WAREHOUSES_BY_INDEX[reader.varint()];
      const floor = reader.varint();
      const objectId = zoneObjectId(reader.varint(), reader.varint());
      const colour = OBJECT_COLOURS[reader.varint() - 1];
      const label = text.decode(reader.bytesOf(reader.varint()));
      // A size no zone can have is a payload this app did not write.
      if (warehouse === undefined || zoneSize(objectId) === null) {
        throw new Error('not a ParcelPlanner plan');
      }
      placements.push({
        id: crypto.randomUUID(),
        objectId,
        warehouse,
        floor,
        cell: { x, y },
        rotation: 0,
        // Absent rather than undefined, and only the app's own colours.
        ...(colour !== undefined ? { colour } : {}),
        ...(label !== '' ? { label } : {}),
        tier: 1,
      });
    }
  }

  // The workshop's objects, after the zones (see packPlanBinary).
  if (!reader.exhausted()) placements.push(...readColumns(reader, 'workshop'));

  // Country doors, after the workshop (see packPlanBinary).
  if (!reader.exhausted()) {
    const count = reader.varint();
    const doorCountries: Record<string, string> = {};
    for (let i = 0; i < count; i++) {
      const door = SHARE_COUNTRY_DOOR_IDS[reader.varint()];
      const country = COUNTRIES[reader.varint()];
      // An index past either list is a payload this app did not write.
      if (door === undefined || country === undefined) throw new Error('not a ParcelPlanner plan');
      doorCountries[door] = country;
    }
    if (count > 0) plan.doorCountries = doorCountries;
  }

  // Diverter settings, after the door countries (see packPlanBinary).
  if (!reader.exhausted()) {
    const count = reader.varint();
    for (let i = 0; i < count; i++) {
      const warehouse = WAREHOUSES_BY_INDEX[reader.varint()];
      const floor = reader.varint();
      const x = unzigzag(reader.varint());
      const y = unzigzag(reader.varint());
      const kind = reader.varint();
      const at = (p: Placement) => p.warehouse === warehouse && p.floor === floor && p.cell.x === x && p.cell.y === y;
      if (warehouse === undefined || (kind !== 0 && kind !== 1)) throw new Error('not a ParcelPlanner plan');
      if (kind === 0) {
        const screens = Array.from({ length: COUNTRY_DIVERTER_CELLS }, () => {
          const left = COUNTRIES[reader.varint() - 1];
          const right = COUNTRIES[reader.varint() - 1];
          return { ...(left !== undefined ? { left } : {}), ...(right !== undefined ? { right } : {}) };
        });
        const target = placements.find((p) => at(p) && p.objectId === COUNTRY_DIVERTER);
        if (target) target.diverterCountries = screens;
      } else {
        const ways = Object.fromEntries((['left', 'forward', 'right'] as const)
          .map((way) => [way, CARGO_CHOICES[reader.varint() - 1]] as const)
          .filter(([, choice]) => choice !== undefined));
        const target = placements.find((p) => at(p) && p.objectId === CARGO_DIVERTER);
        if (target) target.diverterCargo = ways;
      }
    }
  }
  return plan;
}

/**
 * Reads the first compact format: JSON tuples against an id dictionary.
 * Links in this format still exist, so it must keep decoding.
 */
function unpackV1(parsed: unknown): Plan | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const v = parsed as Record<string, unknown>;
  if (v.v !== 1 || typeof v.g !== 'string' || !isFiniteNumber(v.w)) return null;
  if (!Array.isArray(v.o) || !v.o.every((id) => typeof id === 'string')) return null;
  if (!Array.isArray(v.p)) return null;

  const objectIds = v.o as string[];
  const placements: Placement[] = [];
  for (const row of v.p) {
    if (!Array.isArray(row) || row.length !== 8 || !row.every(isFiniteNumber)) return null;
    const [object, home, floor, x, y, rotation, tier, mirrored] = row as number[];
    placements.push({
      id: crypto.randomUUID(),
      objectId: objectIds[object!] ?? '',
      warehouse: WAREHOUSES_BY_INDEX[home!] ?? 'main',
      floor: floor!,
      cell: { x: x!, y: y! },
      rotation: ((rotation! % 4) * 90) as Placement['rotation'],
      ...(mirrored === 1 ? { mirrored: true } : {}),
      tier: tier!,
    });
  }
  const plan: Plan = { gameVersion: v.g, warehouse: WAREHOUSES_BY_INDEX[v.w] ?? 'main', placements };
  if (Array.isArray(v.t) && v.t.every(isFiniteNumber)) plan.ownedTiers = v.t as number[];
  return plan;
}

/**
 * Reads the second compact format, the text one:
 * `2|gameVersion|planWarehouse|ownedTiers|placement;...`, each placement
 * `object.dy.dx.rotation` plus `.floor.tier.mirrored.warehouse` when any of
 * those is off its default. Links in this format still exist.
 */
function unpackPlan(text: string): Plan {
  const [version, gameVersion, warehouse, tiers, body = ''] = text.split('|');
  if (Number(version) !== SHARE_VERSION || gameVersion === undefined) {
    throw new Error('not a ParcelPlanner plan');
  }

  let lastY = 0;
  let lastX = 0;
  const placements: Placement[] = [];
  for (const token of body.split(';')) {
    if (token === '') continue;
    const n = token.split('.').map(Number);
    if (n.length !== 4 && n.length !== 8) throw new Error('not a ParcelPlanner plan');
    const [object, dy, dx, rotation, floor = 0, tier = 1, mirrored = 0, home = 0] = n as number[];
    if (![object, dy, dx, rotation].every(Number.isFinite)) throw new Error('not a ParcelPlanner plan');
    lastY += dy!;
    lastX += dx!;
    const objectId = SHARE_OBJECT_IDS[object!];
    if (objectId === undefined) throw new Error('not a ParcelPlanner plan');
    placements.push({
      // Fresh ids: the originals are never sent.
      id: crypto.randomUUID(),
      objectId,
      warehouse: WAREHOUSES_BY_INDEX[home!] ?? 'main',
      floor: floor!,
      cell: { x: lastX, y: lastY },
      rotation: ((rotation! % 4) * 90) as Placement['rotation'],
      ...(mirrored === 1 ? { mirrored: true } : {}),
      tier: tier!,
    });
  }

  const plan: Plan = {
    gameVersion,
    warehouse: WAREHOUSES_BY_INDEX[Number(warehouse)] ?? 'main',
    placements,
  };
  if (tiers !== '') plan.ownedTiers = tiers!.split(',').map(Number);
  return plan;
}

export async function encodePlan(plan: Plan): Promise<string> {
  const source = new Blob([packPlanBinary(plan)]).stream();
  return toBase64Url(await through(source.pipeThrough(new CompressionStream('deflate-raw'))));
}

export async function decodePlan(encoded: string): Promise<Plan> {
  const source = new Blob([fromBase64Url(encoded)]).stream();
  const bytes = await through(source.pipeThrough(new DecompressionStream('deflate-raw')));

  if (bytes[0] === SHARE_VERSION_BINARY) return unpackPlanBinary(bytes);

  const text = new TextDecoder().decode(bytes);
  if (text.startsWith(`${SHARE_VERSION}|`)) return unpackPlan(text);

  // Older links, newest first: the packed-JSON format, then the very first one
  // that carried the plan's own JSON. Both are already out in the world.
  const parsed: unknown = JSON.parse(text);
  return unpackV1(parsed) ?? planFromJson(text);
}
