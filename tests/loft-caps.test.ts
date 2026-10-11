/** Closed lofts render with front-sided materials, so both end caps must face out of the solid. */
// Regression guard: this fails on the old same-order cap winding.
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { Ring } from "@/lib/geometry";

type Ends = { first: Ring; second: Ring; penultimate: Ring; last: Ring; lastStart: number };

// Record each closed, capped loft with its end rings, so the test reads every built part's real caps.
vi.mock("@/lib/geometry", async (original) => {
  const m = await original<typeof import("@/lib/geometry")>();
  return {
    ...m,
    loft: (sections: Ring[], opts?: { closed?: boolean; caps?: boolean }) => {
      const geo = m.loft(sections, opts);
      if ((opts?.closed ?? true) && (opts?.caps ?? true)) {
        const ends = [0, 1, sections.length - 2, sections.length - 1].map((i) => sections[i].map((p) => p.clone()));
        const lastStart = (sections.length - 1) * sections[0].length;
        geo.userData.capped = { first: ends[0], second: ends[1], penultimate: ends[2], last: ends[3], lastStart };
      }
      return geo;
    },
  };
});

const centroid = (r: Ring) => r.reduce((c, p) => c.add(p), new THREE.Vector3()).divideScalar(r.length);

/** From outside the end of the solid, the cap seen along the loft axis must face the viewer. */
const capFacesOutward = (geo: THREE.BufferGeometry, end: Ring, neighbour: Ring) => {
  const c = centroid(end);
  const out = c.clone().sub(centroid(neighbour)).normalize();
  // Aim inside the first fan triangle (centre, ring[0], ring[1]) so the ray lands on the cap, not a vertex.
  const target = c.clone().add(end[0]).add(end[1]).divideScalar(3);
  geo.computeBoundingSphere();
  const origin = target.clone().addScaledVector(out, 2 * geo.boundingSphere!.radius + 1);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const hit = new THREE.Raycaster(origin, out.clone().negate()).intersectObject(mesh)[0];
  (mesh.material as THREE.Material).dispose();
  return hit ? hit.face!.normal.dot(out) : undefined;
};

describe("closed loft end caps across the fleet", async () => {
  const { FLEET } = await import("@/aircraft");
  const rows = FLEET.flatMap((def) => {
    const cat = def.labels!.cat;
    return [...cat.parts, ...cat.shells, ...cat.surfaces].flatMap((spec) => {
      const geo = (spec as { geo?: () => THREE.BufferGeometry }).geo?.();
      const ends = geo?.userData.capped as Ends | undefined;
      return geo && ends
        ? [{ name: `${def.id} ${(spec as { name?: string }).name ?? "(unnamed)"}`, geo, ...ends }]
        : [];
    });
  });

  it("finds capped lofts on every aircraft", () => {
    for (const def of FLEET)
      expect(
        rows.some((r) => r.name.startsWith(def.id + " ")),
        def.id,
      ).toBe(true);
  });

  it.each(rows.map((r) => [r.name, r] as const))("%s: both end caps face outward", (_name, r) => {
    // Control surfaces are re-based to their hinge after lofting; carry the rings along by the same offset.
    const p = r.geo.attributes.position;
    const offset = new THREE.Vector3().fromBufferAttribute(p, 0).sub(r.first[0]);
    const moved = new THREE.Vector3().fromBufferAttribute(p, r.lastStart).sub(r.last[0]);
    expect(moved.distanceTo(offset), "loft only translated after build").toBeLessThan(1e-4);
    for (const ring of [r.first, r.second, r.penultimate, r.last]) ring.forEach((v) => v.add(offset));
    expect(capFacesOutward(r.geo, r.first, r.second), "first cap").toBeGreaterThan(0);
    expect(capFacesOutward(r.geo, r.last, r.penultimate), "last cap").toBeGreaterThan(0);
    r.geo.dispose();
  });
});
