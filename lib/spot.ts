/**
 * Spotlight for a guided walk-around: named parts are highlighted and the rest of the airplane is dimmed. A part name can be
 * shared by both sides (e.g. "Main wheel"), so the spot can keep only the left or right instances.
 */
import * as THREE from "three";
import type { Catalogue, PartSpec } from "./catalogue";

/** Colour of spotted parts: one colour that stands out from every system colour. */
export const SPOT_COLOR = "#FF7A1A";

/** Side of the airplane: −1 left, +1 right, 0 either (or on the centreline). */
export type Side = -1 | 0 | 1;
export interface Spot {
  names: string[];
  side: Side;
}

/** Bounding-box centre of a part in its parent's coordinates (its own pos, rot and scale applied). */
export function partCentre(spec: Pick<PartSpec, "pos" | "rot" | "scale">, geo: THREE.BufferGeometry) {
  if (!geo.boundingBox) geo.computeBoundingBox();
  const c = geo.boundingBox!.getCenter(new THREE.Vector3());
  const o = new THREE.Object3D();
  if (spec.pos) o.position.set(...spec.pos);
  if (spec.rot) o.rotation.set(...spec.rot);
  if (spec.scale) o.scale.set(...spec.scale);
  o.updateMatrix();
  return c.applyMatrix4(o.matrix);
}

/** Within this distance of the centreline (m) a part belongs to neither side. */
const CENTRE = 0.05;

const sides = new WeakMap<PartSpec, Side>();
/**
 * Which side a part is on: from its centre for fixed parts and control-surface parts, from the moving group's name for
 * the others ("door:L", "rig:pedL"); 0 for centreline groups ("caster", "blade:0").
 */
export function partSide(spec: PartSpec, geo: THREE.BufferGeometry, cat: Catalogue): Side {
  let s = sides.get(spec);
  if (s === undefined) {
    const parent = spec.parent;
    let z: number | null = null;
    if (!parent) z = partCentre(spec, geo).z;
    else if (parent.startsWith("surf:")) z = partCentre(spec, geo).z + cat.surfacePivot(parent.slice(5))[2];
    s = z !== null ? (Math.abs(z) < CENTRE ? 0 : z > 0 ? 1 : -1) : /L$/.test(parent!) ? -1 : /R$/.test(parent!) ? 1 : 0;
    sides.set(spec, s);
  }
  return s;
}

/** Does the spot highlight the skin shell or control surface `name` whose centre is at `z`? Shells such as "Wing trailing
 * edge" exist on both sides, so a sided spot keeps only its own side's instances. */
export function spotsAt(spot: Spot | null, name: string, z: number) {
  if (!spot || !spot.names.includes(name)) return false;
  return !spot.side || Math.abs(z) < CENTRE || Math.sign(z) === spot.side;
}

/** Bounding-box centre z of a geometry (a shell's side; add a surface's pivot). */
export function geoCentreZ(geo: THREE.BufferGeometry) {
  if (!geo.boundingBox) geo.computeBoundingBox();
  return (geo.boundingBox!.min.z + geo.boundingBox!.max.z) / 2;
}

/** Is this part one the spot highlights? */
export function spotsPart(spot: Spot | null, spec: PartSpec, geo: THREE.BufferGeometry, cat: Catalogue) {
  if (!spot || !spec.name || !spot.names.includes(spec.name)) return false;
  if (!spot.side) return true;
  const s = partSide(spec, geo, cat);
  return s === 0 || s === spot.side;
}
