/**
 * Generic geometry builders shared by every airplane: lofts, airfoils, primitives, tubes, and
 * factories for superellipse fuselages, lifting surfaces and fins driven by station tables.
 *
 * Axes: x forward, y up, z toward the right wing. Units: metres.
 */
import * as THREE from "three";
import { V, clamp, lerp, toV, type Vec3 } from "./math";

export type Ring = THREE.Vector3[];

/* ---------- generic builders ---------- */

/** Skins a list of point rings into a mesh. Rings must all have the same point count. */
export function loft(sections: Ring[], { closed = true, caps = true } = {}) {
  const N = sections[0].length,
    M = sections.length;
  const pos: number[] = [],
    idx: number[] = [];
  sections.forEach((r) => r.forEach((p) => pos.push(p.x, p.y, p.z)));
  const J = closed ? N : N - 1;
  for (let i = 0; i < M - 1; i++)
    for (let j = 0; j < J; j++) {
      const a = i * N + j,
        b = i * N + ((j + 1) % N),
        c = (i + 1) * N + j,
        d = (i + 1) * N + ((j + 1) % N);
      idx.push(a, c, b, b, c, d);
    }
  if (caps && closed) {
    [0, M - 1].forEach((i) => {
      const r = sections[i],
        c = new THREE.Vector3();
      r.forEach((p) => c.add(p));
      c.multiplyScalar(1 / N);
      // Separate cap vertices keep the end face flat instead of rounding its rim normals.
      const start = pos.length / 3;
      r.forEach((p) => pos.push(p.x, p.y, p.z));
      const ci = pos.length / 3;
      pos.push(c.x, c.y, c.z);
      for (let j = 0; j < N; j++) {
        const a = start + j,
          b = start + ((j + 1) % N);
        if (i === 0) idx.push(ci, a, b);
        else idx.push(ci, b, a);
      }
    });
    // Callers loft along different axes and in either direction. A closed skin must
    // enclose positive signed volume; otherwise both its lighting and culling invert.
    let volume = 0;
    const a = V(0, 0, 0),
      b = V(0, 0, 0),
      c = V(0, 0, 0);
    for (let k = 0; k < idx.length; k += 3) {
      a.fromArray(pos, idx[k] * 3);
      b.fromArray(pos, idx[k + 1] * 3);
      c.fromArray(pos, idx[k + 2] * 3);
      volume += a.dot(b.cross(c));
    }
    if (volume < 0) for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** NACA 4-digit style airfoil: returns [upper, lower] surface height as a fraction of chord. */
export function af(x: number, t: number, m: number): [number, number] {
  x = clamp(x, 0, 1);
  const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const p = 0.4;
  const yc =
    m === 0
      ? 0
      : x < p
        ? (m / (p * p)) * (2 * p * x - x * x)
        : (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * x - x * x);
  return [yc + yt, yc - yt];
}

/** Closed airfoil outline between chord fractions c0..c1 (cosine-spaced). */
export function afRing(c0: number, c1: number, t: number, m: number, n = 16): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n,
      x = c0 + (c1 - c0) * (1 - Math.cos(((1 - u) * Math.PI) / 2));
    pts.push([x, af(x, t, m)[0]]);
  }
  for (let i = 1; i <= n; i++) {
    const u = i / n,
      x = c0 + (c1 - c0) * (1 - Math.cos((u * Math.PI) / 2));
    pts.push([x, af(x, t, m)[1]]);
  }
  return pts;
}

/** Catmull-Rom interpolation over a table sorted by descending first column (clamped at the ends). */
export function interp(tab: number[][], col: number, x: number) {
  const xs = tab.map((r) => r[0]);
  let i = 0;
  if (x >= xs[0]) return tab[0][col];
  if (x <= xs[xs.length - 1]) return tab[tab.length - 1][col];
  while (i < xs.length - 1 && !(x <= xs[i] && x >= xs[i + 1])) i++;
  const p0 = tab[Math.max(i - 1, 0)][col],
    p1 = tab[i][col],
    p2 = tab[i + 1][col],
    p3 = tab[Math.min(i + 2, tab.length - 1)][col];
  const t = (xs[i] - x) / (xs[i] - xs[i + 1]);
  return (
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
  );
}

