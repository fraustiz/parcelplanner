/**
 * A reader for Unreal Engine save files (GVAS), the format of Parcel
 * Simulator's `SaveN.sav`. Pure: bytes in, a property tree out.
 *
 * Two layouts of the property tag exist and both are in players' hands:
 *
 *   UE 5.3 (saves written before the game moved engine, Sept. 2026): the
 *     type is a string followed by type-specific fields (struct name and
 *     GUID, inner type of an array, key and value types of a map).
 *   UE 5.5+ (`PROPERTY_TAG_COMPLETE_TYPE_NAME`, package version 1012): the
 *     type is a tree of names, then a size and a byte of flags.
 *
 * Every property states its size, so one that cannot be read is skipped and
 * becomes `null` rather than failing the file. Only a broken frame (bad
 * magic, a size or count running past the end, absurd nesting) throws.
 *
 * The file comes from the player, so nothing in it is trusted: every length
 * and count is checked against the bytes left before anything is allocated.
 */

export class GvasError extends Error {}

export type GvasValue = null | boolean | number | string | GvasValue[] | GvasStruct;
export interface GvasStruct { [name: string]: GvasValue }

export interface GvasHeader {
  saveGameVersion: number;
  packageVersionUe4: number;
  packageVersionUe5: number;
  engine: { major: number; minor: number; patch: number; changelist: number; branch: string };
  saveClass: string;
}

export interface GvasSave {
  header: GvasHeader;
  properties: GvasStruct;
}

/** Package version from which property tags carry their full type tree. */
const COMPLETE_TYPE_NAME = 1012;
/** Deeper than any real save; a crafted file could otherwise recurse forever. */
const MAX_DEPTH = 64;
/** Longer than any name or path a save holds. */
const MAX_STRING_BYTES = 1 << 16;

interface TypeName { name: string; params: TypeName[] }

/**
 * Structs serialised as raw fields rather than as a property list, with how
 * to read them. Doubles: UE5 stores vectors in double precision.
 */
const NATIVE_STRUCTS: Record<string, (r: Reader) => GvasValue> = {
  Vector: (r) => [r.f64(), r.f64(), r.f64()],
  Rotator: (r) => [r.f64(), r.f64(), r.f64()],
  Quat: (r) => [r.f64(), r.f64(), r.f64(), r.f64()],
  Vector2D: (r) => [r.f64(), r.f64()],
  LinearColor: (r) => [r.f32(), r.f32(), r.f32(), r.f32()],
  Color: (r) => [r.u8(), r.u8(), r.u8(), r.u8()],
  IntPoint: (r) => [r.i32(), r.i32()],
  IntVector: (r) => [r.i32(), r.i32(), r.i32()],
  Guid: (r) => r.guid(),
  DateTime: (r) => r.i64(),
  Timespan: (r) => r.i64(),
};

const LATIN1 = new TextDecoder('latin1');
const UTF16 = new TextDecoder('utf-16le');

class Reader {
  pos = 0;
  private readonly view: DataView;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length(): number { return this.bytes.byteLength; }
  get left(): number { return this.bytes.byteLength - this.pos; }

  private need(n: number): number {
    if (n < 0 || n > this.left) throw new GvasError('unexpected end of file');
    const at = this.pos;
    this.pos += n;
    return at;
  }

  u8(): number { return this.view.getUint8(this.need(1)); }
  i32(): number { return this.view.getInt32(this.need(4), true); }
  u32(): number { return this.view.getUint32(this.need(4), true); }
  u16(): number { return this.view.getUint16(this.need(2), true); }
  f32(): number { return this.view.getFloat32(this.need(4), true); }
  f64(): number { return this.view.getFloat64(this.need(8), true); }
  i64(): number { return Number(this.view.getBigInt64(this.need(8), true)); }
  raw(n: number): Uint8Array { const at = this.need(n); return this.bytes.subarray(at, at + n); }

  /** 16 bytes as lowercase hex, in file order: only ever compared with itself. */
  guid(): string {
    let out = '';
    for (const b of this.raw(16)) out += b.toString(16).padStart(2, '0');
    return out;
  }

  /** An FString: positive length for Latin-1, negative for UTF-16, both with a terminator. */
  str(): string {
    const n = this.i32();
    if (n === 0) return '';
    const bytes = n > 0 ? n : -n * 2;
    if (bytes > MAX_STRING_BYTES) throw new GvasError('string too long');
    const raw = this.raw(bytes);
    return n > 0 ? LATIN1.decode(raw.subarray(0, -1)) : UTF16.decode(raw.subarray(0, -2));
  }

