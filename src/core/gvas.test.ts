import { describe, expect, it } from 'vitest';
import { GvasError, readGvas, type GvasStruct } from './gvas';

/**
 * A minimal GVAS writer, enough to build both tag layouts the game has
 * shipped. Real saves are not committed: they hold a player's whole game.
 */
class Writer {
  private parts: number[] = [];
  bytes(b: ArrayLike<number>) { for (let i = 0; i < b.length; i++) this.parts.push(b[i]!); return this; }
  u8(v: number) { return this.bytes([v & 0xff]); }
  u16(v: number) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return this.bytes(b); }
  i32(v: number) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v, true); return this.bytes(b); }
  f64(v: number) { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v, true); return this.bytes(b); }
  str(s: string) {
    if (s === '') return this.i32(0);
    this.i32(s.length + 1);
    for (const c of s) this.u8(c.charCodeAt(0));
    return this.u8(0);
  }
  get length() { return this.parts.length; }
  done() { return new Uint8Array(this.parts); }
}

const GUID_A = Array.from({ length: 16 }, (_, i) => i);
const GUID_B = Array.from({ length: 16 }, (_, i) => 0xf0 + i);
const hex = (b: number[]) => b.map((x) => x.toString(16).padStart(2, '0')).join('');

function header(w: Writer, ue5: number) {
  w.bytes([0x47, 0x56, 0x41, 0x53]).i32(3).i32(522).i32(ue5);
  w.u16(5).u16(ue5 >= 1012 ? 7 : 3).u16(4).i32(123).str('++UE5+Release');
  w.i32(3).i32(1).bytes(GUID_A).i32(7); // one custom version
  w.str('/Game/Core/Blueprints/Framework/BP_ParcelSaveGame.BP_ParcelSaveGame_C');
  if (ue5 >= 1012) w.u8(0);
}

/** Writes `body` into a temporary writer and returns its bytes, for sized values. */
function sized(body: (w: Writer) => void): Uint8Array {
  const w = new Writer();
  body(w);
  return w.done();
}

/** UE 5.3 layout. */
const old = {
  int(w: Writer, name: string, v: number) { w.str(name).str('IntProperty').i32(4).i32(0).u8(0).i32(v); },
  bool(w: Writer, name: string, v: boolean) { w.str(name).str('BoolProperty').i32(0).i32(0).u8(v ? 1 : 0).u8(0); },
  str(w: Writer, name: string, v: string) { const b = sized((x) => x.str(v)); w.str(name).str('StrProperty').i32(b.length).i32(0).u8(0).bytes(b); },
  vector(w: Writer, name: string, v: number[]) {
    w.str(name).str('StructProperty').i32(24).i32(0).str('Vector').bytes(GUID_A).u8(0);
    for (const x of v) w.f64(x);
  },
  struct(w: Writer, name: string, struct: string, body: (w: Writer) => void) {
    const b = sized((x) => { body(x); x.str('None'); });
    w.str(name).str('StructProperty').i32(b.length).i32(0).str(struct).bytes(GUID_A).u8(0).bytes(b);
  },
  structArray(w: Writer, name: string, struct: string, items: ((w: Writer) => void)[]) {
    const inner = sized((x) => { for (const item of items) { item(x); x.str('None'); } });
    const b = sized((x) => {
      x.i32(items.length);
      x.str(name).str('StructProperty').i32(inner.length).i32(0).str(struct).bytes(GUID_A).u8(0);
      x.bytes(inner);
    });
    w.str(name).str('ArrayProperty').i32(b.length).i32(0).str('StructProperty').u8(0).bytes(b);
  },
  guidToEnum(w: Writer, name: string, entries: [number[], string][]) {
    const b = sized((x) => { x.i32(0).i32(entries.length); for (const [k, v] of entries) x.bytes(k).str(v); });
    w.str(name).str('MapProperty').i32(b.length).i32(0).str('StructProperty').str('ByteProperty').u8(0).bytes(b);
  },
  guidToInt(w: Writer, name: string, entries: [number[], number][]) {
    const b = sized((x) => { x.i32(0).i32(entries.length); for (const [k, v] of entries) x.bytes(k).i32(v); });
    w.str(name).str('MapProperty').i32(b.length).i32(0).str('StructProperty').str('IntProperty').u8(0).bytes(b);
  },
};

/** UE 5.5+ layout: a type tree, then size and flags. */
const type = (w: Writer, name: string, ...params: ((w: Writer) => void)[]) => {
  w.str(name).i32(params.length);
  for (const p of params) p(w);
};
const leaf = (name: string) => (w: Writer) => type(w, name);
const neu = {
  int(w: Writer, name: string, v: number) { w.str(name); type(w, 'IntProperty'); w.i32(4).u8(0).i32(v); },
  bool(w: Writer, name: string, v: boolean) { w.str(name); type(w, 'BoolProperty'); w.i32(0).u8(v ? 0x10 : 0); },
  quat(w: Writer, name: string, v: number[]) {
    w.str(name); type(w, 'StructProperty', (x) => type(x, 'Quat', leaf('/Script/CoreUObject'))); w.i32(32).u8(0x08);
    for (const x of v) w.f64(x);
  },
  structArray(w: Writer, name: string, struct: string, items: ((w: Writer) => void)[]) {
    const b = sized((x) => { x.i32(items.length); for (const item of items) { item(x); x.str('None'); } });
    w.str(name); type(w, 'ArrayProperty', (x) => type(x, 'StructProperty', (y) => type(y, struct, leaf('/Game/x'))));
    w.i32(b.length).u8(0).bytes(b);
  },
  guidToEnum(w: Writer, name: string, entries: [number[], string][]) {
    const b = sized((x) => { x.i32(0).i32(entries.length); for (const [k, v] of entries) x.bytes(k).str(v); });
    w.str(name);
    type(w, 'MapProperty',
      (x) => type(x, 'StructProperty', (y) => type(y, 'Guid', leaf('/Script/CoreUObject'))),
      (x) => type(x, 'ByteProperty', (y) => type(y, 'E_GridManagerID', leaf('/Game/x'))));
    w.i32(b.length).u8(0).bytes(b);
  },
  unknown(w: Writer, name: string, size: number) { w.str(name); type(w, 'MysteryProperty'); w.i32(size).u8(0).bytes(new Array(size).fill(0xaa)); },
};