/** Piecewise-linear lookup in a table sorted by ascending first column (clamped). Returns [col1, col2, …]. */
export function lin(tab: number[][], x: number) {
  let i = 0;
  while (i < tab.length - 2 && x > tab[i + 1][0]) i++;
  const a = tab[i],
    b = tab[i + 1],
    t = clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
  return a.slice(1).map((v, k) => lerp(v, b[k + 1], t));
}

/* ---------- small primitives ---------- */
export const box = (sx: number, sy: number, sz: number) => new THREE.BoxGeometry(sx, sy, sz);
export const cyl = (r: number, h: number, axis: "x" | "y" | "z" = "y", seg = 20) => {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  if (axis === "x") g.rotateZ(Math.PI / 2);
  if (axis === "z") g.rotateX(Math.PI / 2);
  return g;
};
export const sph = (r: number) => new THREE.SphereGeometry(r, 16, 12);

export function curveOf(points: (Vec3 | THREE.Vector3)[], tension = 0.15) {
  return new THREE.CatmullRomCurve3(points.map(toV), false, "catmullrom", tension);
}
export function tubeGeo(points: (Vec3 | THREE.Vector3)[], r: number, tension = 0.15) {
  const curve = curveOf(points, tension);
  return new THREE.TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 24)), r, 8, false);
}

/** Circular arc of radius `r` leaving `start` along unit `d0` and turning in their plane until it runs along unit `d1`. */
class BendArc extends THREE.Curve<THREE.Vector3> {
  private readonly centre: THREE.Vector3;
  private readonly toStart: THREE.Vector3;
  private readonly ahead: THREE.Vector3;
  private readonly turn: number;
  constructor(start: THREE.Vector3, d0: THREE.Vector3, d1: THREE.Vector3, r: number) {
    super();
    const inward = d1.clone().addScaledVector(d0, -d0.dot(d1)).normalize();
    this.centre = start.clone().addScaledVector(inward, r);
    this.toStart = inward.multiplyScalar(-r);
    this.ahead = d0.clone().multiplyScalar(r);
    this.turn = d0.angleTo(d1);
  }
  override getPoint(t: number, target = new THREE.Vector3()) {
    const a = t * this.turn;
    return target.copy(this.centre).addScaledVector(this.toStart, Math.cos(a)).addScaledVector(this.ahead, Math.sin(a));
  }
}

/**
 * A bent tube's centreline: straight legs through `points`, each inner corner rounded by a circular arc of radius `bend`
 * (a pipe bender's centreline radius). A corner whose legs are too short for that radius gets the largest arc that uses
 * at most half of each neighbouring leg, so arcs never overlap and the ends stay on the first and last points. With
 * `wholeEnds`, a corner may use all of a first or last leg (no other arc shares it), e.g. a short straight drop onto a
 * port. Corners listed in `sharp` (indices into `points`) stay unrounded: a tee or a flange the centreline must pass
 * through exactly.
 */
export function bentCurve(points: (Vec3 | THREE.Vector3)[], bend: number, wholeEnds = false, sharp: number[] = []) {
  const p = points.map((q) => toV(q).clone());
  const path = new THREE.CurvePath<THREE.Vector3>();
  let from = p[0];
  for (let i = 1; i < p.length - 1; i++) {
    if (sharp.includes(i)) {
      if (p[i].distanceTo(from) > 1e-9) path.add(new THREE.LineCurve3(from, p[i]));
      from = p[i];
      continue;
    }
    const d0 = p[i].clone().sub(p[i - 1]),
      d1 = p[i + 1].clone().sub(p[i]);
    const share = (leg: THREE.Vector3, end: boolean) => leg.length() * (wholeEnds && end ? 1 : 0.5);
    const half = Math.min(share(d0, i === 1), share(d1, i === p.length - 2));
    d0.normalize();
    d1.normalize();
    const turn = d0.angleTo(d1);
    if (turn < 1e-6) continue;
    const r = Math.min(bend, half / Math.tan(turn / 2));
    const start = p[i].clone().addScaledVector(d0, -r * Math.tan(turn / 2));
    if (start.distanceTo(from) > 1e-9) path.add(new THREE.LineCurve3(from, start));
    const arc = new BendArc(start, d0, d1, r);
    path.add(arc);
    from = arc.getPoint(1);
  }
  path.add(new THREE.LineCurve3(from, p[p.length - 1]));
  return path;
}

