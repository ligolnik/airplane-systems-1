/**
 * SR22T walk-around technique items: checks taught at the airplane that the POH 13772-007 4-4 – 4-9
 * checklist doesn't list, shown with a "Technique (not in the POH)" badge and counted apart from the POH items.
 * - 7c+ / 11e+: the opposite main wheel's brake temperature indicator, from the drains under the other wing. AMM 13773-002
 *   Rev 7 32-42 (PDF 1450, 1461; Fig 32-42-1, PDF 1462): it is on the caliper piston housing, white until the brake
 *   reaches 450 °F, then black.
 * - 9g+: the front cowl fasteners behind the spinner. AMM 71-10 (PDF 2504, 2515; Fig 71-10-2, PDF 2510): screws join the
 *   upper and lower cowls at the forward inlets and must be in before the engine starts.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Box3, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import "@/aircraft";
import { FUSE, GROUND_Y, inFus, SPINNER_BASE_X } from "@/aircraft/sr22t/geometry";
import { initialSim } from "@/aircraft/sr22t/model";
import { CAT } from "@/aircraft/sr22t/parts";
import { Item } from "@/aircraft/sr22t/panels/walkaround";
import {
  emphasisPoints,
  loadProgress,
  nameCentres,
  sightLine,
  stepCentroid,
  stepParts,
  stepPose,
  stepSide,
  tally,
  underAirplane,
  walkSteps,
  type Step,
} from "@/aircraft/sr22t/walk";
import {
  beginWalk,
  closeWalk,
  goStep,
  markStep,
  openWalk,
  resumeWalk,
  useWalk,
  walkNow,
} from "@/aircraft/sr22t/walk-store";
import { isPoh, NOT_MODELLED, TECHNIQUE_BADGE, WALK } from "@/aircraft/sr22t/walkaround";
import { spotsPart } from "@/lib/spot";
import { useView } from "@/lib/view";

/** Lettered POH items per station (POH 4-5 – 4-9), unchanged by the technique items. */
const POH_COUNTS = [26, 8, 6, 3, 4, 3, 7, 4, 9, 7, 7, 4, 4];
/** Technique items, each right after the POH item it follows at the airplane. */
const TECHNIQUE = [
  { id: "7c+", after: "7c" },
  { id: "9g+", after: "9g" },
  { id: "11e+", after: "11e" },
];
/** Budget for the one-off cold geometry setup in beforeAll (each case keeps the default 5 s timeout). */
const GEOMETRY_SETUP_MS = 30_000;

const steps = walkSteps(initialSim);
const step = (id: string) => {
  const s = steps.find((x) => x.item.id === id);
  if (!s) throw new Error(`no walk-around item ${id}`);
  return s;
};
const card = (s: Step) => renderToStaticMarkup(createElement(Item, { step: s, at: steps.indexOf(s), steps }));
const FASTENER = "Front cowl fastener";

beforeAll(() => {
  underAirplane(new Vector3());
  for (const s of steps) stepCentroid(s);
  for (const s of CAT.shells) s.geo();
}, GEOMETRY_SETUP_MS);

describe("technique items are counted apart from the POH items", () => {
  it("keeps the POH item counts exact and counts the technique items separately", () => {
    expect(WALK.map((s) => s.items.filter(isPoh).length)).toEqual(POH_COUNTS);
    const tech = WALK.flatMap((s) => s.items.filter((i) => i.technique));
    expect(tech.map((i) => i.id)).toEqual(TECHNIQUE.map((t) => t.id));
    expect(steps).toHaveLength(POH_COUNTS.reduce((a, b) => a + b) + TECHNIQUE.length);
  });

  it("places each technique item right after the POH item it goes with", () => {
    const ids = steps.map((s) => s.item.id);
    for (const t of TECHNIQUE) expect(ids[ids.indexOf(t.after) + 1], t.id).toBe(t.id);
  });

  it("cites the AMM for the technique items", () => {
    expect(step("7c+").item.ref).toMatch(/^AMM 32-42/);
    expect(step("11e+").item.ref).toMatch(/^AMM 32-42/);
    expect(step("9g+").item.ref).toMatch(/^AMM 71-10/);
  });
});

