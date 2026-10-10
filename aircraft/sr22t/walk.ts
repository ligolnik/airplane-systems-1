/**
 * Walk-around logic for the SR22T preflight (data in walkaround.ts): the items shown for the equipment fitted, the model
 * state at each step of the cabin station, where each item's parts are, and the saved progress. Pure, so the tests and
 * the UI share it.
 */
import * as THREE from "three";
import type { BufferGeometry } from "three";
import { toVec3, V } from "@/lib/math";
import { partCentre, partSide, type Side } from "@/lib/spot";
import { doorHinge } from "./geometry";
import { FLAP_DEG, initialSim, type Sim } from "./model";
import { CAT, NOSE_CASTER, NOSE_GEAR, PROP } from "./parts";
import { CROUCH_Y, isPoh, NOT_MODELLED, WALK, type CameraPose, type WalkItem, type WalkStation } from "./walkaround";

/** One step of the walk: an item with its station. */
export interface Step {
  station: WalkStation;
  item: WalkItem;
}

/** Every item shown for the equipment fitted in `s`, in POH order. */
export const walkSteps = (s: Sim): Step[] =>
  WALK.flatMap((station) =>
    station.items.filter((item) => !item.fitted || item.fitted(s)).map((item) => ({ station, item })),
  );

/** Index of the first step of station `n` (1..13), or −1. */
export const stationStart = (steps: Step[], n: number) => steps.findIndex((x) => x.station.n === n);

/**
 * The airplane as found on the ramp, where the walk-around starts: the starting state with the equipment fitted and the
 * fuel aboard kept, engine stopped, every switch the cabin items use OFF, flaps up.
 */
export function rampState(prior: Sim): Sim {
  const d = structuredClone(initialSim);
  d.equip = structuredClone(prior.equip);
  d.fuel.qL = prior.fuel.qL;
  d.fuel.qR = prior.fuel.qR;
  d.paFt = prior.paFt;
  d.eng = { ...d.eng, running: false, key: "OFF", lever: 0, mix: 0 };
  d.elec = { ...d.elec, bat1: false, bat2: false, avionics: false, tBat: 0 };
  d.fuel.pump = "OFF";
  d.flaps.cmd = 0;
  d.pitot.heat = false;
  d.stall.onGround = true;
  d.lights = { ...d.lights, nav: false, strobe: false, land: false, ice: false };
  d.oxy.on = false;
  d.ice.on = false;
  return d;
}

/** The model state at step `at` (−1: before the first): the ramp state with every step's `sim` up to and including `at`. */
export function simAt(prior: Sim, steps: Step[], at: number): Sim {
  const d = rampState(prior);
  for (let i = 0; i <= at && i < steps.length; i++) steps[i].item.sim?.(d);
  return d;
}

/**
 * Physical flap angle at step `at` (−1: on the ramp), degrees: the flaps where the commanded position leaves them, since a
 * flap motor without power (batteries off after 1u) can't move them. `running`: the step was reached by stepping forward
 * one item with the flaps powered, so the angle is the previous step's and the motor carries them on from there (1m).
 */
export function flapsAt(prior: Sim, steps: Step[], at: number, running = false): number {
  return FLAP_DEG[simAt(prior, steps, running ? at - 1 : at).flaps.cmd];
}

/** "L" / "R" as a side, from the item or else its station ("any": both sides). */
export const stepSide = ({ station, item }: Step): Side => {
  const s = item.side ?? station.side;
  return s === "L" ? -1 : s === "R" ? 1 : 0;
};

/** Origin of a part's moving group in airplane coordinates (control surfaces at their neutral position, doors shut). */
function groupOrigin(parent: string): THREE.Vector3 | null {
  if (parent.startsWith("surf:")) return V(...CAT.surfacePivot(parent.slice(5)));
  if (parent === "door:L" || parent === "door:R" || parent === "door:bag")
    return doorHinge(parent.slice(5) as "L" | "R" | "bag").pivot.clone();
  if (parent === "noseGear") return V(...NOSE_GEAR);
  if (parent === "caster") return V(...NOSE_GEAR).add(V(...NOSE_CASTER));
  if (parent.startsWith("blade:")) return V(...PROP);
  return null;
}

const geos = new Map<object, BufferGeometry>();
const geoOf = (spec: { geo: () => BufferGeometry }) => {
  let g = geos.get(spec);
  if (!g) geos.set(spec, (g = spec.geo()));
  return g;
};