/** `bentCurve` sampled every `step` metres (and at both ends): flow points that follow the drawn tube. */
export function bentPoints(points: (Vec3 | THREE.Vector3)[], bend: number, step = 0.01, wholeEnds = false): Vec3[] {
  const curve = bentCurve(points, bend, wholeEnds);
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return Array.from({ length: n + 1 }, (_, i) => curve.getPointAt(i / n).toArray() as Vec3);
}

/** A tube of radius `r` along `bentCurve(points, bend)`, tessellated about every 5 mm of its length. */
export function bentTubeGeo(
  points: (Vec3 | THREE.Vector3)[],
  r: number,
  bend: number,
  radial = 12,
  wholeEnds = false,
  sharp: number[] = [],
) {
  const curve = bentCurve(points, bend, wholeEnds, sharp);
  return new THREE.TubeGeometry(curve, Math.max(16, Math.ceil(curve.getLength() / 0.005)), r, radial, false);
}

/** A band clamp hugging a tube of radius `r`: a torus of section radius `band` around `curve`, square to it, `inset`
 * metres along it from its start, or from its end when `inset` is negative. */
export function bandGeo(curve: THREE.Curve<THREE.Vector3>, r: number, inset: number, band = 0.0025) {
  const length = curve.getLength();
  const u = (inset >= 0 ? inset : length + inset) / length;
  const at = curve.getPointAt(u),
    axis = curve.getTangentAt(u);
  return new THREE.TorusGeometry(r + band, band, 8, 24)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis))
    .translate(at.x, at.y, at.z);
}

/**
 * Solid swept along a smooth path with an elliptical section that may change along it (grips, horns). `r(t)` gives the
 * section's half sizes at t = 0…1 of the path's length: [toward `ref`, across]. `ref` is a direction the first half size is
 * kept square to the path toward, e.g. fore-aft for a part drawn in a lateral plane. Bring r toward 0 at an end to round it.
 */
export function sweepGeo(
  points: (Vec3 | THREE.Vector3)[],
  r: (t: number) => [number, number],
  ref: Vec3 = [1, 0, 0],
  tension = 0.35,
  n = 48,
  seg = 16,
) {
  const curve = curveOf(points, tension),
    W = toV(ref).normalize();
  const rings: Ring[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      c = curve.getPointAt(t),
      T = curve.getTangentAt(t);
    const A = W.clone().addScaledVector(T, -W.dot(T)).normalize(),
      B = new THREE.Vector3().crossVectors(A, T);
    const [ra, rb] = r(t);
    rings.push(
      Array.from({ length: seg }, (_, j) => {
        const a = (j / seg) * Math.PI * 2;
        return c
          .clone()
          .addScaledVector(A, Math.cos(a) * ra)
          .addScaledVector(B, Math.sin(a) * rb);
      }),
    );
  }
  return loft(rings);
}
/** Rounded-end factor for `sweepGeo` radii: 1 along the path, falling like a quarter circle over fraction k at each end. */
export const roundEnds = (t: number, k0: number, k1 = k0) => {
  const e = (u: number, k: number) => (k > 0 ? Math.sqrt(Math.max(0.02, 1 - (1 - clamp(u / k, 0, 1)) ** 2)) : 1);
  return e(t, k0) * e(1 - t, k1);
};

/** Composite wheel fairing, axle at the origin. Photo-fit profile: rounded nose,
 * truncated tail and a flat lower edge that leaves the tire exposed. */
