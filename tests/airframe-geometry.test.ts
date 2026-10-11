import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { loft } from "@/lib/geometry";
import { sidePaintUV } from "@/lib/livery";
import { FLEET } from "@/aircraft";
import { LIVERY_REGISTRATION } from "@/aircraft/liveries";
import { TAIL_SHELLS } from "@/aircraft/m20c/parts";
import { initialSim as skylane } from "@/aircraft/c182t/model";

const box = { x0: -5, x1: 5, y0: -2, y1: 3 };

/** The side rings and end caps must enclose the same solid, for either station order. */
describe("closed loft lighting and culling", () => {
  it.each([1, -1])("points every face outward when the loft runs in direction %s", (direction) => {
    const rings = [-1, 1].map((x) =>
      Array.from({ length: 24 }, (_, i) => {
        const a = (i * Math.PI) / 12;
        return new THREE.Vector3(x * direction, Math.sin(a), Math.cos(a));
      }),
    );
    const g = loft(rings),
      p = g.attributes.position,
      n = g.attributes.normal,
      ix = g.index!;
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    for (let i = 0; i < ix.count; i += 3) {
      a.fromBufferAttribute(p, ix.getX(i));
      b.fromBufferAttribute(p, ix.getX(i + 1));
      c.fromBufferAttribute(p, ix.getX(i + 2));
      const center = a.clone().add(b).add(c).divideScalar(3);
      const normal = b.sub(a).cross(c.sub(a)).normalize();
      expect(normal.dot(center)).toBeGreaterThan(0.9);
    }
    // Cap centres and their duplicated rims have flat normals, not smoothed side normals.
    for (let i = 48; i < p.count; i++) {
      expect(Math.abs(n.getX(i))).toBeCloseTo(1);
      expect(n.getY(i)).toBeCloseTo(0);
      expect(n.getZ(i)).toBeCloseTo(0);
    }
    g.dispose();
  });
});

it("unwraps lettering in opposite directions on port/starboard without blending across atlas halves", () => {
  const source = new THREE.BoxGeometry(4, 2, 1);
  const g = sidePaintUV(source, box),
    p = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i < p.count; i += 3) {
    const right = p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2) >= 0;
    for (let j = i; j < i + 3; j++) {
      const u = (p.getX(j) - box.x0) / (box.x1 - box.x0);
      expect(uv.getX(j)).toBeCloseTo(right ? u / 2 : 1 - u / 2);
      expect(uv.getX(j) >= 0.5).toBe(!right);
    }
  }
  g.dispose();
});

describe.each(FLEET)("$id exterior geometry", (def) => {
  // The Mooney carries these shells in its moving empennage group, outside CAT.shells.
  const shells = [...def.labels!.cat.shells, ...(def.id === "m20c" ? TAIL_SHELLS : [])];
  // SR22T hull cut-outs can take over 30s on a shared CI runner; allow headroom without relaxing the geometry assertions.
  it(
    "has finite positions, normals and UVs on painted shells and moving surfaces",
    () => {
      for (const spec of [...shells, ...def.labels!.cat.surfaces]) {
        const g = spec.geo();
        for (const name of ["position", "normal", ...(spec.skin ? ["uv"] : [])]) {
          const a = g.getAttribute(name);
          expect(a, `${def.id}: ${spec.name} ${name}`).toBeDefined();
          expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
        }
        g.dispose();
      }
    },
    def.id === "sr22t" ? 60000 : 30000,
  );
  it("keeps the aircraft's paint on its fin and hinged rudder", () => {
    const fin = shells.find((s) => s.name === "Vertical stabilizer" || s.name === "Vertical fin")!;
    const rudder = def.labels!.cat.surfaces.find((s) => s.key === "rudder")!;
    // The SR22T has no photo-traced livery (no LIVERY_REGISTRATION entry): neither surface is painted.
    if (def.id === "sr22t") {
      expect(fin.skin).toBeUndefined();
      expect(rudder.skin).toBeUndefined();
      return;
    }
    expect(fin.skin).toBeTypeOf("function");
    expect(rudder.skin).toBeTypeOf("function");
    // N6947N has a navy rudder and light-blue fin, painted separately.
    if (def.id === "m20c") expect(rudder.skin).not.toBe(fin.skin);
    else expect(rudder.skin).toBe(fin.skin);
  });
});

it("uses the requested registrations and the photographed N8050J wheel configuration", () => {
  expect(LIVERY_REGISTRATION).toEqual({
    sr20: "N800KP",
    c172s: "N6189Q",
    c182t: "N8050J",
    da40: "N949KC",
    m20c: "N6947N",
  });
  expect(skylane.gear.fairings).toBe(false);
});