/**
 * Centres of every instance of a part, surface or shell name on `side` (0: all), in airplane coordinates; instances on
 * moving groups the walk-around can't place are left out. Empty for names the catalogue doesn't have.
 */
export function nameCentres(name: string, side: Side = 0): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  // approximate: within 5 cm of the centreline counts as both sides, as in lib/spot.ts
  const keep = (z: number) => !side || Math.abs(z) < 0.05 || Math.sign(z) === side;
  for (const p of CAT.parts) {
    if (p.name !== name) continue;
    const geo = geoOf(p);
    const s = partSide(p, geo, CAT);
    if (side && s && s !== side) continue;
    const o = p.parent ? groupOrigin(p.parent) : V(0, 0, 0);
    if (o) out.push(partCentre(p, geo).add(o));
  }
  for (const s of CAT.surfaces) {
    if (s.name !== name) continue;
    const g = geoOf(s);
    if (!g.boundingBox) g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new THREE.Vector3()).add(V(...s.pivot));
    if (keep(c.z)) out.push(c);
  }
  for (const s of CAT.shells) {
    if (s.name !== name) continue;
    const g = geoOf(s);
    if (!g.boundingBox) g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new THREE.Vector3());
    if (keep(c.z)) out.push(c);
  }
  return out;
}

/** Is `name` something the catalogue has (a part, a control surface or a skin shell)? */
export const inCatalogue = (name: string) =>
  CAT.parts.some((p) => p.name === name) ||
  CAT.surfaces.some((s) => s.name === name) ||
  CAT.shells.some((s) => s.name === name);

/** The step's names that are in the model, and those listed as not modelled. */
export function stepParts(step: Step) {
  return {
    shown: step.item.parts.filter((n) => !(n in NOT_MODELLED)),
    missing: step.item.parts.filter((n) => n in NOT_MODELLED),
  };
}

/** Centroid of the step's modelled parts on its side, or null when it has none. */
export function stepCentroid(step: Step): THREE.Vector3 | null {
  const side = stepSide(step);
  const pts = stepParts(step).shown.flatMap((n) => nameCentres(n, side));
  if (!pts.length) return null;
  return pts.reduce((a, b) => a.add(b), V(0, 0, 0)).multiplyScalar(1 / pts.length);
}

/**
 * Centroid of all of a station's modelled parts (the camera tests check the station pose looks at it). The POH items only:
 * a technique item frames its own view (the opposite wheel's brake indicator), not the station's.
 */
export function stationCentroid(station: WalkStation): THREE.Vector3 | null {
  const pts = station.items.filter(isPoh).flatMap((item) => {
    const c = stepCentroid({ station, item });
    return c ? [c] : [];
  });
  if (!pts.length) return null;
  return pts.reduce((a, b) => a.add(b), V(0, 0, 0)).multiplyScalar(1 / pts.length);
}

/** Closest and farthest the item framing puts the camera from the item's parts, m, measured along the ground. Approximate:
 * a display choice, picked so small parts (drains, static ports) fill enough of the 38° view on a phone. */
export const FRAME_DIST: [number, number] = [1.2, 2.4]; // approximate: display framing, not a source value
/** Room kept between a person and the airplane's top-view outline, m. */
const CLEAR_M = 0.3; // approximate: a person's half-width, not a source value
/** Step when backing the camera away from the airplane, m. */
const BACK_STEP_M = 0.05;

let outline: THREE.Box3[] | null = null;
/** Is `p` over or under the airplane in top view (skin shells and control surfaces, grown by CLEAR_M)? */
export function underAirplane(p: THREE.Vector3) {
  outline ??= [
    ...CAT.shells.map((s) => {
      const g = geoOf(s);
      if (!g.boundingBox) g.computeBoundingBox();
      return g.boundingBox!.clone();
    }),
    ...CAT.surfaces.map((s) => {
      const g = geoOf(s);
      if (!g.boundingBox) g.computeBoundingBox();
      return g.boundingBox!.clone().translate(V(...s.pivot));
    }),
  ].map((b) => b.expandByScalar(CLEAR_M));
  return outline.some((b) => p.x >= b.min.x && p.x <= b.max.x && p.z >= b.min.z && p.z <= b.max.z);
}

/**
 * Camera for an item: the eye stays at the station's standing height (crouched for the items marked `crouch`, the
 * underside drains, vents and gascolator) and walks along the ground from the station towards the item's parts, to
 * FRAME_DIST from them but never over or under the airplane, then looks at them. An item with its own `eye` (the
 * technique items) is seen from there. Items without modelled parts keep the station view.
 */