describe('readGvas, UE 5.3 layout', () => {
  const file = (() => {
    const w = new Writer();
    header(w, 1009);
    old.int(w, 'MoneyTotal', 263501);
    old.bool(w, 'IsWarehouse2_Owned', true);
    old.str(w, 'Name', 'Depot');
    old.structArray(w, 'InteractablesToSpawn', 'F_InteractableToSave', [
      (x) => {
        old.str(x, 'InteractableClass_2_ABC', '/Game/BP_ConveyorBelt_Loader.BP_ConveyorBelt_Loader_C');
        old.struct(x, 'Transform_8_DEF', 'Transform', (t) => old.vector(t, 'Translation', [7160, -2250, 0]));
      },
    ]);
    old.guidToEnum(w, 'InteractableGuidToGridManagerId', [[GUID_B, 'E_GridManagerID::NewEnumerator0']]);
    old.guidToInt(w, 'InteractableGuidToUpgradeTier', [[GUID_B, 3]]);
    w.str('None').i32(0);
    return w.done();
  })();

  it('reads the header', () => {
    const { header: h } = readGvas(file);
    expect(h.packageVersionUe5).toBe(1009);
    expect(h.engine).toMatchObject({ major: 5, minor: 3, patch: 4 });
    expect(h.saveClass).toMatch(/BP_ParcelSaveGame_C$/);
  });

  it('reads scalars, structs, struct arrays and GUID-keyed maps', () => {
    const p = readGvas(file).properties;
    expect(p.MoneyTotal).toBe(263501);
    expect(p.IsWarehouse2_Owned).toBe(true);
    expect(p.Name).toBe('Depot');
    const [object] = p.InteractablesToSpawn as GvasStruct[];
    expect(object!['InteractableClass_2_ABC']).toMatch(/Loader_C$/);
    expect((object!['Transform_8_DEF'] as GvasStruct).Translation).toEqual([7160, -2250, 0]);
    expect(p.InteractableGuidToGridManagerId).toEqual([[hex(GUID_B), 'E_GridManagerID::NewEnumerator0']]);
    expect(p.InteractableGuidToUpgradeTier).toEqual([[hex(GUID_B), 3]]);
  });
});

describe('readGvas, UE 5.5+ layout', () => {
  const file = (() => {
    const w = new Writer();
    header(w, 1018);
    neu.int(w, 'MoneyTotal', 7);
    neu.bool(w, 'IsWarehouse2_Owned', true);
    neu.unknown(w, 'SomethingNew', 5);
    neu.structArray(w, 'InteractablesToSpawn', 'F_InteractableToSave', [
      (x) => neu.quat(x, 'Rotation', [0, 0, 0.7071, 0.7071]),
    ]);
    neu.guidToEnum(w, 'InteractableGuidToGridManagerId', [[GUID_A, 'E_GridManagerID::NewEnumerator3']]);
    w.str('None').i32(0);
    return w.done();
  })();

  it('reads values out of typed tags, with the boolean in the flags', () => {
    const p = readGvas(file).properties;
    expect(p.MoneyTotal).toBe(7);
    expect(p.IsWarehouse2_Owned).toBe(true);
    expect((p.InteractablesToSpawn as GvasStruct[])[0]!.Rotation).toEqual([0, 0, 0.7071, 0.7071]);
    expect(p.InteractableGuidToGridManagerId).toEqual([[hex(GUID_A), 'E_GridManagerID::NewEnumerator3']]);
  });

  it('skips a property type it does not know by its size, and keeps reading', () => {
    const p = readGvas(file).properties;
    expect(p.SomethingNew).toBeNull();
    expect(p.InteractablesToSpawn).toHaveLength(1);
  });
});

describe('readGvas on a file it must refuse', () => {
  it('refuses something that is not a save', () => {
    expect(() => readGvas(new TextEncoder().encode('PK\u0003\u0004 not a save at all'))).toThrow(GvasError);
  });

  it('refuses a cut-off save instead of reading past its end', () => {
    const w = new Writer();
    header(w, 1009);
    old.int(w, 'MoneyTotal', 1);
    const cut = w.done().subarray(0, w.length - 2);
    expect(() => readGvas(cut)).toThrow(GvasError);
  });

  it('refuses a count larger than the file before allocating anything', () => {
    const w = new Writer();
    header(w, 1009);
    w.str('Huge').str('ArrayProperty').i32(8).i32(0).str('IntProperty').u8(0).i32(0x7fffffff).i32(0);
    w.str('None');
    // The array is unreadable, so it is skipped by its size and set to null.
    expect(readGvas(w.done()).properties.Huge).toBeNull();
  });

  it('refuses a property whose size runs past the end', () => {
    const w = new Writer();
    header(w, 1009);
    w.str('Big').str('IntProperty').i32(1_000_000).i32(0).u8(0).i32(1);
    expect(() => readGvas(w.done())).toThrow(GvasError);
  });
});