describe("the card shows the technique badge", () => {
  it("badges the technique items and no POH item", () => {
    for (const s of steps) {
      const html = card(s);
      expect(html.includes(TECHNIQUE_BADGE), s.item.id).toBe(!!s.item.technique);
    }
    expect(TECHNIQUE_BADGE).toBe("Technique (not in the POH)");
  });

  it("says which main wheel the pilot looks across at", () => {
    expect(card(step("7c+"))).toContain("Looking across at the LEFT main wheel");
    expect(card(step("11e+"))).toContain("Looking across at the RIGHT main wheel");
  });

  it("points 7f and 11c at the item that checks their indicator from the other side", () => {
    expect(card(step("7f"))).toContain("Indicator checked from the other side, see 11e.");
    expect(card(step("11c"))).toContain("Indicator checked from the other side, see 7c.");
    // 11e+ is the right wheel's (7f's) indicator; 7c+ the left wheel's (11c's)
    expect(stepSide(step("11e+"))).toBe(stepSide(step("7f")));
    expect(stepSide(step("7c+"))).toBe(stepSide(step("11c")));
  });

  it("draws the line of sight on the mini-map only for the opposite-wheel checks", () => {
    for (const s of steps) expect(card(s).includes('class="sight"'), s.item.id).toBe(!!s.item.sightFrom);
  });

  it("keeps the station 9 propeller warning on the fastener card", () => {
    expect(card(step("9g+"))).toContain("Keep clear of propeller rotation plane.");
  });
});

describe("the brake temperature indicator, seen from the opposite wheel (AMM 32-42)", () => {
  const skins = CAT.shells.map((s) => new Mesh(s.geo(), new MeshBasicMaterial({ side: DoubleSide })));
  const indicators = (side: -1 | 1) => nameCentres("Brake temperature indicator", side);

  for (const [id, side, word] of [
    ["7c+", -1, "LEFT"],
    ["11e+", 1, "RIGHT"],
  ] as const)
    it(`${id} crouches on the other side and looks under the fuselage at the ${word} indicator`, () => {
      const s = step(id),
        pose = stepPose(s),
        eye = new Vector3(...pose.p),
        target = new Vector3(...pose.t);
      expect(s.item.look).toBe(`Looking across at the ${word} main wheel`);
      expect(s.item.why).toContain("450 °F");
      expect(s.item.why).toContain("AMM 32-42");
      // the target is that side's indicator; the eye is on the other side
      expect(indicators(side)).toHaveLength(1);
      expect(target.distanceTo(indicators(side)[0])).toBeLessThan(1e-9);
      expect(Math.sign(eye.z)).toBe(-side);
      // crouched, beside the airplane: not in the fuselage, not over or under its top-view outline
      expect(eye.y - GROUND_Y).toBeGreaterThanOrEqual(1.0);
      expect(eye.y - GROUND_Y).toBeLessThanOrEqual(1.2);
      expect(inFus(eye)).toBe(false);
      expect(underAirplane(eye)).toBe(false);
      // the line of sight passes under the fuselage: no skin between the eye and the indicator
      const dir = target.clone().sub(eye),
        d = dir.length();
      expect(new Raycaster(eye, dir.normalize(), 0, d).intersectObjects(skins)).toEqual([]);
      const k = eye.z / (eye.z - target.z),
        mid = eye.clone().lerp(target, k);
      expect(mid.y).toBeLessThan(FUSE.botY(mid.x));
      // the scene and the mini-map draw the sight from the pilot's spot at the near-side drains
      const line = sightLine(s)!;
      expect(line[0].distanceTo(stepCentroid(step(s.item.sightFrom!))!)).toBeLessThan(1e-9);
      expect(line[1].distanceTo(target)).toBeLessThan(1e-9);
      expect(Math.sign(line[0].z)).toBe(-side);
    });

  it("sits on the inboard side of its caliper, on both sides", () => {
    const box = (name: string, side: -1 | 1) => {
      const p = CAT.parts.find((x) => x.name === name && Math.sign(x.pos![2]) === side)!;
      const g = p.geo();
      g.computeBoundingBox();
      return g.boundingBox!.clone().translate(new Vector3(...p.pos!));
    };
    for (const side of [-1, 1] as const) {
      const ind = box("Brake temperature indicator", side),
        cal: Box3 = box("Brake caliper", side);
      const inboardFace = Math.min(Math.abs(cal.min.z), Math.abs(cal.max.z));
      const c = ind.getCenter(new Vector3());
      expect(Math.abs(c.z), `side ${side}`).toBeLessThan(inboardFace);
      // stuck to the housing: within 2 mm of its inboard face, and within its fore-aft and vertical extent
      expect(inboardFace - Math.abs(c.z)).toBeLessThan(0.002);
      expect(c.x).toBeGreaterThan(cal.min.x);
      expect(c.x).toBeLessThan(cal.max.x);
      expect(c.y).toBeGreaterThan(cal.min.y);
      expect(c.y).toBeLessThan(cal.max.y);
    }
  });
});

