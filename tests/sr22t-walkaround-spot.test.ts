/**
 * Walk-around spotlight ("dim everything else"; POH 13772-007 4-4 – 4-9): while an item is spotted,
 * its parts are highlighted and every other part, surface and skin is dimmed, including the rest of the item's own system
 * and the other side's instance of a shared name; the system stays visible in X-ray at the dimmed level. With no spot,
 * parts, surfaces and skins look exactly as before the walk-around existed.
 */
import * as THREE from "three";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import "@/aircraft";
import { CAT } from "@/aircraft/sr22t/parts";
import { ControlSurface } from "@/components/scene/ControlSurface";
import { Flows } from "@/components/scene/Flows";
import { Links } from "@/components/scene/Links";
import { Tanks } from "@/components/scene/Tanks";
import { Part, Shell, specGeo } from "@/components/scene/Part";
import type { PartSpec } from "@/lib/catalogue";
import { ghostMat, mats, plateMat, seeMat, shellMat } from "@/lib/materials";
import { partSide, SPOT_COLOR, type Spot } from "@/lib/spot";
import { sysColor, type Chan, type SysId } from "@/lib/systems";
import { useView } from "@/lib/view";

const frame = vi.hoisted(() => ({ cbs: [] as ((s: unknown) => void)[], seen: [] as { active: boolean }[] }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (v?: unknown) => ({ current: v ?? null }),
  useEffect: () => {},
  useMemo: (f: () => unknown) => f(),
}));
vi.mock("@react-three/fiber", () => ({
  useFrame: (cb: (s: unknown) => void) => frame.cbs.push(cb),
  useThree: () => null,
}));
vi.mock("@/lib/anims", async (original) => ({
  ...(await original<typeof import("@/lib/anims")>()),
  animatePart: (_m: unknown, _t: number, _s: unknown, appearance: { active: boolean }) => frame.seen.push(appearance),
}));
// the flow dots' sprite is drawn on a browser canvas
vi.mock("@/lib/materials", async (original) => ({
  ...(await original<typeof import("@/lib/materials")>()),
  dotTex: () => null,
}));
vi.mock("@/lib/view", async (original) => {
  const actual = await original<typeof import("@/lib/view")>();
  return {
    ...actual,
    useView: Object.assign(
      (select: (s: ReturnType<typeof actual.useView.getState>) => unknown) => select(actual.useView.getState()),
      actual.useView,
    ),
    useNarrowLayout: () => false,
  };
});

type El = ReactElement<{ material: THREE.Material; children?: unknown }>;
/** A part as drawn: its material and whether it counts as active. */
function drawPart(spec: PartSpec) {
  frame.cbs = [];
  frame.seen = [];
  const el = Part({ spec, cat: CAT }) as El;
  frame.cbs.forEach((cb) => cb({ clock: { elapsedTime: 0 } }));
  return { material: el.props.material, active: frame.seen[0].active };
}
const surface = (name: string) => {
  const spec = CAT.surfaces.find((s) => s.name === name)!;
  const el = ControlSurface({ spec, cat: CAT, angle: () => 0 }) as El;
  return ((el.props.children as El[])[0] as El).props.material;
};
const theme = () => useView.getState().theme;
const colorOf = (p: PartSpec) => p.color || sysColor(p.sys[0], theme());
const named = (name: string, side: -1 | 1) =>
  CAT.parts.find((p) => p.name === name && partSide(p, specGeo(p), CAT) === side)!;

/** Budget for building every catalogue geometry once, cold, under --maxWorkers=2 (a few seconds); the cases then run on
 * the cached geometry within the default 5 s test timeout. */
const GEOMETRY_SETUP_MS = 30_000;
beforeAll(() => {
  // the geometry and bounding boxes Part, Shell and ControlSurface read (specGeo caches them for the whole file)
  for (const p of CAT.parts) partSide(p, specGeo(p), CAT);
  for (const s of [...CAT.surfaces, ...CAT.shells]) specGeo(s).computeBoundingBox();
}, GEOMETRY_SETUP_MS);

const saved = useView.getState();
afterEach(() => useView.setState(saved));
const walkView = (sys: SysId, spot: Spot | null) =>
  useView.setState({ ac: "sr22t", sys, spot, xray: true, labels: false, focus: null, ctrlFocus: "all" });

describe("a spotted item dims everything else (7e: right main wheel, gear system)", () => {
  const spot: Spot = { names: ["Main wheel"], side: 1 };
  const right = named("Main wheel", 1),
    left = named("Main wheel", -1),
    brake = named("Brake disc", 1);

  it("highlights the spotted part", () => {
    walkView("gear", spot);
    expect(drawPart(right)).toEqual({ material: mats(SPOT_COLOR).hi, active: true });
  });

  it("dims an unspotted part of the same system, still drawn in its system colour (X-ray)", () => {
    expect(brake.sys).toContain("gear");
    walkView("gear", spot);
    expect(drawPart(brake)).toEqual({ material: mats(colorOf(brake)).dim, active: false });
  });

  it("dims the other side's instance of the spotted name", () => {
    walkView("gear", spot);
    expect(drawPart(left)).toEqual({ material: mats(colorOf(left)).dim, active: false });
  });

  it("leaves the spotted surface highlighted and dims the rest of its system and the other side (5b)", () => {
    walkView("controls", { names: ["Right aileron"], side: 1 });
    expect(surface("Right aileron")).toBe(seeMat(SPOT_COLOR));
    expect(surface("Left aileron")).toBe(shellMat);
    expect(surface("Rudder")).toBe(shellMat);
  });

  it("highlights only the spotted side's skin shells", () => {
    walkView("overview", { names: ["Wing trailing edge"], side: 1 });
    const edges = CAT.shells.filter((s) => s.name === "Wing trailing edge");
    const lit = edges.map((s) => (Shell({ spec: s }) as El).props.material === seeMat(SPOT_COLOR));
    expect(lit.filter(Boolean).length).toBeGreaterThan(0);
    expect(lit.filter((x) => !x).length).toBeGreaterThan(0);
    edges.forEach((s, i) => {
      const g = specGeo(s);
      g.computeBoundingBox();
      expect(lit[i], s.id).toBe((g.boundingBox!.min.z + g.boundingBox!.max.z) / 2 > 0);
    });
  });
});