  /** A count of things each at least one byte long, checked before any allocation. */
  count(): number {
    const n = this.i32();
    if (n < 0 || n > this.left) throw new GvasError('count runs past the end of the file');
    return n;
  }
}

function readHeader(r: Reader): GvasHeader {
  const magic = r.raw(4);
  if (LATIN1.decode(magic) !== 'GVAS') throw new GvasError('not a GVAS save');
  const saveGameVersion = r.i32();
  const packageVersionUe4 = r.i32();
  const packageVersionUe5 = saveGameVersion >= 3 ? r.i32() : 0;
  const engine = {
    major: r.u16(), minor: r.u16(), patch: r.u16(), changelist: r.u32(), branch: r.str(),
  };
  r.i32(); // custom version format
  const customVersions = r.count();
  r.raw(customVersions * 20); // GUID + version each
  const saveClass = r.str();
  // Saves with full type names carry one more byte here (0 in every save
  // seen); the older layout goes straight to the properties.
  if (packageVersionUe5 >= COMPLETE_TYPE_NAME) r.u8();
  return { saveGameVersion, packageVersionUe4, packageVersionUe5, engine, saveClass };
}

/** Reads a property list up to its `None` terminator. */
class PropertyReader {
  constructor(private readonly r: Reader, private readonly complete: boolean) {}

  properties(depth: number): GvasStruct {
    if (depth > MAX_DEPTH) throw new GvasError('nesting too deep');
    const out: GvasStruct = {};
    for (;;) {
      const name = this.r.str();
      if (name === 'None' || name === '') return out;
      const { type, size, boolValue, nativeStruct } = this.complete ? this.newTag() : this.oldTag();
      if (size < 0 || size > this.r.left) throw new GvasError('property runs past the end of the file');
      const start = this.r.pos;
      let value: GvasValue;
      try {
        value = type.name === 'BoolProperty'
          ? boolValue
          : this.value(type, size, nativeStruct, depth);
      } catch (error) {
        if (!(error instanceof GvasError) && !(error instanceof RangeError)) throw error;
        value = null; // unreadable, skipped by its size below
      }
      this.r.pos = start + size;
      // Repeated names (static arrays) are kept, not overwritten.
      let key = name;
      for (let i = 2; Object.hasOwn(out, key); i++) key = `${name}#${i}`;
      out[key] = value;
    }
  }

  private typeName(depth = 0): TypeName {
    if (depth > MAX_DEPTH) throw new GvasError('type nesting too deep');
    const name = this.r.str();
    const n = this.r.count();
    const params: TypeName[] = [];
    for (let i = 0; i < n; i++) params.push(this.typeName(depth + 1));
    return { name, params };
  }

  /** UE 5.5+: type tree, size, flags. */
  private newTag() {
    const type = this.typeName();
    const size = this.r.i32();
    const flags = this.r.u8();
    if (flags & 0x01) this.r.i32(); // array index
    if (flags & 0x02) this.r.raw(16); // property GUID
    if (flags & 0x04) {
      const extensions = this.r.u8();
      if (extensions & 0x02) this.r.raw(2); // overridable operation
    }
    return { type, size, boolValue: (flags & 0x10) !== 0, nativeStruct: (flags & 0x08) !== 0 };
  }

  /** UE 5.3: type string, size, index, then fields that depend on the type. */
  private oldTag() {
    const typeString = this.r.str();
    const size = this.r.i32();
    this.r.i32(); // array index
    const leaf = (name: string): TypeName => ({ name, params: [] });
    let type: TypeName = leaf(typeString);
    let boolValue = false;
    switch (typeString) {
      case 'StructProperty': {
        const struct = this.r.str();
        this.r.raw(16);
        type = { name: typeString, params: [leaf(struct)] };
        break;
      }
      case 'BoolProperty': boolValue = this.r.u8() !== 0; break;
      case 'ByteProperty':
      case 'EnumProperty': type = { name: typeString, params: [leaf(this.r.str())] }; break;
      case 'ArrayProperty':
      case 'SetProperty': type = { name: typeString, params: [leaf(this.r.str())] }; break;
      case 'MapProperty': type = { name: typeString, params: [leaf(this.r.str()), leaf(this.r.str())] }; break;
    }
    if (this.r.u8() !== 0) this.r.raw(16); // property GUID
    return { type, size, boolValue, nativeStruct: false };
  }

