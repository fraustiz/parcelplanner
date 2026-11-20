import { describe, it, expect } from 'vitest';
import { encodePlan, decodePlan, MAX_FRAGMENT_LENGTH } from './serialize';
import type { Plan } from './types';

// End-to-end checks of the share codec. A shared link is the only copy of a
// plan sent to anyone, so the round trip must be lossless.
//
// Real UUID ids: placeholder ids like `p0` deflate to almost nothing and hide
// the true link length.
const belt = (i: number) => ({
  id: crypto.randomUUID(), objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'main' as const,
  floor: 0, cell: { x: i % 50, y: Math.floor(i / 50) }, rotation: 90 as const,
  mirrored: i % 2 === 0, tier: 2,
});

/** Deflates arbitrary JSON into a fragment the way encodePlan does, for the
 * payloads encodePlan itself would refuse to build. */
async function deflateToFragment(value: unknown): Promise<string> {
  const source = new Blob([JSON.stringify(value)]).stream();
  const deflated = await new Response(
    source.pipeThrough(new CompressionStream('deflate-raw')),
  ).arrayBuffer();
  return Buffer.from(deflated).toString('base64url');
}

/** The three halves of the pipeline, exposed for the tests that damage a
 * payload on purpose rather than going through encodePlan. */
const fromBase64UrlBytes = (fragment: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(Buffer.from(fragment, 'base64url'));

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const source = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(source).arrayBuffer());
}

async function deflateToFragmentBytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const source = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return Buffer.from(await new Response(source).arrayBuffer()).toString('base64url');
}

const plan = (count: number): Plan => ({
  gameVersion: 'test', warehouse: 'second',
  placements: Array.from({ length: count }, (_, i) => belt(i)),
  ownedTiers: [1, 2, 3, 15],
});

