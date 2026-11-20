import { describe, it, expect } from 'vitest';
import { getCatalogue } from './catalogue';
import { getShapes, shapesFor, SHAPE_DIVISOR } from './shapes';

describe('getShapes', () => {
  it('records a divisor of 12', () => {
    expect(SHAPE_DIVISOR).toBe(12);
  });

  it('has artwork for the straight conveyor', () => {
    const shapes = getShapes();
    expect(shapes.get('BP_ConveyorBelt_Straight_Tier1')?.length).toBeGreaterThan(0);
  });

  it('now has artwork for every object in the catalogue', () => {
    // Every object, including the speedway, auto pauser, elevator and racks, has artwork.
    const shapes = getShapes();
    for (const id of getCatalogue().keys()) {
      const drawn = shapes.has(id)
        || shapes.has(`${id}#en`) || shapes.has(`${id}#fr`)
        || shapes.has(`${id}#bas`) || shapes.has(`${id}#haut`);
      expect(drawn, `${id} has no artwork`).toBe(true);
    }
  });

  it('has 33 entries: 27 plain objects plus the variants of three others', () => {
    expect(getShapes().size).toBe(33);
  });

  describe('shapesFor', () => {
    it("picks a storage rack's artwork by interface language", () => {
      const fr = shapesFor('BP_StorageRack_Medium', { locale: 'fr' });
      const en = shapesFor('BP_StorageRack_Medium', { locale: 'en' });
      expect(fr).toBeDefined();
      expect(en).toBeDefined();
      expect(fr).not.toEqual(en); // the racks are labelled in-world
    });

    it("shows the elevator's foot from its own floor and its head from the one above", () => {
      const foot = shapesFor('BP_ConveyorBelt_Elevator', { locale: 'en', floorOffset: 0 });
      const head = shapesFor('BP_ConveyorBelt_Elevator', { locale: 'en', floorOffset: 1 });
      expect(foot).toBeDefined();
      expect(head).toBeDefined();
      expect(foot).not.toEqual(head);
    });

    it('returns the single drawing for an object with no variants', () => {
      const straight = shapesFor('BP_ConveyorBelt_Straight_Tier1', { locale: 'fr' });
      expect(straight).toEqual(getShapes().get('BP_ConveyorBelt_Straight_Tier1'));
    });
  });

  describe('shapes that must not mirror', () => {
    const upright = (id: string) =>
      (getShapes().get(id) ?? []).filter((s) => 'upright' in s && s.upright);

    it('flags the sticker checker\'s five symbol strokes', () => {
      // The tick, cross and slash are labels that would read wrong mirrored, not geometry.
      expect(upright('BP_ConveyorBelt_Scanner2_Tier1')).toHaveLength(5);
    });

    it('flags nothing on an object whose black strokes are direction arrows', () => {
      // A declared list, not a rule from the artwork: the splitter's arrows are black strokes too
      // and must mirror. Ten of the eleven objects with strokes are like this.
      expect(upright('BP_ConveyorBelt_Splitter')).toHaveLength(0);
      expect(upright('BP_ConveyorBelt_Straight_Tier1')).toHaveLength(0);
      expect(upright('BP_ConveyorBelt_Corner_Tier1')).toHaveLength(0);
    });
  });
});