describe("tanks, fuel lines and linkages dim with the rest (7c: fuel drains)", () => {
  const tank = { key: "t", geo: () => new THREE.BoxGeometry(1, 0.2, 0.5), level: () => 0.5, name: "Tank", note: "" };
  const line = {
    key: "f",
    pts: [[0, 0, 0] as const, [1, 0, 0] as const, [2, 0.1, 0] as const],
    sys: ["fuel" as SysId],
  };
  const cable = { name: "Cable", note: "", r: 0.01, sys: ["fuel" as SysId] };
  /** Tank skin and fuel opacities as drawn. */
  const tankLook = () => {
    const group = ((Tanks({ tanks: [tank] }) as El).props.children as El[])[0];
    const [skin, fuel] = group.props.children as El[];
    return [skin.props.material.opacity, fuel.props.material.opacity];
  };
  /** Fuel line pipe material, and whether its moving dots show while fuel flows. */
  const lineLook = () => {
    frame.cbs = [];
    const group = (
      (
        Flows({
          flows: [{ ...line, pts: line.pts.map((q) => [...q] as [number, number, number]) }],
          rates: () => ({ f: 1 }),
        }) as El
      ).props.children as El[]
    )[0];
    const [pipe, dots] = group.props.children as ReactElement<{ material: THREE.Material; object: THREE.Points }>[];
    frame.cbs.forEach((cb) => (cb as (s: unknown, dt: number) => void)({}, 0.02));
    return { pipe: pipe.props.material, dots: dots.props.object.visible };
  };
  const cableLook = () =>
    ((Links({ links: { c: cable }, points: () => ({}) }) as El).props.children as El[])[0].props.material;
  const fuel = () => sysColor("fuel", theme());

  it("dims them while an item is spotted", () => {
    walkView("fuel", { names: ["Tank drain", "Collector drain"], side: 1 });
    expect(tankLook()).toEqual([0.05, 0.12]);
    expect(lineLook()).toEqual({ pipe: mats(fuel()).dim, dots: false });
    expect(cableLook()).toBe(mats("#8C959C").dim);
  });

  it("draws them as before with no spot", () => {
    walkView("fuel", null);
    expect(tankLook()).toEqual([0.14, 0.62]);
    expect(lineLook()).toEqual({ pipe: mats(fuel()).on, dots: true });
    expect(cableLook()).toBe(mats("#8C959C").on);
  });
});

describe("with no spot, everything looks as it did before the walk-around", () => {
  /** Part material and activity as drawn before the walk-around existed (no spot). */
  function before(p: PartSpec, sys: SysId, cf: Chan | "all") {
    const color = p.color || sysColor(p.sys[0], theme());
    const all = sys === "overview";
    const chanDim = sys === "controls" && cf !== "all" && !p.chan?.includes(cf);
    const act = (all || p.sys.includes(sys)) && !chanDim;
    const ghost = !!p.fairing && act;
    const material = p.plate
      ? act
        ? plateMat.on
        : plateMat.dim
      : ghost
        ? all
          ? shellMat
          : ghostMat(sysColor(p.sys[0], theme()))
        : mats(color)[act ? "on" : "dim"];
    return { material, active: act };
  }
  const views: [SysId, Chan | "all"][] = [
    ["overview", "all"],
    ["gear", "all"],
    ["fuel", "all"],
    ["controls", "aileron"],
  ];
  for (const [sys, cf] of views)
    it(`every part in the ${sys} view${cf === "all" ? "" : ` (${cf} channel)`}`, () => {
      useView.setState({ ac: "sr22t", sys, spot: null, xray: true, labels: false, focus: null, ctrlFocus: cf });
      for (const p of CAT.parts) expect(drawPart(p), p.id).toEqual(before(p, sys, cf));
    });

  it("control surfaces and skins", () => {
    useView.setState({ ac: "sr22t", sys: "controls", spot: null, xray: true, ctrlFocus: "all" });
    const aileron = CAT.surfaces.find((s) => s.name === "Left aileron")!;
    expect(surface("Left aileron")).toBe(seeMat(sysColor(aileron.sys[0], theme())));
    useView.setState({ sys: "fuel" });
    expect(surface("Left aileron")).toBe(shellMat);
    for (const s of CAT.shells) expect((Shell({ spec: s }) as El).props.material, s.id).toBe(shellMat);
  });
});