describe("the front cowl fasteners behind the spinner (AMM 71-10)", () => {
  const fasteners = CAT.parts.filter((p) => p.name === FASTENER);
  const centre = (p: (typeof fasteners)[number]) => {
    const g = p.geo();
    g.computeBoundingBox();
    return g.boundingBox!.getCenter(new Vector3());
  };

  it("models a ring of fasteners on the cowl skin just aft of the spinner", () => {
    expect(fasteners.length).toBeGreaterThan(0);
    for (const p of fasteners) {
      const c = centre(p);
      // on the skin: inside the cowl grown by 4 mm, outside it shrunk by 4 mm
      expect(FUSE.inside(c, -0.004), p.id).toBe(true);
      expect(FUSE.inside(c, 0.004), p.id).toBe(false);
      expect(c.x).toBeLessThan(SPINNER_BASE_X);
      expect(c.x).toBeGreaterThan(SPINNER_BASE_X - 0.1);
    }
    expect(NOT_MODELLED).not.toHaveProperty("Cowling fasteners");
  });

  it("highlights every fastener on 9g+ and emphasizes them with halos there only", () => {
    const s = step("9g+");
    expect(stepParts(s).shown).toEqual([FASTENER]);
    const spot = { names: stepParts(s).shown, side: stepSide(s) };
    for (const p of fasteners) expect(spotsPart(spot, p, p.geo(), CAT), p.id).toBe(true);
    expect(emphasisPoints(s)).toHaveLength(fasteners.length);
    for (const other of steps) if (other !== s) expect(emphasisPoints(other), other.item.id).toEqual([]);
  });

  it("frames the fastener ring from in front of the spinner, looking aft, standing", () => {
    const pose = stepPose(step("9g+")),
      eye = new Vector3(...pose.p),
      look = new Vector3(...pose.t).sub(eye).normalize();
    expect(eye.y - GROUND_Y).toBeGreaterThanOrEqual(1.5);
    expect(eye.y - GROUND_Y).toBeLessThanOrEqual(1.8);
    expect(eye.x).toBeGreaterThan(SPINNER_BASE_X);
    expect(look.x).toBeLessThan(0);
    expect(inFus(eye)).toBe(false);
    expect(underAirplane(eye)).toBe(false);
    // the whole ring is inside the 38° field of view
    for (const p of fasteners)
      expect(look.dot(centre(p).sub(eye).normalize()), p.id).toBeGreaterThan(Math.cos((19 * Math.PI) / 180));
  });

  it("uses the fasteners in 8c and 10c, on each item's side", () => {
    for (const [id, side] of [
      ["8c", 1],
      ["10c", -1],
    ] as const) {
      const s = step(id);
      expect(stepParts(s).shown).toContain(FASTENER);
      expect(stepSide(s)).toBe(side);
      const mine = nameCentres(FASTENER, side);
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.length).toBeLessThan(fasteners.length);
      for (const c of mine) expect(Math.sign(c.z)).toBe(side);
    }
  });
});

describe("technique items walk like the others", () => {
  const store = new Map<string, string>();
  const g = globalThis as { localStorage?: unknown };
  afterEach(() => {
    closeWalk();
    delete g.localStorage;
    store.clear();
  });

  it("are checked, skipped, saved, resumed and counted in the summary", () => {
    g.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    useView.setState({ ac: "sr22t", walking: false });
    openWalk();
    beginWalk();
    const at = (id: string) => walkNow().steps.findIndex((s) => s.item.id === id);
    goStep(at("7c+"));
    markStep("ok");
    expect(walkNow().steps[useWalk.getState().at].item.id).toBe("7d");
    goStep(at("9g+"));
    markStep("skip");
    closeWalk();
    expect(loadProgress()).toMatchObject({ at: "9h", marks: { "7c+": "ok", "9g+": "skip" } });
    openWalk();
    resumeWalk();
    expect(walkNow().steps[useWalk.getState().at].item.id).toBe("9h");
    const n = tally(walkNow().steps, useWalk.getState().marks);
    expect(n).toMatchObject({ ok: 1, skip: 1, tech: { ok: 1, of: TECHNIQUE.length } });
  });
});
