/**
 * SR22T guided preflight walk-around (aircraft/sr22t/walkaround.ts, walk.ts, walk-store.ts), against SR22T POH 13772-007
 * Section 4 "Preflight Inspection", pp. 4-4 – 4-9 and Figure 4-1 "Recommended Walk-Around Sequence": the 13 stations and
 * every lettered item in POH order, the parts each item shows, standing camera poses, the cabin station driving the
 * electrical model, the optional oxygen items, and saved progress that works without storage.
 */
import { Box3, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "@/aircraft";
import { GROUND_Y, inFus } from "@/aircraft/sr22t/geometry";
import { FLAP_DEG, flapPositionLit, initialSim, live, type Sim } from "@/aircraft/sr22t/model";
import { CAT } from "@/aircraft/sr22t/parts";
import { useSR22T } from "@/aircraft/sr22t/store";
import { simTick } from "@/aircraft/sr22t/tick";
import { SYS } from "@/aircraft/sr22t/systems";
import {
  inCatalogue,
  loadProgress,
  MAP_MARK_R,
  nameCentres,
  parseProgress,
  PROGRESS_KEY,
  saveProgress,
  simAt,
  stationCentroid,
  stepCentroid,
  stepParts,
  stepPose,
  stepSide,
  underAirplane as poseClear,
  walkParam,
  walkSteps,
  type Step,
} from "@/aircraft/sr22t/walk";
import {
  beginWalk,
  bootWalk,
  closeWalk,
  goStep,
  markStep,
  openWalk,
  resetWalk,
  resumeWalk,
  useWalk,
  walkNow,
} from "@/aircraft/sr22t/walk-store";
import { isPoh, NOT_MODELLED, WALK } from "@/aircraft/sr22t/walkaround";
import { partSide, spotsPart } from "@/lib/spot";
import { useView } from "@/lib/view";
import { patched } from "./helpers";

/** POH Figure 4-1 stations, in walk-around order (POH 4-5 – 4-9 headings). */
const POH_STATIONS = [
  "Cabin",
  "Left Fuselage",
  "Empennage",
  "Right Fuselage",
  "Right Wing Trailing Edge",
  "Right Wing Tip",
  "Right Forward Wing and Main Gear",
  "Nose, Right Side",
  "Nose Gear, Propeller, and Spinner",
  "Nose, Left Side",
  "Left Main Gear and Forward Wing",
  "Left Wing Tip",
  "Left Wing Trailing Edge",
];
/** Lettered items per station, POH 4-5 – 4-9 (1a–z, 2a–h, …); technique items are counted apart (walkaround-technique test). */
const POH_COUNTS = [26, 8, 6, 3, 4, 3, 7, 4, 9, 7, 7, 4, 4];
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

const allSteps = walkSteps(initialSim);
/** Budget for the one-off cold geometry setup in beforeAll (the per-test default 5 s timeout stays as it is). */
const GEOMETRY_SETUP_MS = 30_000;
const at = (id: string) => {
  const i = walkNow().steps.findIndex((s) => s.item.id === id);
  expect(i, id).toBeGreaterThanOrEqual(0);
  return i;
};

describe("stations and items follow POH 4-5 – 4-9 and Figure 4-1", () => {
  it("has the 13 Figure 4-1 stations, numbered 1..13 in walk-around order", () => {
    expect(WALK.map((s) => s.n)).toEqual(POH_STATIONS.map((_, i) => i + 1));
    expect(WALK.map((s) => s.title)).toEqual(POH_STATIONS);
  });

  it("lists every lettered POH item, in order, with the POH item counts per station", () => {
    const poh = WALK.map((s) => s.items.filter(isPoh));
    expect(poh.map((items) => items.length)).toEqual(POH_COUNTS);
    WALK.forEach((s, k) =>
      expect(poh[k].map((i) => i.id)).toEqual([...LETTERS.slice(0, poh[k].length)].map((l) => `${s.n}${l}`)),
    );
    const ids = WALK.flatMap((s) => s.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the POH action and standard text", () => {
    const item = (id: string) => WALK.flatMap((s) => s.items).find((i) => i.id === id)!;
    expect([item("1e").text, item("1e").standard]).toEqual(["Essential Bus Voltage", "23-25 VOLTS"]);
    expect([item("7c").text, item("7c").standard]).toEqual(["Fuel Drains (2 underside)", "DRAIN AND SAMPLE"]);
    expect(item("10a").standard).toBe("CHECK 6-8 QUARTS, LEAKS, CAP AND DOOR SECURE");
    expect(item("10e").standard).toBe("DRAIN FOR 3 SECONDS, SAMPLE");
    expect(item("1z").standard).toBe("PIN REMOVED");
    expect(item("1q").steps).toHaveLength(3);
  });

  it("explains every item in one non-empty line", () => {
    const bare = WALK.flatMap((st) => st.items).filter((item) => !item.why?.trim() || /\n/.test(item.why));
    expect(bare.map((item) => item.id)).toEqual([]);
  });

  it("cites the POH page of every item", () => {
    for (const s of WALK) for (const i of s.items.filter(isPoh)) expect(i.ref, i.id).toMatch(/^POH 4-[5-9]$/);
  });

  it("places the mini-map stations around the airplane without overlapping", () => {
    for (const a of WALK)
      for (const b of WALK)
        if (a.n < b.n) {
          const d = Math.hypot(a.map[0] - b.map[0], a.map[1] - b.map[1]);
          expect(d, `stations ${a.n} and ${b.n}`).toBeGreaterThan(2 * MAP_MARK_R);
        }
    // right-side stations on the right wing's side, left-side ones on the left (Fig 4-1)
    for (const s of WALK) if (s.side) expect(Math.sign(s.map[1]), `station ${s.n}`).toBe(s.side === "R" ? 1 : -1);
  });

  it("carries the station 9 propeller warning and the station 10 oil caution", () => {
    expect(WALK[8].warning).toContain("Keep clear of propeller rotation plane");
    expect(WALK[9].warning).toContain("less than six quarts of oil");
    expect(WALK.filter((s) => s.warning).map((s) => s.n)).toEqual([9, 10]);
  });
});

describe("every item points at the model", () => {
  const names = [...new Set(WALK.flatMap((s) => s.items.flatMap((i) => i.parts)))];

  it("names only catalogue parts, surfaces or shells, or ones listed as not modelled with a reason", () => {
    for (const n of names) expect(inCatalogue(n) || n in NOT_MODELLED, n).toBe(true);
    for (const [n, why] of Object.entries(NOT_MODELLED)) {
      expect(inCatalogue(n), `${n} is in the catalogue`).toBe(false);
      expect(names, `${n} is not used`).toContain(n);
      expect(why.length).toBeGreaterThan(10);
    }
  });

  it("shows only systems the SR22T has", () => {
    const ids = new Set(SYS.map((s) => s.id));
    for (const s of WALK) for (const i of s.items) if (i.system) expect(ids.has(i.system), i.id).toBe(true);
  });

  it("finds the parts of every item with modelled parts on the item's side", () => {
    for (const step of allSteps) {
      const { shown } = stepParts(step);
      if (!shown.length) continue;
      expect(stepCentroid(step), step.item.id).not.toBeNull();
    }
  });

  it("tells the left and right instances of a shared part name apart", () => {
    const right = nameCentres("Main wheel", 1),
      left = nameCentres("Main wheel", -1);
    expect(right).toHaveLength(1);
    expect(left).toHaveLength(1);
    expect(right[0].z).toBeGreaterThan(1);
    expect(left[0].z).toBeLessThan(-1);
    const wheels = CAT.parts.filter((p) => p.name === "Main wheel");
    const spot = { names: ["Main wheel"], side: 1 as const };
    expect(wheels.map((p) => spotsPart(spot, p, p.geo(), CAT))).toEqual(
      wheels.map((p) => partSide(p, p.geo(), CAT) === 1),
    );
    // station 7 is the right main gear, station 11 the left (POH 4-7, 4-9)
    const s7 = allSteps.find((s) => s.item.id === "7e")!,
      s11 = allSteps.find((s) => s.item.id === "11b")!;
    expect(stepCentroid(s7)!.z).toBeGreaterThan(1);
    expect(stepCentroid(s11)!.z).toBeLessThan(-1);
  });
});

describe("station viewpoints: standing on the ground beside the airplane", () => {
  // Build the item framing's geometry caches (part centres, the airplane's top-view outline) once, cold, before the
  // per-item cases: a few seconds under --maxWorkers=2, so each case then runs well inside the default 5 s timeout.
  beforeAll(() => {
    poseClear(new Vector3());
    for (const step of allSteps) stepCentroid(step);
  }, GEOMETRY_SETUP_MS);

  /** Top-view boxes of the skin shells and control surfaces, grown by 0.3 m for a person standing there. */
  const footprint = [
    ...CAT.shells.map((s) => {
      const g = s.geo();
      g.computeBoundingBox();
      return g.boundingBox!.clone();
    }),
    ...CAT.surfaces.map((s) => {
      const g = s.geo();
      g.computeBoundingBox();
      return g.boundingBox!.clone().translate(new Vector3(...s.pivot));
    }),
  ].map((b) => b.expandByScalar(0.3));
  const underAirplane = (p: Vector3) =>
    footprint.some((b: Box3) => p.x >= b.min.x && p.x <= b.max.x && p.z >= b.min.z && p.z <= b.max.z);

  for (const st of WALK)
    it(`station ${st.n} (${st.title})`, () => {
      const p = new Vector3(...st.cam.p),
        t = new Vector3(...st.cam.t);
      expect(p.y - GROUND_Y).toBeGreaterThanOrEqual(1.5);
      expect(p.y - GROUND_Y).toBeLessThanOrEqual(1.8);
      expect(inFus(p)).toBe(false);
      expect(underAirplane(p)).toBe(false);
      // the station's parts are in front of the camera, near the middle of the view (38° field of view)
      const c = stationCentroid(st)!,
        look = t.clone().sub(p).normalize(),
        toParts = c.clone().sub(p).normalize();
      expect(look.dot(toParts)).toBeGreaterThan(Math.cos((19 * Math.PI) / 180));
    });

  /**
   * The underside checks the item camera crouches for (POH 4-7 – 4-9: fuel drains, fuel vents, gascolator), and the
   * technique items that check the opposite brake indicator from the drains (AMM 32-42).
   */
  const CROUCH = ["6c", "7c", "7c+", "10e", "11e", "11e+", "12a"];
  const skins = CAT.shells.map((s) => new Mesh(s.geo(), new MeshBasicMaterial({ side: DoubleSide })));
  /** Is `c` under the airplane: does the skin lie straight above it? */
  const underside = (c: Vector3) =>
    new Raycaster(c.clone().setY(c.y - 0.05), new Vector3(0, 1, 0)).intersectObjects(skins).length > 0;

  it("crouches only for the underside drains, vents and gascolator, marked per item", () => {
    expect(allSteps.filter((s) => s.item.crouch).map((s) => s.item.id)).toEqual(CROUCH);
    for (const id of CROUCH) expect(underside(stepCentroid(allSteps.find((s) => s.item.id === id)!)!), id).toBe(true);
  });

  for (const step of allSteps)
    it(`frames item ${step.item.id} ${step.item.crouch ? "crouched" : "standing"} beside the airplane, looking at it`, () => {
      const pose = stepPose(step),
        p = new Vector3(...pose.p),
        h = p.y - GROUND_Y;
      if (step.item.crouch) {
        expect(h).toBeGreaterThanOrEqual(1.0);
        expect(h).toBeLessThanOrEqual(1.2);
      } else {
        expect(h).toBeGreaterThanOrEqual(1.5);
        expect(h).toBeLessThanOrEqual(1.8);
      }
      expect(inFus(p)).toBe(false);
      expect(underAirplane(p)).toBe(false);
      const c = stepCentroid(step);
      if (c) expect(new Vector3(...pose.t).distanceTo(c)).toBeLessThan(1e-9);
      else expect(pose).toBe(step.station.cam);
    });
});

describe("the cabin station drives the airplane (POH 4-5, 4-6)", () => {
  beforeEach(() => {
    useSR22T.setState({ s: initialSim, E: useSR22T.getState().E });
    useSR22T.getState().update(() => {});
    useView.setState({ ac: "sr22t", sys: "fuel", xray: false, labels: true, spin: true, walking: false, spot: null });
  });
  afterEach(() => closeWalk());

  it("walks the switches through the cabin items, forward and back", () => {
    openWalk();
    beginWalk();
    const s = () => useSR22T.getState().s,
      E = () => useSR22T.getState().E;
    // on the ramp: engine stopped, everything off
    goStep(at("1b"));
    expect(s().eng.running).toBe(false);
    expect([s().elec.bat1, s().elec.bat2, s().elec.avionics]).toEqual([false, false, false]);
    expect(E().ess1).toBe(0);
    // 1c BAT 2 ON: the essential bus reads 23-25 V on BAT 2 alone (1e), and the PFD is on (1d)
    goStep(at("1c"));
    expect(s().elec.bat2).toBe(true);
    expect(s().elec.bat1).toBe(false);
    expect(E().ess1).toBeGreaterThanOrEqual(23);
    expect(E().ess1).toBeLessThanOrEqual(25);
    expect(E().pfd).toBe(true);
    expect(E().mdb1).toBe(0);
    // stepping back undoes it
    goStep(at("1b"));
    expect(s().elec.bat2).toBe(false);
    expect(E().ess1).toBe(0);
    // 1g BAT 1, 1j AVIONICS, 1m flaps 100%
    goStep(at("1m"));
    expect([s().elec.bat1, s().elec.bat2, s().elec.avionics]).toEqual([true, true, true]);
    expect(s().flaps.cmd).toBe(100);
    expect(E().flapsPwr).toBe(true);
    // 1l: the fuller tank
    expect(s().fuel.sel).toBe(initialSim.fuel.qR > initialSim.fuel.qL ? "R" : "L");
    // 1r pitot heat on, 1s off
    goStep(at("1r"));
    expect(s().pitot.heat).toBe(true);
    goStep(at("1s"));
    expect(s().pitot.heat).toBe(false);
    // 1u: both batteries off, flaps left down for the walk-around
    goStep(at("1u"));
    expect([s().elec.bat1, s().elec.bat2, s().elec.avionics]).toEqual([false, false, false]);
    expect(E().ess1).toBe(0);
    expect(s().flaps.cmd).toBe(100);
    // later stations keep the cabin's end state
    goStep(at("7c"));
    expect(s().elec.bat1).toBe(false);
    // and back into the cabin
    goStep(at("1g"));
    expect([s().elec.bat1, s().elec.bat2]).toEqual([true, true]);
    expect(s().flaps.cmd).toBe(0);
  });

  it("puts the flaps where the cabin items leave them, however the step is reached (POH 4-5 1m, 1u)", () => {
    live.flapAng = 16;
    openWalk();
    beginWalk();
    const angle = () => live.flapAng,
      lit = (cmd: 0 | 50 | 100) => flapPositionLit(cmd, live.flapAng, useSR22T.getState().E.flapsPwr);
    // on the ramp the flaps are up
    expect(angle()).toBe(FLAP_DEG[0]);
    // a direct jump to an exterior item: batteries off, flaps down from 1m, and they stay there with no power
    goStep(at("7c"));
    expect(useSR22T.getState().E.flapsPwr).toBe(false);
    expect(angle()).toBe(FLAP_DEG[100]);
    simTick(0.5);
    simTick(10);
    expect(angle()).toBe(FLAP_DEG[100]);
    // back into the cabin before 1m: up again, the same as walking there
    goStep(at("1g"));
    expect(angle()).toBe(FLAP_DEG[0]);
    simTick(10);
    expect(angle()).toBe(FLAP_DEG[0]);
    expect(lit(0)).toBe(true);
    // 1l → 1m one item at a time: the motor runs them down from up, and the 100% light comes on when they get there
    goStep(at("1l"));
    goStep(at("1m"));
    expect(angle()).toBe(FLAP_DEG[0]);
    expect(lit(100)).toBe(false);
    simTick(5);
    expect(angle()).toBeGreaterThan(FLAP_DEG[0]);
    expect(angle()).toBeLessThan(FLAP_DEG[100]);
    simTick(10);
    expect(angle()).toBe(FLAP_DEG[100]);
    expect(lit(100)).toBe(true);
    // a jump to 1m (not one step forward) shows them already down
    goStep(at("1a"));
    goStep(at("1m"));
    expect(angle()).toBe(FLAP_DEG[100]);
    // leaving puts the original angle back
    closeWalk();
    expect(angle()).toBe(16);
  });

  it("puts the user's camera framing, focus and hover back on exit", () => {
    const cam = { p: [8, 2, 3] as [number, number, number], t: [1, 0, 0] as [number, number, number], id: 912 },
      hover = { name: "Filler cap", note: "", color: "#000", x: 10, y: 20 };
    useView.setState({ cam, focus: "Filler cap", hover });
    openWalk();
    beginWalk();
    goStep(at("7c"));
    useView.getState().flyTo([1, 1, 1], [0, 0, 0]);
    expect(useView.getState().cam).not.toBe(cam);
    closeWalk();
    expect(useView.getState().cam).toBe(cam);
    expect(useView.getState().focus).toBe("Filler cap");
    expect(useView.getState().hover).toBe(hover);
  });

  it("restores the exact prior airplane state and view on exit", () => {
    useSR22T.getState().update((d) => {
      d.cb["FUEL PUMP"] = true;
      d.fuel.qL = 11;
    });
    const before = useSR22T.getState();
    openWalk();
    expect(useView.getState()).toMatchObject({ walking: true, xray: true, labels: false, spin: false });
    beginWalk();
    goStep(at("1w"));
    expect(useSR22T.getState().s.cb).toEqual({});
    closeWalk();
    expect(useSR22T.getState().s).toBe(before.s);
    expect(useSR22T.getState().E).toBe(before.E);
    expect(useView.getState()).toMatchObject({
      walking: false,
      sys: "fuel",
      xray: false,
      labels: true,
      spin: true,
      spot: null,
    });
  });

  it("marks items checked or skipped and finishes after the last", () => {
    openWalk();
    beginWalk();
    markStep("ok");
    markStep("skip");
    expect(useWalk.getState().marks).toEqual({ "1a": "ok", "1b": "skip" });
    goStep(walkNow().steps.length - 1);
    markStep("ok");
    expect(useWalk.getState().phase).toBe("done");
  });

  it("highlights the item's parts on its side and shows its system", () => {
    openWalk();
    beginWalk();
    goStep(at("7e"));
    // the spot itself is set by the panel; the step names what it shows
    const step = walkNow().steps[useWalk.getState().at];
    expect(stepParts(step).shown).toEqual(["Main wheel"]);
    expect(stepSide(step)).toBe(1);
    expect(step.item.system).toBe("gear");
  });
});

describe("optional equipment", () => {
  it("shows the oxygen items 1i and 1q only when oxygen is fitted (POH 4-5, 'if available')", () => {
    const ids = (s: Sim) => walkSteps(s).map((x) => x.item.id);
    expect(ids(initialSim)).toEqual(expect.arrayContaining(["1i", "1q"]));
    const none = patched(initialSim, { equip: { oxygen: false } });
    expect(ids(none)).not.toContain("1i");
    expect(ids(none)).not.toContain("1q");
    expect(walkSteps(none).filter((x) => x.station.n === 1)).toHaveLength(24);
    expect(walkSteps(none)).toHaveLength(allSteps.length - 2);
  });

  it("still runs the cabin switches without oxygen", () => {
    const none = patched(initialSim, { equip: { oxygen: false } });
    const steps = walkSteps(none);
    const s = simAt(
      none,
      steps,
      steps.findIndex((x: Step) => x.item.id === "1r"),
    );
    expect(s.pitot.heat).toBe(true);
    expect(s.oxy.on).toBe(false);
  });
});

describe("saved progress and deep links", () => {
  const store = new Map<string, string>();
  const ok = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const broken = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
  };
  const g = globalThis as { localStorage?: unknown };
  afterEach(() => {
    delete g.localStorage;
    store.clear();
    closeWalk();
  });

  it("resumes where the walk was left", () => {
    g.localStorage = ok;
    useView.setState({ ac: "sr22t", walking: false });
    openWalk();
    beginWalk();
    goStep(at("7c"));
    markStep("ok");
    closeWalk();
    // the next item after 7c is the 7c+ technique item (the left brake indicator, from the right drains)
    expect(loadProgress()).toMatchObject({ at: "7c+", marks: { "7c": "ok" }, done: false });
    bootWalk("");
    expect(useWalk.getState().phase).toBe("resume");
    resumeWalk();
    expect(walkNow().steps[useWalk.getState().at].item.id).toBe("7c+");
    resetWalk();
    expect(store.has(PROGRESS_KEY)).toBe(false);
  });

  it("shows the flaps down when resuming or deep-linking to an exterior item", () => {
    g.localStorage = ok;
    useView.setState({ ac: "sr22t", walking: false });
    live.flapAng = 0;
    saveProgress({ v: 1, at: "12b", marks: {}, ms: 0, done: false });
    bootWalk("");
    resumeWalk();
    expect(walkNow().steps[useWalk.getState().at].item.id).toBe("12b");
    expect(live.flapAng).toBe(FLAP_DEG[100]);
    closeWalk();
    expect(live.flapAng).toBe(0);
    bootWalk("?walk=7");
    beginWalk();
    expect(walkNow().steps[useWalk.getState().at].item.id).toBe("7a");
    expect(live.flapAng).toBe(FLAP_DEG[100]);
    closeWalk();
    expect(live.flapAng).toBe(0);
  });

  it("works when storage throws", () => {
    g.localStorage = broken;
    expect(loadProgress()).toBeNull();
    expect(() => saveProgress({ v: 1, at: "1a", marks: {}, ms: 0, done: false })).not.toThrow();
    useView.setState({ ac: "sr22t", walking: false });
    expect(() => {
      openWalk();
      beginWalk();
      markStep("ok");
      closeWalk();
    }).not.toThrow();
  });

  it("ignores malformed saved progress", () => {
    for (const raw of [null, "", "{", "[]", '{"v":2,"at":"1a","marks":{},"ms":0}', '{"v":1,"at":3}'])
      expect(parseProgress(raw), String(raw)).toBeNull();
    expect(parseProgress('{"v":1,"at":"2b","marks":{"2a":"ok","2b":"bogus"},"ms":5}')).toEqual({
      v: 1,
      at: "2b",
      marks: { "2a": "ok" },
      ms: 5,
      done: false,
    });
  });

  it("opens station n from ?walk=n", () => {
    expect(walkParam("?walk=7")).toBe(7);
    expect(walkParam("?walk=")).toBe(1);
    for (const q of ["", "?walk=0", "?walk=14", "?walk=x", "?walk=2.5"]) expect(walkParam(q), q).toBeNull();
    useView.setState({ ac: "sr22t", walking: false });
    bootWalk("?walk=7");
    expect(useWalk.getState()).toMatchObject({ phase: "intro", from: 7 });
    beginWalk();
    expect(walkNow().steps[useWalk.getState().at].item.id).toBe("7a");
  });
});
