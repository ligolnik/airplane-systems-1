import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { fuselage } from "@/lib/geometry";

// Fixed ellipse, two metres wide and one metre high on each side of the axis.
const base = {
  table: [
    [1, 2, 1, 0],
    [0, 2, 1, 0],
  ],
  nTop: 2,
  nBot: 2,
  tumble: 0,
};

describe("fuselage station profiles", () => {
  it("retains the default elliptical skin and containment", () => {
    const hull = fuselage(base);
    expect(hull.onSkin(1, 0.6, 1, 1).z).toBeCloseTo(1.6, 10);
    expect(hull.inside(new Vector3(1, 0.6, 1.59))).toBe(true);
    expect(hull.inside(new Vector3(1, 0.6, 1.61))).toBe(false);
    for (const p of hull.ring(1)) expect(p.y ** 2 + (p.z / 2) ** 2).toBeCloseTo(1, 10);
  });

  it("uses an adjusted circular nose for the skin, closure and containment while retaining the aft ellipse", () => {
    const hull = fuselage({ ...base, profile: (x, s) => ({ ...s, hw: 2 - x }) });
    expect(hull.onSkin(1, 0.6, 1, 1).z).toBeCloseTo(0.8, 10);
    expect(hull.inside(new Vector3(1, 0.6, 0.79))).toBe(true);
    expect(hull.inside(new Vector3(1, 0.6, 0.81))).toBe(false);
    for (const p of hull.ring(1)) expect(Math.hypot(p.y, p.z)).toBeCloseTo(1, 10);
    expect(hull.onSkin(0, 0.6, 1, 1).z).toBeCloseTo(1.6, 10);
    const cap = hull.plate(1, 1);
    cap.computeBoundingBox();
    expect(cap.boundingBox!.max.z).toBeCloseTo(1, 6);
    expect(cap.boundingBox!.min.z).toBeCloseTo(-1, 6);
    cap.dispose();
  });
});