export function pantGeo(len: number, r: number) {
  const stations: Ring[] = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40,
      f = u < 0.32 ? Math.sqrt(Math.max(0.002, 1 - ((0.32 - u) / 0.32) ** 2)) : 1 - 0.84 * ((u - 0.32) / 0.68) ** 1.25;
    stations.push(
      Array.from({ length: 40 }, (_, j) => {
        const a = (j / 40) * Math.PI * 2;
        return V((0.32 - u) * len, Math.max(-0.65 * r, r * f * Math.sin(a)), r * f * Math.cos(a));
      }),
    );
  }
  return loft(stations);
}

/** Streamlined gear-leg section along a curved path, chord along x. */
export function gearLegGeo(points: Vec3[], chord: number, thickness: number) {
  return loft(
    points.map((p, i) => {
      const tangent = toV(points[Math.min(i + 1, points.length - 1)])
        .sub(toV(points[Math.max(0, i - 1)]))
        .normalize();
      const width = V(1, 0, 0).cross(tangent).normalize();
      return afRing(0, 1, thickness / chord, 0, 20).map(([u, h]) =>
        toV(p)
          .add(V((0.3 - u) * chord, 0, 0))
          .addScaledVector(width, h * chord),
      );
    }),
  );
}

/** Small streamlined fairing under a wing; flat attachment face at y=0. */
export function hingeFairingGeo(length: number, depth: number, width: number) {
  return loft(
    Array.from({ length: 17 }, (_, i) => {
      const u = i / 16,
        f = Math.max(0.01, Math.sin(Math.PI * u) * (1.2 - 0.4 * u));
      return Array.from({ length: 17 }, (_, j) => {
        const a = (j / 16) * Math.PI;
        return V((0.5 - u) * length, -depth * f * Math.sin(a), (width / 2) * f * Math.cos(a));
      });
    }),
  );
}

/** A conformal open inlet throat or its narrow lip on the front of a cowling.
 * Shape dimensions are photo fits, not duct/engineering dimensions. */
export function cowlOpeningGeo(
  frontX: (y: number, z: number) => number,
  y: number,
  z: number,
  width: number,
  height: number,
  exponent = 3,
  lip = false,
) {
  const radii = lip ? [0.9, 1] : [0.9, 0.9];
  const rings = radii.map((r, row) =>
    Array.from({ length: 48 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2,
        yy = y + ((r * height) / 2) * Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** (2 / exponent),
        zz = z + ((r * width) / 2) * Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** (2 / exponent);
      return V(frontX(yy, zz) + (lip ? 0.006 : 0.003 - row * 0.08), yy, zz);
    }),
  );
  const g = loft(rings, { caps: false });
  const idx = g.index!;
  for (let i = 0; lip && i < idx.count; i += 3) {
    const b = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, b);
  }
  g.computeVertexNormals();
  return g;
}

/** Rounded tire with an open wheel centre, axle along z. Radius/width are the
 * existing aircraft dimensions; the sidewall profile is a visual approximation. */