describe('sharing a plan through a URL fragment', () => {
  it('round-trips everything that describes a layout, down to mirror flags and owned tiers', async () => {
    const original = plan(40);
    const back = await decodePlan(await encodePlan(original));
    // Ids are not carried (runtime identity for undo and selection, which are
    // not shared); everything else must survive. `mirrored: false` and absent
    // mean the same (`p.mirrored ?? false`), so it is normalised.
    const meaningful = (p: Plan) => ({
      ...p,
      placements: p.placements.map(({ id, ...rest }) => ({ ...rest, mirrored: rest.mirrored === true })),
    });
    expect(meaningful(back)).toEqual(meaningful(original));
    expect(back.placements.every((p) => p.id.length > 0)).toBe(true);
    expect(new Set(back.placements.map((p) => p.id)).size).toBe(back.placements.length);
  });

  it('round-trips an empty plan', async () => {
    const empty: Plan = { gameVersion: 'test', warehouse: 'main', placements: [] };
    expect(await decodePlan(await encodePlan(empty))).toEqual(empty);
  });

  it('produces a fragment safe to paste in a URL', async () => {
    const encoded = await encodePlan(plan(200));
    // base64url: no +, / or = to be mangled by a chat client or a redirect.
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('keeps a realistically large layout well inside the fragment limit', async () => {
    // 300 conveyors is a full warehouse wall. The plan's own JSON deflates to
    // 9086 characters here: 300 UUIDs are incompressible.
    const encoded = await encodePlan(plan(300));
    expect(encoded.length).toBeLessThan(MAX_FRAGMENT_LENGTH / 4);
  });

  it('does not grow with the entropy of ids it never sends', async () => {
    // Two plans differing only in ids must encode to the same length.
    const a = await encodePlan(plan(100));
    const b = await encodePlan(plan(100));
    expect(a.length).toBe(b.length);
  });

  it('still reads a link made before the compact format existed', async () => {
    // Those carried the plan's full JSON. Such links must still load.
    const legacy = { gameVersion: 'test', warehouse: 'main' as const, placements: [belt(0)] };
    expect((await decodePlan(await deflateToFragment(legacy))).placements).toHaveLength(1);
  });

  it('rejects a corrupt fragment instead of returning a half-built plan', async () => {
    await expect(decodePlan('not-a-real-fragment')).rejects.toThrow();
  });

  it('rejects a well-formed fragment whose payload is not a plan', async () => {
    // Built by hand: this is what a truncated or hand-edited link decompresses to.
    await expect(decodePlan(await deflateToFragment({ hello: 'world' })))
      .rejects.toThrow(/not a ParcelPlanner plan/);
  });

  it('rejects a packed payload whose placement rows are malformed', async () => {
    // Right envelope, wrong contents: the shape check must look inside the rows.
    const bent = { v: 1, g: 'test', w: 0, t: null, o: ['belt'], p: [[0, 0, 'nope']] };
    await expect(decodePlan(await deflateToFragment(bent)))
      .rejects.toThrow(/not a ParcelPlanner plan/);
  });
});

// A real shared layout: 173 objects of 28 types over x 9-58 and y 8-54, all
// four rotations. Fixtures with identical ids or positions understate the size.
const REAL_LINK = 'jdZLb9s4EADg_6IzuxCHpB6-JWkuRVsEdYsegsBQY8IR6kgCK7sbLPrfixFliRxOsEEOdj4NRc7w5f-yc7aRIjtkm-zbrflHvYMcind5mYnsd7bJRTZmm-50PIqszzb32fXd7qbvzvald9f2OO62o2vaw9O4-9paJzORBNz0rrPu1cfXrt0frGOefOybPfvgrjn9Yh98646vtdmO7eNP666G4dhat7saBtef7f8HvrfdCze25tQ9PrE93R7tuRl7dhCDtfvfDffCq9PYv5rX9rHpOuvg9Rq7drSubebA3XeLU_KGwC3-c_x8ev7BdkzDb_pTN7qXt0Q27tB_fRnsWwYxNs_Dm3rvRtuNv-5c_9T-aEe7Zxp96NuOzeV9e7Zu5Os7HNtxtG4H39nJ8e_cKf7ppTW79qd6XboGH7Ide9cc7Jfm8efuk923p-fUPzbuYFO-_Xd0jX_2ILIh29zf5wL_IBeqELmQIn8Q99KbDA28gVBmMeVNhXHamw4NW-QCTGj4LRdQhFZ6K0OrvFWh1d7qcCzSJ6LyCH0mKspE-lQUROhzUVEu0iejomSkz0ZF2UifjorSkT4fFeUjfUIqSkj6jFQdVdxnpKOpAZ-RjufGZ6SjjMBnpKOMwGekdVgl8BlpE6HPSBcR-ox0GWKNn9jaaGrTfMSGJULxNj0TNUZeaPoUcmqN32VkUkDUVEq0-HUSGFNYnjw2jUbiDFaMxBVoJK7EIpK4Co3E1ViZdWOhwVStODe0YsltNol2icsXK0kN0CrG6tRMnvZhJDVAI-MDYYC-T6HF8wb6YkFbLYyibQ1aXCsoGCsZqxirU1M5jiWuvZLpmNGmuQrGrJYaBO8DrB95H2CdSVuFRtoqnKM8sZKxgjG6htA0MxYtpiqEYw7W8xpH94KS0_FB65cY1Li34rZQTedRvA7K0Ja51Osamvc04HDi8UnFG81DasYMb7RWsmCsZKyK7pPLnk4ML1DOwkt13m-pAd4RxBRv6xpa9hZrNTXDWMFYyVjFWB0aLMf9uu5nk4xBeN7PphjT4Tk-m2GsCM_x2arwzJ6tRoPE1jPbm5m6JnFVuC9nK8P9u1rF9JHUqsZukn5TU-GZsxqtgdGMGeZ9zJjRKhrH5ItmmLbAmKRW4PwS0-EZsYw5WVcGLvdlVIPAlvtDrvfbavQ3Axg8dsgZZvCISeM0Y4ax5O42eJykYynT-y21irE6NfwdlZhkDBhTjGnGDGNMHqrEo5LcKRUaiatTw42fmGQMGFOMTXnEY0Gj9yraup5Xo7_r0OhvQjS6htDo3Yi2rvvF1iU-kxGX6j38-Qs';

describe('a real shared layout', () => {
  it('still reads a link in the previous format', async () => {
    const plan = await decodePlan(REAL_LINK);
    expect(plan.placements).toHaveLength(173);
    expect(new Set(plan.placements.map((p) => p.objectId)).size).toBe(28);
  });

  it('re-encodes it to a fraction of its old length', async () => {
    const plan = await decodePlan(REAL_LINK);
    const encoded = await encodePlan(plan);
    // The bound sits just above the measured 375, so a format change that
    // bloats links fails here. Per-column entropy (9.2 bits per placement)
    // puts the floor near 266 characters (see packPlanBinary).
    expect(encoded.length).toBeLessThan(400);
  });

  it('keeps a layout of ordinary size well under a hundred characters', async () => {
    // Fragment length tracks object count. Measured on slices of the layout
    // above: empty 10 characters, 10 objects 43, 20 66, 30 94, 50 139.
    const real = await decodePlan(REAL_LINK);
    const encoded = await encodePlan({ ...real, placements: real.placements.slice(0, 30) });
    expect(encoded.length).toBeLessThan(100);
  });

  it('spells out a game version it does not know, rather than losing it', async () => {
    // A version missing from SHARE_GAME_VERSIONS must come back as its own
    // string: TopBar's mismatch warning depends on it.
    const real = await decodePlan(REAL_LINK);
    const old = { ...real, gameVersion: 'UE5.2-2025-01', placements: real.placements.slice(0, 3) };
    expect((await decodePlan(await encodePlan(old))).gameVersion).toBe('UE5.2-2025-01');
  });

  it('rejects a truncated payload instead of building half a layout', async () => {
    // Cuts the bytes inside a valid deflate stream, so the varint reader's
    // bounds check is exercised: without it a short payload would return a
    // plan whose last placements are silently unrotated.
    const inflated = await inflate(fromBase64UrlBytes(await encodePlan(plan(40))));
    const cut = inflated.subarray(0, Math.floor(inflated.length / 2));
    await expect(decodePlan(await deflateToFragmentBytes(cut)))
      .rejects.toThrow(/not a ParcelPlanner plan/);
  });

  it('survives the round trip object for object', async () => {
    const plan = await decodePlan(REAL_LINK);
    const back = await decodePlan(await encodePlan(plan));
    const key = (p: Plan) => p.placements
      .map((q) => [q.objectId, q.warehouse, q.floor, q.cell.x, q.cell.y, q.rotation, q.tier, q.mirrored === true].join(':'))
      .sort();
    expect(key(back)).toEqual(key(plan));
  });
});

describe('sharing a painted layout', () => {
  const painted = (colour?: string): Plan => ({
    gameVersion: 'test', warehouse: 'main',
    placements: [{ ...belt(0), ...(colour ? { colour } : {}) }],
  });

  it('carries a chosen colour across', async () => {
    const back = await decodePlan(await encodePlan(painted('#75bb59')));
    expect(back.placements[0]?.colour).toBe('#75bb59');
  });

  it('leaves an unpainted object unpainted', async () => {
    const back = await decodePlan(await encodePlan(painted()));
    expect(back.placements[0]?.colour).toBeUndefined();
  });

  it('costs almost nothing to paint a whole layout one colour', async () => {
    // Measured on the 173-object layout: 384 characters unpainted, 383 in one
    // colour. A column of identical values compresses like a column of zeros.
    const real = await decodePlan(REAL_LINK);
    const plain = await encodePlan(real);
    const oneColour = await encodePlan({
      ...real, placements: real.placements.map((p) => ({ ...p, colour: '#75bb59' })),
    });
    expect(Math.abs(oneColour.length - plain.length)).toBeLessThan(10);
  });

  it('costs something real only when the colours VARY', async () => {
    // Four colours alternating: 456 against 384. The cost falls only on
    // layouts that use colour.
    const real = await decodePlan(REAL_LINK);
    const mixed = await encodePlan({
      ...real,
      placements: real.placements.map((p, i) => ({
        ...p, colour: ['#c10217', '#00a2ba', '#75bb59', '#121110'][i % 4],
      })),
    });
    expect(mixed.length).toBeGreaterThan((await encodePlan(real)).length);
    expect(mixed.length).toBeLessThan(500);
  });

  it('drops a colour this app does not offer', async () => {
    // The payload comes from a stranger's URL and a colour goes straight into
    // a canvas fillStyle, so only the ten offered colours are honoured.
    const back = await decodePlan(await encodePlan(painted('#ff0000')));
    expect(back.placements[0]?.colour).toBeUndefined();
  });
});

describe('a colour this app no longer knows', () => {
  it('falls back to the artwork rather than being honoured', async () => {
    // The dropped cyan #00a2ba can still sit in localStorage or old links; it
    // must draw as the artwork does.
    const json = JSON.stringify({
      gameVersion: 'test', warehouse: 'main',
      placements: [{ ...belt(0), colour: '#00a2ba' }],
    });
    const back = await decodePlan(await deflateToFragment(JSON.parse(json)));
    expect(back.placements[0]?.colour).toBeUndefined();
  });

  it('keeps a colour the app does still offer', async () => {
    const back = await decodePlan(await deflateToFragment({
      gameVersion: 'test', warehouse: 'main',
      placements: [{ ...belt(0), colour: '#75bb59' }],
    }));
    expect(back.placements[0]?.colour).toBe('#75bb59');
  });

  it('does not throw the whole plan away over one bad colour', async () => {
    // A plan is never discarded because one object names a colour that is gone.
    const back = await decodePlan(await deflateToFragment({
      gameVersion: 'test', warehouse: 'main',
      placements: [{ ...belt(0), colour: 'chartreuse' }, belt(1)],
    }));
    expect(back.placements).toHaveLength(2);
  });

  it('drops a colour index past the end of the list', async () => {
    // The binary path: an index past the frozen list, possible in links made
    // while the list was longer.
    const bytes = await inflate(fromBase64UrlBytes(await encodePlan({
      gameVersion: 'test', warehouse: 'main',
      placements: [{ ...belt(0), colour: '#75bb59' }],
    })));
    // The colour column is the last byte: 1 + index. Push it past the end.
    bytes[bytes.length - 1] = 99;
    const back = await decodePlan(await deflateToFragmentBytes(bytes));
    expect(back.placements[0]?.colour).toBeUndefined();
  });
});