  private value(type: TypeName, size: number, nativeStruct: boolean, depth: number): GvasValue {
    switch (type.name) {
      case 'StructProperty': {
        const struct = type.params[0]?.name ?? '';
        const native = NATIVE_STRUCTS[struct];
        if (native) return native(this.r);
        if (nativeStruct) return null; // binary layout this reader does not know
        return this.properties(depth + 1);
      }
      case 'ArrayProperty':
      case 'SetProperty': {
        if (type.name === 'SetProperty') this.r.i32(); // removed entries
        const n = this.r.count();
        const inner = type.params[0] ?? { name: '', params: [] };
        // A plain byte array is a blob; nothing here needs its content.
        if (inner.name === 'ByteProperty' && !this.isEnum(inner)) {
          this.r.raw(n);
          return null;
        }
        let element = inner;
        if (!this.complete && inner.name === 'StructProperty') {
          // The old layout repeats a full tag before a struct array.
          this.r.str(); this.r.str(); this.r.i32(); this.r.i32();
          const struct = this.r.str();
          this.r.raw(16);
          this.r.u8();
          element = { name: 'StructProperty', params: [{ name: struct, params: [] }] };
        }
        const out: GvasValue[] = [];
        for (let i = 0; i < n; i++) out.push(this.element(element, depth, 'array'));
        return out;
      }
      case 'MapProperty': {
        this.r.i32(); // removed entries
        const n = this.r.count();
        const key = type.params[0] ?? { name: '', params: [] };
        const val = type.params[1] ?? { name: '', params: [] };
        const out: GvasValue[] = [];
        for (let i = 0; i < n; i++) out.push([this.element(key, depth, 'key'), this.element(val, depth, 'value')]);
        return out;
      }
      case 'ByteProperty':
        return this.isEnum(type) ? this.r.str() : (size === 1 ? this.r.u8() : this.r.str());
      default:
        return this.scalar(type);
    }
  }

  private isEnum(type: TypeName): boolean {
    const name = type.params[0]?.name;
    return name !== undefined && name !== '' && name !== 'None';
  }

  /**
   * One element of an array or map. The old layout does not name the struct
   * of a map key or value: a key struct is taken as a GUID (the only kind in
   * this game's saves) and a value struct as a property list. A map's byte
   * values are enum names.
   */
  private element(type: TypeName, depth: number, role: 'array' | 'key' | 'value'): GvasValue {
    switch (type.name) {
      case 'StructProperty': {
        const struct = type.params[0]?.name ?? '';
        const native = NATIVE_STRUCTS[struct];
        if (native) return native(this.r);
        if (!this.complete && role === 'key' && struct === '') return this.r.guid();
        return this.properties(depth + 1);
      }
      case 'ByteProperty':
        return this.isEnum(type) || (role !== 'array' && !this.complete) ? this.r.str() : this.r.u8();
      case 'BoolProperty':
        return this.r.u8() !== 0;
      default:
        return this.scalar(type);
    }
  }

  private scalar(type: TypeName): GvasValue {
    switch (type.name) {
      case 'IntProperty': return this.r.i32();
      case 'UInt32Property': return this.r.u32();
      case 'Int64Property':
      case 'UInt64Property': return this.r.i64();
      case 'FloatProperty': return this.r.f32();
      case 'DoubleProperty': return this.r.f64();
      case 'BoolProperty': return this.r.u8() !== 0;
      case 'StrProperty':
      case 'NameProperty':
      case 'ObjectProperty':
      case 'EnumProperty': return this.r.str();
      default: throw new GvasError(`unsupported property type ${type.name}`);
    }
  }
}

export function readGvas(data: ArrayBuffer | Uint8Array): GvasSave {
  const r = new Reader(data instanceof Uint8Array ? data : new Uint8Array(data));
  const header = readHeader(r);
  const complete = header.packageVersionUe5 >= COMPLETE_TYPE_NAME;
  try {
    const properties = new PropertyReader(r, complete).properties(0);
    return { header, properties };
  } catch (error) {
    if (error instanceof RangeError) throw new GvasError('malformed save');
    throw error;
  }
}