export function tireGeo(radius: number, width: number) {
  const profile = [
    [0.46, -0.38],
    [0.58, -0.48],
    [0.78, -0.5],
    [0.93, -0.36],
    [1, -0.18],
    [1, 0.18],
    [0.93, 0.36],
    [0.78, 0.5],
    [0.58, 0.48],
    [0.46, 0.38],
    [0.46, -0.38],
  ].map(([r, z]) => new THREE.Vector2(r * radius, z * width));
  const g = new THREE.LatheGeometry(profile, 48);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Merge geometries (positions + index only; normals recomputed). */
export function mergeGeos(gs: THREE.BufferGeometry[]) {
  const pos: number[] = [],
    idx: number[] = [];
  let off = 0;
  gs.forEach((g) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    const ix = g.index;
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
    else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

export type Axis = "x" | "y" | "z";

/** Grooved pulley (or double pulley) oriented on the given axis, centred at the origin. */
export function pulleyGeo(r: number, axis: Axis, double = false, gap = 0.03) {
  const w = 0.018;
  const prof = [
    [0.003, -w / 2],
    [r, -w / 2],
    [r, -w / 4],
    [r * 0.78, 0],
    [r, w / 4],
    [r, w / 2],
    [0.003, w / 2],
  ].map(([a, b]) => new THREE.Vector2(a, b));
  const wheel = () => new THREE.LatheGeometry(prof, 28);
  const g = double
    ? mergeGeos([
        wheel().translate(0, -gap / 2, 0),
        wheel().translate(0, gap / 2, 0),
        new THREE.CylinderGeometry(0.006, 0.006, gap + w, 8),
      ])
    : wheel();
  if (axis === "z") g.rotateX(Math.PI / 2);
  if (axis === "x") g.rotateZ(Math.PI / 2);
  return g;
}

/** Pie-shaped cable sector in the x–y plane (axis z), pointing down. */
export function sectorGeo(r: number, spread = 0.6, t = 0.012) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.absarc(0, 0, r, -Math.PI / 2 - spread, -Math.PI / 2 + spread, false);
  sh.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  return g;
}

/* ---------- outlines ---------- */

/** Corner-cut then Chaikin-smooth a polygon of [x, y] points. */
export function roundPoly(pts: number[][], cut = 0.14, it = 2) {
  let p: number[][] = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    p.push(a, [lerp(a[0], b[0], cut), lerp(a[1], b[1], cut)], [lerp(a[0], b[0], 1 - cut), lerp(a[1], b[1], 1 - cut)]);
  });
  for (let k = 0; k < it; k++) {
    const o: number[][] = [];
    p.forEach((a, i) => {
      const b = p[(i + 1) % p.length];
      o.push(
        [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25],
        [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75],
      );
    });
    p = o;
  }
  return p;
}

/** Resample a polyline / polygon so no segment is longer than `step`. */
export const densify = (pts: number[][], step = 0.03, close = true) => {
  const o: number[][] = [];
  const N = close ? pts.length : pts.length - 1;
  for (let i = 0; i < N; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length],
      n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) o.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]);
  }
  if (!close) o.push(pts[pts.length - 1]);
  return o;
};

/* ---------- fuselage factory ---------- */

export interface FuselageSection {
  hw: number;
  hh: number;
  cy: number;
  nTop: number;
  nBot: number;
  tumble: number;
}

export interface FuselageOpts {
  /** Rows [x, halfWidth, halfHeight, centerY] sorted by DESCENDING x (nose first). */
  table: number[][];
  /** Superellipse exponents for the upper and lower halves (2 = ellipse, higher = boxier). */
  nTop: number;
  nBot: number;
  /** Narrowing of the upper half toward the roof (0 = none). */
  tumble: number;
  /** Optional local cross-section, e.g. a rounded cowl transitioning to a slab-sided cabin. */
  section?: (x: number) => { nTop: number; nBot: number; tumble: number };
  /** Optional station-local profile adjustment, shared by skin geometry and containment. Applied after `section`. */
  profile?: (x: number, section: FuselageSection) => FuselageSection;
}

