import { afterEach, describe, expect, it, vi } from "vitest";
import { CAT } from "../aircraft/sr22t/parts";
import { FLOWS, flowsFor } from "../aircraft/sr22t/flows";
import {
  allGroups,
  ENGINE_GROUPS,
  engineGroupsOf,
  engineHidden,
  isShown,
  parseGroups,
} from "../aircraft/sr22t/engine-groups";
import { useEngineGroups } from "../aircraft/sr22t/engine-group-store";
import { OXY_SCENARIOS, useSR22T } from "../aircraft/sr22t/store";
import { useView } from "../lib/view";
import type { SysId } from "../lib/systems";
import { TIT_PROBE } from "../aircraft/sr22t/turbo-layout";
import { checkEngineGroups } from "../aircraft/sr22t/engine-groups";
import { box } from "../lib/geometry";
import type { FlowSpec, PartSpec } from "../lib/catalogue";

const parts = CAT.parts.filter((spec) => spec.sys.includes("engine"));
const flows = FLOWS.filter((spec) => spec.sys.includes("engine"));
const items = [...parts, ...flows];
const mountedParts = () => [...new Set(CAT.parts.map((part) => part.parent))].flatMap((parent) => CAT.partsFor(parent));
const mountedFlows = () =>
  flowsFor(true).filter((flow) => !engineHidden(flow, useView.getState().sys, useEngineGroups.getState().shown));
const originalView = useView.getState();
const originalSim = useSR22T.getState();
const originalGroups = useEngineGroups.getState().shown;
afterEach(() => {
  useView.setState(originalView);
  useSR22T.setState(originalSim);
  useEngineGroups.setState({ shown: originalGroups });
  vi.restoreAllMocks();
});

