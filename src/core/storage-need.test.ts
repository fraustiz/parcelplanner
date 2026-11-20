import { describe, it, expect } from 'vitest';
import { longestClosedRun, storageNeeded } from './storage-need';

/**
 * How much storage a schedule demands: daily volume of a cargo type times the
 * longest run of days it is refused.
 */
const week = [0, 1, 2, 3, 4, 5, 6];

describe('longestClosedRun', () => {
  it('is nothing when the type is accepted every day', () => {
    expect(longestClosedRun(new Set(week), 7)).toBe(0);
  });

  it('counts a single closed day', () => {
    expect(longestClosedRun(new Set([0, 1, 2, 3, 4, 5]), 7)).toBe(1);
  });

  it('counts consecutive closed days', () => {
    // Closed on 3, 4, 5.
    expect(longestClosedRun(new Set([0, 1, 2, 6]), 7)).toBe(3);
  });

  it('takes the LONGEST run, not the first', () => {
    // Closed on 1, then on 3-4-5.
    expect(longestClosedRun(new Set([0, 2, 6]), 7)).toBe(3);
  });

  it('WRAPS around the end of the week', () => {
    // Closed on 5, 6 and 0: three consecutive days straddling the join (a
    // weekend closure).
    expect(longestClosedRun(new Set([1, 2, 3, 4]), 7)).toBe(3);
  });

  it('never exceeds the week, even when the type is never accepted', () => {
    // A fully closed week must not loop forever.
    expect(longestClosedRun(new Set(), 7)).toBe(7);
  });

  it('handles a week of one day', () => {
    expect(longestClosedRun(new Set(), 1)).toBe(1);
    expect(longestClosedRun(new Set([0]), 1)).toBe(0);
  });
});

describe('storageNeeded', () => {
  const cargo = ['Road', 'Rail', 'Air', 'Maritime'];

  it('splits the intake evenly across the cargo types', () => {
    // The one assumption, stated by the caller: game data gives no weighting.
    const need = storageNeeded({
      dailyIntake: 400,
      cargoTypes: cargo,
      // Everything accepted every day, so nothing accumulates.
      accepted: new Map(cargo.map((c) => [c, new Set(week)])),
      weekLength: 7,
    });
    expect(need.get('Road')?.perDay).toBe(100);
    expect(need.get('Road')?.parcels).toBe(0);
  });

  it('multiplies the daily volume by the longest closure', () => {
    const need = storageNeeded({
      dailyIntake: 400,
      cargoTypes: cargo,
      accepted: new Map([
        ['Road', new Set(week)],
        ['Rail', new Set(week)],
        ['Air', new Set([0, 1, 2, 3, 4])],   // closed 5 and 6
        ['Maritime', new Set(week)],
      ]),
      weekLength: 7,
    });
    expect(need.get('Air')?.closedRun).toBe(2);
    expect(need.get('Air')?.parcels).toBe(200);
    expect(need.get('Road')?.parcels).toBe(0);
  });

  it('rounds racks UP, because half a rack holds nothing', () => {
    const need = storageNeeded({
      dailyIntake: 4, cargoTypes: ['Air'],
      accepted: new Map([['Air', new Set([1])]]), // closed 6 of 7 days
      weekLength: 7,
    });
    // 4 a day, closed 6 days running = 24 parcels.
    expect(need.get('Air')?.parcels).toBe(24);
    expect(need.get('Air')?.racks.small).toBe(3);   // 24 / 8
    expect(need.get('Air')?.racks.medium).toBe(2);  // 24 / 12
    expect(need.get('Air')?.racks.large).toBe(2);   // 24 / 16 -> 1.5, up
  });

  it('needs no racks at all when nothing ever piles up', () => {
    const need = storageNeeded({
      dailyIntake: 400, cargoTypes: cargo,
      accepted: new Map(cargo.map((c) => [c, new Set(week)])),
      weekLength: 7,
    });
    for (const c of cargo) expect(need.get(c)?.racks.large).toBe(0);
  });

  it('treats a type with no schedule at all as never accepted', () => {
    // The worst case: missing input must not read as "fine".
    const need = storageNeeded({
      dailyIntake: 28, cargoTypes: ['Air'], accepted: new Map(), weekLength: 7,
    });
    expect(need.get('Air')?.closedRun).toBe(7);
    expect(need.get('Air')?.parcels).toBe(196);
  });

  it('gives every cargo type an entry, so none is silently skipped', () => {
    const need = storageNeeded({
      dailyIntake: 100, cargoTypes: cargo, accepted: new Map(), weekLength: 7,
    });
    expect([...need.keys()].sort()).toEqual([...cargo].sort());
  });

  it('says nothing for no cargo types rather than dividing by zero', () => {
    expect(storageNeeded({
      dailyIntake: 100, cargoTypes: [], accepted: new Map(), weekLength: 7,
    }).size).toBe(0);
  });
});

describe('the measured cargo split', () => {
  const week = 7;
  /** The guide's end-game case: five maxed doors, 910 parcels a day. */
  const guideCase = (closedDays: Record<string, number>) => storageNeeded({
    dailyIntake: 910,
    cargoTypes: ['Road', 'Rail', 'Air', 'Maritime'],
    share: new Map([['Road', 22 / 60], ['Rail', 22 / 60], ['Air', 11 / 60], ['Maritime', 5 / 60]]),
    validShare: 0.5,
    accepted: new Map(Object.entries(closedDays).map(([type, closed]) => [
      type, new Set(Array.from({ length: week - closed }, (_, i) => i)),
    ])),
    weekLength: week,
  });

  it('lands within a rack of the numbers a player measured in their own game', () => {
    // Rail waits 2 days, Air 4, Maritime 6; the community count of 10,000
    // parcels arrived at 20 / 20 / 15 large racks. Checks the whole chain
    // (trucks, cargo split, valid share, rack size) as one model.
    const need = guideCase({ Rail: 2, Air: 4, Maritime: 6 });
    expect(need.get('Rail')!.racks.large).toBe(21);
    expect(need.get('Air')!.racks.large).toBe(21);
    expect(need.get('Maritime')!.racks.large).toBe(15);
  });

  it('no longer treats Maritime as a quarter of everything', () => {
    // An even split would make Maritime, the longest wait, three times too big.
    const need = guideCase({ Maritime: 6 });
    expect(need.get('Maritime')!.perDay).toBeCloseTo(910 * (5 / 60) * 0.5, 1);
  });

  it('stores only the valid half', () => {
    const need = guideCase({ Rail: 1 });
    expect(need.get('Rail')!.perDay).toBeCloseTo(910 * (22 / 60) * 0.5, 1);
  });
});