/** Superellipse-section fuselage driven by a station table. */
export function fuselage({ table, nTop, nBot, tumble, section: sectionOf, profile }: FuselageOpts) {
  const xNose = table[0][0],
    xTail = table[table.length - 1][0];
  const section = (x: number): FuselageSection => {
    const base = {
      hw: interp(table, 1, x),
      hh: interp(table, 2, x),
      cy: interp(table, 3, x),
      ...(sectionOf ? sectionOf(x) : { nTop, nBot, tumble }),
    };
    return profile ? profile(x, base) : base;
  };
  const fus = (x: number) => {
    const { hw, hh, cy } = section(x);
    return { hw, hh, cy };
  };
  const topY = (x: number) => fus(x).cy + fus(x).hh;
  const botY = (x: number) => fus(x).cy - fus(x).hh;

  /** Ring of N points around the section at x, scaled by s; optionally an open arc th0..th1 (0 = right side, π/2 = top). */
  function ring(x: number, s = 1, N = 40, th0 = 0, th1 = Math.PI * 2, closed = true): Ring {
    const { hw, hh, cy, nTop, nBot, tumble } = section(x),
      pts: Ring = [],
      cnt = closed ? N : N + 1;
    for (let j = 0; j < cnt; j++) {
      const th = closed ? (j / N) * Math.PI * 2 : th0 + ((th1 - th0) * j) / N;
      const c = Math.cos(th),
        sn = Math.sin(th),
        n = sn >= 0 ? nTop : nBot;
      const py = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n),
        pz = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      pts.push(V(x, cy + s * hh * py, s * hw * (1 - tumble * Math.max(0, py)) * pz));
    }
    return pts;
  }

  /** Is a point inside the skin (with margin m, metres)? */
  function inside(p: THREE.Vector3, m = 0) {
    if (p.x > xNose || p.x < xTail) return false;
    const { hw, hh, cy, nTop, nBot, tumble } = section(p.x);
    const py = (p.y - cy) / (hh - m);
    if (Math.abs(py) > 1) return false;
    const n = py >= 0 ? nTop : nBot,
      w = (hw - m) * (1 - tumble * Math.max(0, py));
    return Math.pow(Math.abs(p.z) / w, n) + Math.pow(Math.abs(py), n) <= 1;
  }

  /** Point on the outer skin at (x, y) on the given side (+1 right, -1 left). */
  function onSkin(x: number, y: number, side: number, push = 1.006) {
    const { hw, hh, cy, nTop, nBot, tumble } = section(x);
    const py = clamp((y - cy) / hh, -1, 1),
      n = py >= 0 ? nTop : nBot;
    const w = hw * (1 - tumble * Math.max(0, py));
    return V(x, y, side * w * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(py), n)), 1 / n) * push);
  }

  /** Height of the outer lower skin at (x, z), from the section's own nBot (the exponent the loft uses). */
  function lowerSkinY(x: number, z: number) {
    const { hw, hh, cy, nBot } = section(x);
    const r = 1 - Math.pow(Math.abs(z / hw), nBot);
    // Math.cbrt is exact where Math.pow(r, 1/3) can differ in the last bit: nBot = 3 keeps its prior geometry.
    return cy - hh * (nBot === 3 ? Math.cbrt(r) : Math.pow(r, 1 / nBot));
  }

  /** Ring angle (0 = side, π/2 = top) where the upper skin passes height y at station x. */
  const thetaAt = (x: number, y: number) => {
    const { hh, cy, nTop } = section(x);
    return Math.asin(Math.pow(clamp((y - cy) / hh, 0, 1), nTop / 2));
  };

  /** Foremost skin intersection of a ray travelling aft, for conformal nose details. */
  function frontX(y: number, z: number) {
    const p = V(xNose, y, z);
    if (inside(p)) return xNose;
    for (let x = xNose - 0.01; x >= xTail; x -= 0.01) {
      if (!inside(p.set(x, y, z))) continue;
      let lo = x,
        hi = Math.min(xNose, x + 0.01);
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2;
        if (inside(p.set(mid, y, z))) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
    throw new Error(`No fuselage intersection at y=${y}, z=${z}`);
  }

  /** Skin loft from nose to tail with side-projected UVs over the box `uv` (for a painted texture). */
  function geo({
    step = 0.06,
    N = 48,
    uv,
  }: { step?: number; N?: number; uv?: { x0: number; x1: number; y0: number; y1: number } } = {}) {
    const secs: Ring[] = [];
    for (let x = xNose; x > xTail; x -= step) secs.push(ring(x, 1, N));
    secs.push(ring(xTail, 1, N));
    const g = loft(secs);
    if (uv) {
      const pos = g.attributes.position,
        a = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        a[2 * i] = (pos.getX(i) - uv.x0) / (uv.x1 - uv.x0);
        a[2 * i + 1] = (pos.getY(i) - uv.y0) / (uv.y1 - uv.y0);
      }
      g.setAttribute("uv", new THREE.BufferAttribute(a, 2));
    }
    return g;
  }

  /** Flat plate filling the section at x (bulkheads, firewall). */
  function plate(x: number, s = 0.98) {
    const r = ring(x, s, 40);
    const g = new THREE.ShapeGeometry(new THREE.Shape(r.map((p) => new THREE.Vector2(p.z, p.y))));
    g.rotateY(Math.PI / 2);
    g.translate(x, 0, 0);
    return g;
  }

  /** Slab filling the section at xr, clipped to the band y0..y1, extruded by depth around x (panels, glareshields). */
  function slab(x: number, y0: number, y1: number, s: number, depth: number, xr = x) {
    const clipY = (poly: THREE.Vector2[], yc: number, keepAbove: boolean) => {
      const out: THREE.Vector2[] = [];
      for (let i = 0; i < poly.length; i++) {
        const A = poly[i],
          B = poly[(i + 1) % poly.length];
        const ina = keepAbove ? A.y >= yc : A.y <= yc,
          inb = keepAbove ? B.y >= yc : B.y <= yc;
        if (ina) out.push(A);
        if (ina !== inb) {
          const t = (yc - A.y) / (B.y - A.y);
          out.push(new THREE.Vector2(A.x + (B.x - A.x) * t, yc));
        }
      }
      return out;
    };
    const pts = clipY(
      clipY(
        ring(xr, s, 72).map((p) => new THREE.Vector2(p.z, p.y)),
        y0,
        true,
      ),
      y1,
      false,
    );
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    g.translate(x - depth / 2, 0, 0);
    return g;
  }

  return {
    xNose,
    xTail,
    nTop,
    nBot,
    tumble,
    section,
    fus,
    topY,
    botY,
    ring,
    inside,
    onSkin,
    lowerSkinY,
    thetaAt,
    frontX,
    geo,
    plate,
    slab,
  };
}

