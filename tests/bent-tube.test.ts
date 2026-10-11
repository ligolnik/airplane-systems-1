/** The shared bent-tube helpers (induction ducts; reused by the exhaust). */
import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { bandGeo, bentCurve, bentPoints, bentTubeGeo } from "@/lib/geometry";
import type { Vec3 } from "@/lib/math";

// An L: 0.2 m along x, then 0.2 m along y.
const L: Vec3[] = [
  [0, 0, 0],
  [0.2, 0, 0],
  [0.2, 0.2, 0],
];

describe("bentCurve", () => {
  it("keeps both ends, runs straight legs, and rounds the corner with an arc of the bend radius", () => {
    const curve = bentCurve(L, 0.05);
    expect(curve.getPointAt(0).toArray()).toEqual([0, 0, 0]);
    expect(curve.getPointAt(1).distanceTo(new Vector3(0.2, 0.2, 0))).toBeLessThan(1e-9);
    // two 0.15-m legs and a quarter circle of radius 0.05
    expect(curve.getLength()).toBeCloseTo(0.3 + (Math.PI / 2) * 0.05, 4);
    // every point of the bend is 0.05 m from its centre (0.15, 0.05), and no point cuts inside the corner by more
    const centre = new Vector3(0.15, 0.05, 0);
    for (let i = 0; i <= 50; i++) {
      const p = curve.getPointAt(0.4 + (i / 50) * 0.2);
      expect(p.distanceTo(centre)).toBeCloseTo(0.05, 6);
    }
    // tangent-continuous: no kink where the legs meet the arc
    for (const u of [0.49, 0.5, 0.51]) {
      const a = curve.getTangentAt(u - 0.001),
        b = curve.getTangentAt(u + 0.001);
      expect(a.angleTo(b)).toBeLessThan(0.05);
    }
  });

  it("shrinks a bend whose legs are too short for the radius, so arcs never overlap", () => {
    const short: Vec3[] = [
      [0, 0, 0],
      [0.02, 0, 0],
      [0.02, 0.02, 0],
    ];
    const curve = bentCurve(short, 0.05);
    expect(curve.getPointAt(0).toArray()).toEqual([0, 0, 0]);
    expect(curve.getPointAt(1).distanceTo(new Vector3(0.02, 0.02, 0))).toBeLessThan(1e-9);
    // the largest arc that uses half of each leg: radius 0.01
    expect(curve.getLength()).toBeCloseTo(0.02 + (Math.PI / 2) * 0.01, 4);
  });

  it("a sharp corner stays on its point, square, while the other corners still bend (exhaust fittings)", () => {
    // a Z: x, then y, then x again; corner 2 is a tee the run must pass through
    const z: Vec3[] = [
      [0, 0, 0],
      [0.2, 0, 0],
      [0.2, 0.2, 0],
      [0.4, 0.2, 0],
    ];
    const curve = bentCurve(z, 0.05, false, [2]);
    // three 0.2-m legs with only corner 1 rounded: 0.6 − 2r + (π/2)r
    expect(curve.getLength()).toBeCloseTo(0.6 - 0.1 + (Math.PI / 2) * 0.05, 6);
    const pts = Array.from({ length: 2001 }, (_, i) => curve.getPointAt(i / 2000));
    // samples 0.29 mm apart reach the sharp corner itself
    expect(Math.min(...pts.map((p) => p.distanceTo(new Vector3(0.2, 0.2, 0))))).toBeLessThan(0.0003);
    // corner 1 is still rounded: the centreline misses it by r(√2 − 1)
    expect(Math.min(...pts.map((p) => p.distanceTo(new Vector3(0.2, 0, 0))))).toBeCloseTo(0.05 * (Math.SQRT2 - 1), 4);
    // the sharp corner turns square: ahead of it the run is along y, after it along x
    const at = pts.findIndex((p) => p.distanceTo(new Vector3(0.2, 0.2, 0)) < 0.0003) / 2000;
    expect(curve.getTangentAt(at - 0.01).angleTo(curve.getTangentAt(at + 0.01))).toBeCloseTo(Math.PI / 2, 4);
    expect(bentTubeGeo(z, 0.01, 0.05, 12, false, [2]).parameters.path.getLength()).toBeCloseTo(curve.getLength(), 9);
  });

  it("wholeEnds lets a bend use all of a short last leg, so a pipe can turn square onto a port", () => {
    const drop: Vec3[] = [
      [0, 0.2, 0],
      [0.2, 0.02, 0],
      [0.2, 0, 0],
    ];
    // ≈42° turn; half the 20-mm last leg caps the radius at ≈26 mm, the whole leg at ≈52 mm
    const r = (curve: ReturnType<typeof bentCurve>) => {
      const arc = curve.curves[1],
        [a, m, b] = [arc.getPoint(0), arc.getPoint(0.5), arc.getPoint(1)];
      const ab = a.distanceTo(b),
        am = a.distanceTo(m),
        bm = b.distanceTo(m);
      return (ab * am * bm) / (2 * new Vector3().crossVectors(m.clone().sub(a), b.clone().sub(a)).length());
    };
    expect(r(bentCurve(drop, 0.04))).toBeLessThan(0.03);
    expect(r(bentCurve(drop, 0.04, true))).toBeCloseTo(0.04, 6);
    // both keep the end on the last point and finish along the last leg
    for (const whole of [false, true]) {
      const curve = bentCurve(drop, 0.04, whole);
      expect(curve.getPointAt(1).distanceTo(new Vector3(0.2, 0, 0))).toBeLessThan(1e-9);
      expect(curve.getTangentAt(1).y).toBeLessThan(-0.999);
    }
  });

  it("bentPoints samples the same centreline, and bentTubeGeo / bandGeo wrap it", () => {
    const pts = bentPoints(L, 0.05, 0.01);
    const curve = bentCurve(L, 0.05);
    expect(pts.length).toBeGreaterThan(30);
    for (const p of pts) {
      let d = Infinity;
      for (let i = 0; i <= 2000; i++) d = Math.min(d, curve.getPointAt(i / 2000).distanceTo(new Vector3(...p)));
      expect(d).toBeLessThan(1e-3);
    }
    const tube = bentTubeGeo(L, 0.01, 0.05);
    tube.computeBoundingBox();
    expect(tube.boundingBox!.min.y).toBeCloseTo(-0.01, 3);
    expect(tube.boundingBox!.max.x).toBeCloseTo(0.21, 3);
    expect(tube.boundingBox!.max.y).toBeCloseTo(0.2, 3);
    tube.dispose();
    // a band 0.01 m in from the start, square to the first leg, just outside the wall
    const band = bandGeo(curve, 0.01, 0.01);
    band.computeBoundingBox();
    const b = band.boundingBox!;
    expect(b.getCenter(new Vector3()).distanceTo(new Vector3(0.01, 0, 0))).toBeLessThan(1e-6);
    expect(b.max.x - b.min.x).toBeCloseTo(0.005, 6);
    expect(b.max.y).toBeCloseTo(0.015, 6);
    band.dispose();
  });
});