export function stepPose(step: Step): CameraPose {
  const c = stepCentroid(step),
    { p } = step.station.cam;
  if (!c) return step.station.cam;
  if (step.item.eye) return { p: step.item.eye, t: toVec3(c) };
  const y = step.item.crouch ? CROUCH_Y : p[1];
  const away = V(p[0] - c.x, 0, p[2] - c.z),
    d = away.length();
  away.normalize();
  // from the framing distance back towards the station (which is clear of the airplane) until clear
  for (let r = Math.min(Math.max(d, FRAME_DIST[0]), FRAME_DIST[1]); r < d; r += BACK_STEP_M) {
    const at = V(c.x + away.x * r, y, c.z + away.z * r);
    if (!underAirplane(at)) return { p: toVec3(at), t: toVec3(c) };
  }
  return { p: [p[0], y, p[2]], t: toVec3(c) };
}

/** The item with this id, with its station (whatever the equipment fitted), or undefined. */
export function stepOf(id: string): Step | undefined {
  for (const station of WALK) {
    const item = station.items.find((i) => i.id === id);
    if (item) return { station, item };
  }
}

/**
 * Line of sight for an item checked from somewhere else (`sightFrom`): from the parts of the item where the pilot stands
 * to the item's own parts, e.g. from the right drains (7c) across to the left brake indicator (7c+). Null otherwise.
 */
export function sightLine(step: Step): [THREE.Vector3, THREE.Vector3] | null {
  const from = step.item.sightFrom ? stepOf(step.item.sightFrom) : undefined;
  const a = from && stepCentroid(from),
    b = stepCentroid(step);
  return a && b ? [a, b] : null;
}

/** Where to draw the pulsing halos for an item with `emphasis`: every instance of its modelled parts on its side. */
export function emphasisPoints(step: Step): THREE.Vector3[] {
  if (!step.item.emphasis) return [];
  const side = stepSide(step);
  return stepParts(step).shown.flatMap((n) => nameCentres(n, side));
}

/* ---------- saved progress ---------- */

export const PROGRESS_KEY = "sr22t-walkaround";
/** What localStorage keeps between visits. */
export interface Progress {
  v: 1;
  /** Current item id ("7c"). */
  at: string;
  /** Checked or skipped, by item id. */
  marks: Record<string, "ok" | "skip">;
  /** Time spent walking, ms. */
  ms: number;
  done: boolean;
}

/** Parse saved progress; anything malformed is no progress. */
export function parseProgress(raw: string | null): Progress | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<Progress>;
    if (p?.v !== 1 || typeof p.at !== "string" || typeof p.ms !== "number" || typeof p.marks !== "object") return null;
    const marks: Progress["marks"] = {};
    for (const [k, v] of Object.entries(p.marks ?? {})) if (v === "ok" || v === "skip") marks[k] = v;
    return { v: 1, at: p.at, marks, ms: p.ms, done: !!p.done };
  } catch {
    return null;
  }
}

/** Read saved progress; storage that can't be read (private mode, blocked) is no progress. */
export function loadProgress(): Progress | null {
  try {
    return parseProgress(localStorage.getItem(PROGRESS_KEY));
  } catch {
    return null;
  }
}
/** Save progress; a failed write is ignored (the walk works without storage). */
export function saveProgress(p: Progress | null) {
  try {
    if (p) localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
    else localStorage.removeItem(PROGRESS_KEY);
  } catch {}
}

/** The `walk` query value as a station number 1..13, or null. */
export function walkParam(search: string): number | null {
  const v = new URLSearchParams(search).get("walk");
  if (v === null) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= WALK.length ? n : v === "" ? 1 : null;
}

/** Counts for the finish summary: every item, technique items included, and the technique items on their own. */
export function tally(steps: Step[], marks: Progress["marks"]) {
  const ok = steps.filter((s) => marks[s.item.id] === "ok").length,
    skip = steps.filter((s) => marks[s.item.id] === "skip").length,
    tech = steps.filter((s) => s.item.technique);
  return {
    ok,
    skip,
    open: steps.length - ok - skip,
    tech: { ok: tech.filter((s) => marks[s.item.id] === "ok").length, of: tech.length },
  };
}

/** "12:05" from milliseconds. */
export const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Radius of a station marker on the mini-map, m in airplane coordinates (drawn at 10 map units per metre). */
export const MAP_MARK_R = 0.75; // approximate: display size of a marker, not a source value