/* ---------- lifting-surface factory (wings, stabilizers) ---------- */

export interface SurfaceOpts {
  /** Leading-edge x, chord, mean-line y and thickness/chord at span station z (use |z|). */
  le: (z: number) => number;
  chord: (z: number) => number;
  y: (z: number) => number;
  t: (z: number) => number;
  /** Camber (NACA m). */
  m: number;
}

/** Horizontal lifting surface: points and airfoil sections at span station z. */
export function liftingSurface({ le, chord, y, t, m }: SurfaceOpts) {
  /** Point at span z and chord fraction xc; up = +1 upper skin, -1 lower, 0 mean line. */
  const p = (z: number, xc: number, up = 0) => {
    const c = chord(z),
      [u, l] = af(xc, t(z), m);
    return V(le(z) - xc * c, y(z) + (up > 0 ? u : up < 0 ? l : (u + l) / 2) * c, z);
  };
  /** Airfoil ring between chord fractions c0..c1 (thickness scaled by `scale`). */
  const sec = (z: number, c0: number, c1: number, scale = 1): Ring => {
    const c = chord(z);
    return afRing(c0, c1, t(z) * scale, m).map(([x, yy]) => V(le(z) - x * c, y(z) + yy * c, z));
  };
  return { le, chord, y, t, p, sec };
}

/** Vertical fin: symmetric sections at height h (z is thickness). */
export function finSurface({
  le,
  chord,
  t,
}: {
  le: (h: number) => number;
  chord: (h: number) => number;
  t: (h: number) => number;
}) {
  const sec = (h: number, c0: number, c1: number): Ring => {
    const c = chord(h);
    return afRing(c0, c1, t(h), 0).map(([x, y]) => V(le(h) - x * c, h, y * c));
  };
  const p = (h: number, xc: number, side = 0) => {
    const c = chord(h),
      [u] = af(xc, t(h), 0);
    return V(le(h) - xc * c, h, side * u * c);
  };
  return { le, chord, t, sec, p };
}

/** Mirror ring order for the left side so loft normals stay outward. */
export const sided = (secs: Ring[], s: number) => (s < 0 ? secs.map((r) => r.reverse()) : secs);