// Grouping follows the operator's 2026-10-09 request, addenda and 16:37 rulings; systems POH 13772-007 §7-31–39.
describe("SR22T engine study groups (POH 7-31–39)", () => {
  it("covers every engine part and flow with valid, unique groups", () => {
    for (const spec of items) {
      const groups = engineGroupsOf(spec);
      expect(
        groups,
        "Tag new engine item with groups: " + ("key" in spec ? spec.key : spec.name || spec.id),
      ).toBeDefined();
      expect(new Set(groups).size).toBe(groups!.length);
      expect(groups!.every((group) => ENGINE_GROUPS.includes(group))).toBe(true);
    }
  });

  it("rejects an unknown groups tag at registration, naming the tag and the part or flow", () => {
    const count = CAT.parts.length;
    const typo = ["oill"] as unknown as PartSpec["groups"];
    expect(() => CAT.part(() => box(0.01, 0.01, 0.01), ["engine"], { name: "Typo part", groups: typo })).toThrow(
      /sr22t\/Typo part-\d+: unknown group "oill".*ignition, induction, exhaust, fuel, oil, sensors/,
    );
    expect(CAT.parts).toHaveLength(count);
    expect(() => checkEngineGroups("flow newEngineFlow", ["oil", "Sensors"])).toThrow(
      /flow newEngineFlow: unknown group "Sensors"/,
    );
    for (const groups of [undefined, [], ["oil"], [...ENGINE_GROUPS]])
      expect(() => checkEngineGroups("flow newEngineFlow", groups)).not.toThrow();
    // Compile-time half: a typo in a part or flow tag does not type-check.
    // @ts-expect-error "oill" is not an engine group
    const badPart: Partial<PartSpec> = { groups: ["oill"] };
    // @ts-expect-error "Sensors" is not an engine group (ids are lower case)
    const badFlow: Partial<FlowSpec> = { groups: ["Sensors"] };
    expect([badPart, badFlow]).toHaveLength(2);
  });

  it("reads a flow's own groups tag, whatever its key", () => {
    const flow = { ...flows[0], key: "newEngineFlow", sys: ["engine"] as SysId[] };
    expect(engineGroupsOf({ ...flow, groups: ["oil"] })).toEqual(["oil"]);
    expect(engineGroupsOf({ ...flow, groups: [] })).toEqual([]);
    expect(engineGroupsOf({ ...flow, groups: undefined })).toBeUndefined();
    expect(engineGroupsOf({ ...flows.find((spec) => spec.key === "turboOilL")!, groups: ["induction"] })).toEqual([
      "induction",
    ]);
  });

  it("defaults untagged engine items from an unambiguous system, and leaves the rest unmapped", () => {
    const part = { ...parts[0], name: "New engine part", groups: undefined, parent: undefined };
    const flow = { ...flows[0], key: "newEngineFlow", groups: undefined };
    for (const spec of [part, flow]) {
      expect(engineGroupsOf({ ...spec, sys: ["engine", "avionics"] })).toEqual(["sensors"]);
      expect(engineGroupsOf({ ...spec, sys: ["engine", "gear"] })).toEqual([]);
      expect(engineGroupsOf({ ...spec, sys: ["cabin", "engine"] })).toEqual([]);
      expect(engineGroupsOf({ ...spec, sys: ["engine", "avionics"], groups: ["oil"] })).toEqual(["oil"]);
      for (const sys of [
        ["engine"],
        ["engine", "fuel"],
        ["engine", "electrical"],
        ["engine", "avionics", "electrical"],
      ])
        expect(engineGroupsOf({ ...spec, sys: sys as SysId[] })).toBeUndefined();
      expect(engineGroupsOf({ ...spec, sys: ["avionics"] })).toBeUndefined();
    }
    expect(engineGroupsOf({ ...part, sys: ["engine"], parent: "cyl:1" })).toEqual([]);
    expect(engineGroupsOf({ ...part, sys: ["engine"], parent: "cyl:1", groups: ["fuel"] })).toEqual(["fuel"]);
  });

  it("records membership, single-group, multi-group and core counts (update when adding engine items)", () => {
    const counts = (list: typeof items) => ({
      total: list.length,
      core: list.filter((spec) => engineGroupsOf(spec)?.length === 0).length,
      multi: list.filter((spec) => (engineGroupsOf(spec)?.length ?? 0) > 1).length,
      member: ENGINE_GROUPS.map((group) => list.filter((spec) => engineGroupsOf(spec)?.includes(group)).length),
      single: ENGINE_GROUPS.map(
        (group) =>
          list.filter((spec) => engineGroupsOf(spec)?.length === 1 && engineGroupsOf(spec)![0] === group).length,
      ),
    });
    expect(counts(parts)).toEqual({
      total: 421,
      core: 149,
      multi: 6,
      member: [81, 92, 46, 12, 24, 23],
      single: [81, 86, 41, 11, 24, 23],
    });
    expect(counts(flows)).toEqual({
      total: 51,
      core: 0,
      multi: 0,
      member: [0, 16, 10, 19, 6, 0],
      single: [0, 16, 10, 19, 6, 0],
    });
  });

  it("has exactly the revised multi-group set and both sensor-only TIT probe locations", () => {
    expect(
      parts
        .filter((part) => engineGroupsOf(part)!.length > 1)
        .map((part) => part.name)
        .sort(),
    ).toEqual(
      [
        "LH turbocharger",
        "RH turbocharger",
        "Wastegate",
        "Wastegate actuator",
        "Wastegate controller",
        "Throttle body / fuel-metering valve",
      ].sort(),
    );
    expect(
      flows
        .filter((flow) => engineGroupsOf(flow)!.length > 1)
        .map((flow) => flow.key)
        .sort(),
    ).toEqual([]);
    for (const name of ["LH turbocharger", "RH turbocharger"])
      expect(engineGroupsOf(parts.find((part) => part.name === name)!)).toEqual(["induction", "exhaust"]);
    for (const side of [-1, 1]) {
      const probe = parts.find(
        (part) =>
          part.name === "TIT probe — " + (side < 0 ? "LH" : "RH") &&
          part.pos?.every((v, i) => v === TIT_PROBE(side)[i]),
      );
      expect(probe).toBeDefined();
      expect(engineGroupsOf(probe!)).toEqual(["sensors"]);
    }
  });

  it("Sensors off hides both TIT and all six EGT probes while Exhaust remains on (operator 16:37)", () => {
    useView.setState({ sys: "engine" });
    const probes = parts.filter((part) => /^(TIT probe — [LR]H|EGT probe)/.test(part.name ?? ""));
    expect(probes).toHaveLength(8);
    useEngineGroups.setState({ shown: allGroups() });
    for (const probe of probes) expect(mountedParts()).toContain(probe);
    useEngineGroups.getState().set("sensors", false);
    expect(useEngineGroups.getState().shown.exhaust).toBe(true);
    for (const probe of probes) {
      expect(engineGroupsOf(probe)).toEqual(["sensors"]);
      expect(engineHidden(probe, "engine", useEngineGroups.getState().shown)).toBe(true);
      expect(mountedParts()).not.toContain(probe);
      expect(CAT.pinned("engine")).not.toContain(probe);
    }
    expect(mountedParts().some((part) => part.name === "Tailpipe")).toBe(true);
  });

  it("Oil off hides every turbo oil line and oil assembly while Induction and Exhaust remain on (operator 16:37)", () => {
    useView.setState({ sys: "engine" });
    const keys = ["turboOilL", "turboOilR", "turboScavL", "turboScavR", "gateOil"];
    const lines = flows.filter((flow) => keys.includes(flow.key));
    const names = [
      "LH turbo oil reservoir",
      "RH turbo oil reservoir",
      "Turbo oil scavenge pump",
      "Turbo oil check valve",
      "Turbo oil tee",
    ];
    const oilParts = parts.filter((part) => names.includes(part.name ?? ""));
    expect(lines).toHaveLength(5);
    expect(oilParts).toHaveLength(5);
    useEngineGroups.setState({ shown: allGroups() });
    for (const line of lines) expect(mountedFlows()).toContain(line);
    for (const part of oilParts) expect(mountedParts()).toContain(part);
    useEngineGroups.getState().set("oil", false);
    expect(useEngineGroups.getState().shown.induction).toBe(true);
    expect(useEngineGroups.getState().shown.exhaust).toBe(true);
    for (const spec of [...lines, ...oilParts]) {
      expect(engineGroupsOf(spec)).toEqual(["oil"]);
      expect(engineHidden(spec, "engine", useEngineGroups.getState().shown)).toBe(true);
    }
    for (const line of lines) expect(mountedFlows()).not.toContain(line);
    for (const part of oilParts) {
      expect(mountedParts()).not.toContain(part);
      expect(CAT.pinned("engine")).not.toContain(part);
    }
    for (const name of ["LH turbocharger", "RH turbocharger"])
      expect(mountedParts().some((part) => part.name === name)).toBe(true);
  });

  it("keeps every multi-group item visible iff any membership is on, across all 64 toggle combinations", () => {
    useView.setState({ sys: "engine" });
    for (let mask = 0; mask < 64; mask++) {
      const shown = allGroups(false);
      ENGINE_GROUPS.forEach((group, index) => {
        shown[group] = !!(mask & (1 << index));
      });
      useEngineGroups.setState({ shown });
      const sceneParts = mountedParts();
      const sceneFlows = mountedFlows();
      for (const spec of items.filter((item) => engineGroupsOf(item)!.length > 1)) {
        const groups = engineGroupsOf(spec)!;
        const expected = groups.some((group) => shown[group]);
        expect(isShown(groups, shown)).toBe(expected);
        expect(engineHidden(spec, "engine", shown)).toBe(!expected);
        expect(("key" in spec ? sceneFlows : sceneParts).includes(spec as never)).toBe(expected);
      }
    }
  });

  it.each(ENGINE_GROUPS)("turning %s off alone removes exactly its single-group meshes, flows and pins", (group) => {
    useView.setState({ sys: "engine" });
    useEngineGroups.setState({ shown: allGroups() });
    const beforeParts = mountedParts(),
      beforePins = CAT.pinned("engine"),
      beforeFlows = mountedFlows();
    useEngineGroups.getState().set(group, false);
    const only = (spec: (typeof items)[number]) =>
      engineGroupsOf(spec)?.length === 1 && engineGroupsOf(spec)![0] === group;
    expect(mountedParts()).toEqual(beforeParts.filter((spec) => !only(spec)));
    expect(CAT.pinned("engine")).toEqual(beforePins.filter((spec) => !only(spec)));
    expect(mountedFlows()).toEqual(beforeFlows.filter((spec) => !only(spec)));
  });

  it.each(["fuel", "overview", "propeller"] as SysId[])("does not hide anything in %s", (sys) => {
    useView.setState({ sys });
    useEngineGroups.setState({ shown: allGroups() });
    const before = [mountedParts(), CAT.pinned("engine"), mountedFlows()];
    useEngineGroups.setState({ shown: allGroups(false) });
    expect([mountedParts(), CAT.pinned("engine"), mountedFlows()]).toEqual(before);
  });

  it("core and non-engine parts remain, and cached pin ids survive toggling", () => {
    useView.setState({ sys: "engine" });
    useEngineGroups.setState({ shown: allGroups() });
    const pins = CAT.pinned("engine");
    useEngineGroups.setState({ shown: allGroups(false) });
    const before = CAT.parts.filter((part) => !part.fitted || part.fitted());
    expect(new Set(mountedParts())).toEqual(
      new Set(before.filter((part) => !part.sys.includes("engine") || engineGroupsOf(part)?.length === 0)),
    );
    for (const name of ["Continental TSIO-550-K", "Cylinder 1", "Engine mount weldment", "Propeller blade"])
      expect(mountedParts().some((part) => part.name === name)).toBe(true);
    useEngineGroups.setState({ shown: allGroups() });
    expect(CAT.pinned("engine")).toEqual(pins);
  });

  it("oxygen scenarios reset simulation without resetting study groups", () => {
    useEngineGroups.getState().set("oil", false);
    const shown = useEngineGroups.getState().shown;
    for (const [, scenario] of OXY_SCENARIOS) {
      useSR22T.getState().update(scenario);
      expect(useEngineGroups.getState().shown).toBe(shown);
    }
  });

  it("all-on defaults preserve the complete mounted parts, flows and label ids", () => {
    useView.setState({ sys: "engine" });
    useEngineGroups.setState({ shown: parseGroups("") });
    expect(new Set(mountedParts())).toEqual(new Set(CAT.parts.filter((part) => !part.fitted || part.fitted())));
    expect(mountedFlows()).toEqual(flowsFor(true));
    for (const part of CAT.pinned("engine"))
      expect(CAT.isPinned(part, "engine")).toBe(!part.pinIn || part.pinIn.includes("engine"));
  });

  it("a viewing toggle clears stale hover without changing the simulation or camera", () => {
    const simulation = useSR22T.getState();
    const camera = useView.getState().cam;
    useView.setState({ hover: { name: "Oil sump", note: "", color: "", x: 0, y: 0 } });
    useEngineGroups.getState().set("oil", false);
    expect(useView.getState().hover).toBeNull();
    expect(useView.getState().cam).toBe(camera);
    expect(useSR22T.getState()).toBe(simulation);
  });
});

describe("engine groups URL", () => {
  it("defaults to all on and accepts only enabled groups, none and duplicates", () => {
    expect(parseGroups("")).toEqual(allGroups());
    expect(parseGroups("?groups=induction,oil")).toEqual({ ...allGroups(false), induction: true, oil: true });
    expect(parseGroups("groups=none")).toEqual(allGroups(false));
    expect(parseGroups("groups=oil,oil")).toEqual({ ...allGroups(false), oil: true });
  });
  it.each(["air", "-oil", "", "foo", "oil,foo", "none,oil", "oil,"])(
    "rejects %s as a whole, with one warning",
    (token) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(parseGroups("groups=" + token)).toEqual(allGroups());
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain("Invalid engine group");
    },
  );
});
