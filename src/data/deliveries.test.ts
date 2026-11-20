import { describe, it, expect } from 'vitest';
import { dailyIntakePerDoor, PARCELS_PER_TRUCK, trucksPerDay } from './deliveries';

describe('what a delivery door brings in', () => {
  it('carries 3, 5 then 7 parcels a truck', () => {
    expect(PARCELS_PER_TRUCK).toEqual([3, 5, 7]);
  });

  it('runs 11 trucks a day with no speed upgrade', () => {
    expect(trucksPerDay(0)).toBe(11);
  });

  it('runs 15 with one upgrade and keeps climbing after it', () => {
    // A community measurement over 10,000 parcels gives 26 openings a day fully upgraded,
    // so the count keeps climbing past the first level.
    expect(trucksPerDay(1)).toBe(15);
    expect(trucksPerDay(2)).toBe(23);
    expect(trucksPerDay(3)).toBe(26);
  });

  it('brings 33 a day at the bottom and 182 at the top', () => {
    expect(dailyIntakePerDoor(0, 0)).toBe(33);
    expect(dailyIntakePerDoor(2, 3)).toBe(182);
  });

  it('agrees with the reported 77 and 105 per door', () => {
    // Both figures quoted in the forum thread, at full delivery size.
    expect(dailyIntakePerDoor(2, 0)).toBe(77);
    expect(dailyIntakePerDoor(2, 1)).toBe(105);
  });

  it('matches the reported 525 a day across five maxed doors', () => {
    // An independent cross-check on the whole table rather than on one cell.
    expect(5 * dailyIntakePerDoor(2, 1)).toBe(525);
  });

  it('clamps a level beyond what the game sells', () => {
    expect(dailyIntakePerDoor(99, 0)).toBe(dailyIntakePerDoor(2, 0));
    expect(dailyIntakePerDoor(-1, 0)).toBe(dailyIntakePerDoor(0, 0));
  });
});

describe('trucks a day, at every speed level', () => {
  it('keeps the two numbers that were already reported', () => {
    expect(trucksPerDay(0)).toBe(11);
    expect(trucksPerDay(1)).toBe(15);
  });

  it('keeps climbing past the first upgrade', () => {
    // Each speed level must add trucks; 26 a day fully upgraded is not reachable from a 33 s floor.
    expect(trucksPerDay(2)).toBe(23);
    expect(trucksPerDay(3)).toBe(26);
  });

  it('stops climbing once the floor is reached', () => {
    expect(trucksPerDay(9)).toBe(trucksPerDay(3));
  });

  it("lands on the guide's own daily total", () => {
    // 5 doors x 26 openings x 7 parcels = 910 a day, the figure the community guide is built on.
    expect(5 * dailyIntakePerDoor(2, 3)).toBe(910);
  });
});
