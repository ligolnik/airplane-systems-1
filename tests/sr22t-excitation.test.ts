/** SR22T POH 13772-007 7-47, 7-49–7-53: startup field sources, isolation and self-excitation. */
import { describe, expect, it } from "vitest";
import { initialSim, solve, type Sim } from "@/aircraft/sr22t/model";
import { patched, type Patch } from "./helpers";

const unexcited = (patch: Patch<Sim>) =>
  patched(initialSim, { ...patch, elec: { ...patch.elec, alt1: false, alt2: false } });

describe("SR22T alternator excitation transitions (POH 7-47, 7-53)", () => {
  const unavailable: [string, Patch<Sim>][] = [
    ["BAT 1 dead with its switch still on", { elec: { bat1: true, bat2: false, fail: { bat1: true } } }],
    ["BAT 2 breaker pulled", { elec: { bat1: false }, cb: { "BAT 2": true } }],
    ["BAT 2 depleted", { elec: { bat1: false, tBat: 31 } }],
    ["BAT 2 isolated from ESS BUS 2", { elec: { bat1: false }, cb: { "ESSENTIAL POWER": true } }],
  ];

  it.each(unavailable)("cannot restart either alternator with %s", (_, patch) => {
    const s = unexcited(patch);
    let E = solve(s);
    expect(E.mdb1).toBe(0);
    expect(E.edb).toBe(0);
    s.elec.alt1 = s.elec.alt2 = true;
    // Repeat to ensure an unsuccessful restart cannot create its own source on the next store update.
    for (let n = 0; n < 3; n++) {
      E = solve(s, E);
      expect(E.alt1).toBe(false);
      expect(E.alt2).toBe(false);
      expect(E.mdb1).toBe(0);
      expect(E.mdb2).toBe(0);
      if (s.elec.tBat >= 30) expect(E.bat2Dead).toBe(true);
    }
  });

  it.each(["BAT 2", "ESSENTIAL POWER"])("restoring %s lets a charged BAT 2 start only ALT 2", (breaker) => {
    const s = unexcited({ elec: { bat1: false }, cb: { [breaker]: true } });
    let E = solve(s);
    s.elec.alt1 = s.elec.alt2 = true;
    E = solve(s, E);
    expect(E.alt2).toBe(false);
    delete s.cb[breaker];
    E = solve(s, E);
    expect(E.alt1).toBe(false); // the MDB interconnect diode blocks ALT 2 → MDB 1
    expect(E.alt2).toBe(true);
    expect(E.mdb1).toBe(0);
    expect(E.mdb2).toBe(28.75);
  });

  it("a restored BAT 1 starts both alternators even with ESSENTIAL POWER pulled", () => {
    const s = unexcited({ elec: { fail: { bat1: true }, tBat: 31 }, cb: { "ESSENTIAL POWER": true } });
    let E = solve(s);
    s.elec.alt1 = s.elec.alt2 = true;
    E = solve(s, E);
    expect(E.alt1 || E.alt2).toBe(false);
    s.elec.fail.bat1 = false;
    E = solve(s, E);
    expect(E.alt1 && E.alt2).toBe(true);
  });

  it("keeps an already-excited alternator online after battery loss, but cannot restart it after OFF", () => {
    const s = patched(initialSim, { elec: { bat2: false } });
    let E = solve(s);
    s.elec.fail.bat1 = true;
    E = solve(s, E);
    expect(E.alt1 && E.alt2).toBe(true);
    s.elec.alt1 = s.elec.alt2 = false;
    E = solve(s, E);
    expect(E.alt1 || E.alt2).toBe(false);
    s.elec.alt1 = s.elec.alt2 = true;
    E = solve(s, E);
    expect(E.alt1 || E.alt2).toBe(false);
  });

  it("ALT 1 already online supplies ALT 2's field without battery power", () => {
    const s = patched(initialSim, { elec: { bat2: false, alt2: false } });
    let E = solve(s);
    s.elec.fail.bat1 = true;
    s.cb["ESSENTIAL POWER"] = true;
    E = solve(s, E);
    expect(E.alt1).toBe(true);
    s.elec.alt2 = true;
    E = solve(s, E);
    expect(E.alt2).toBe(true);
  });

  it("keeps ALT 2 online when BAT 2's sole-source timeline exceeds 30 min after startup", () => {
    const s = patched(initialSim, { elec: { bat1: false, alt1: false, tBat: 29 } });
    let E = solve(s);
    expect(E.alt2).toBe(true);
    s.elec.tBat = 31;
    E = solve(s, E);
    expect(E.alt2).toBe(true);
    expect(E.bat2Dead).toBe(false);
  });

  it.each(["engine stop", "field breaker", "alternator failure"])("%s clears self-excitation", (cause) => {
    const s = patched(initialSim, { elec: { bat2: false, alt1: false } });
    let E = solve(s);
    expect(E.alt2).toBe(true);
    s.elec.fail.bat1 = true;
    if (cause === "engine stop") s.eng.running = false;
    else if (cause === "field breaker") s.cb["ALT 2"] = true;
    else s.elec.fail.alt2 = true;
    E = solve(s, E);
    expect(E.alt2).toBe(false);
    s.eng.running = true;
    s.cb = {};
    s.elec.fail.alt2 = false;
    expect(solve(s, E).alt2).toBe(false);
  });
});
