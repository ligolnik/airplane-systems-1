/**
 * Simulation model: discrete state, the electrical solver and derived logic.
 * Everything here is pure so it can run in the store, in useFrame, or in tests.
 */
import type { CasLevel } from "../types";
import { D2R } from "@/lib/math";

/** Flap detent angles: SR22T POH 13772-007 7-22; AMM 6-00 (PDF p. 117). */
export const FLAP_DEG: Record<0 | 50 | 100, number> = { 0: 0, 50: 16, 100: 35.5 };

/** Position indication follows completed powered travel to the selected detent (POH 7-23). */
export const flapPositionLit = (cmd: 0 | 50 | 100, angle: number, powered: boolean): boolean =>
  powered && angle === FLAP_DEG[cmd];

export type Key = "OFF" | "R" | "L" | "BOTH" | "START";
export type FuelPump = "OFF" | "BOOST" | "HIGH";
export type FuelSel = "L" | "R" | "OFF";
export type Vent = "P" | "PF" | "PFW" | "W";
export type CabinSwitch = "OFF" | "ON" | "AUTO";
/** Optional equipment fitted. `fiki`: TKS ice protection approved for flight into known icing (POH 7-13, 8-21). */
export interface Equip {
  fiki: boolean;
}

export interface Sim {
  /** none: normal; coldOil: first-flight high oil pressure (POH 4-17, 3-29); leak: induction coupling (3-27); gateClosed:
   * seized gate (3-30); highTit: a turbocharger exceeds the TIT limit (2-9, 3-30). */
  turbo: { fail: "none" | "coldOil" | "leak" | "gateClosed" | "highTit" };
  /** Pressure altitude for altitude-dependent logic (HIGH BOOST/PRIME lockout, oxygen CAS, PFD speed limits); shown on the PFD. */
  paFt: number;
  /**
   * filterBlocked: induction filter blockage (ice or debris), a failure; the alternate air door opens on its own (POH 7-37).
   * govFail: propeller governor failure, a failure (POH 3-33). rpmWarn: the RPM warning is active, set by tick.ts from the
   * live.rpmHi timers (see rpmWarning).
   */
  eng: {
    running: boolean;
    key: Key;
    lever: number;
    mix: number;
    filterBlocked: boolean;
    govFail: boolean;
    rpmWarn: boolean;
  };
  elec: {
    bat1: boolean;
    bat2: boolean;
    alt1: boolean;
    alt2: boolean;
    avionics: boolean;
    fail: { alt1: boolean; alt2: boolean; bat1: boolean };
    tBat: number;
  };
  /** Pulled circuit breakers keyed by breaker label. */
  cb: Record<string, boolean>;
  fuel: { sel: FuelSel; pump: FuelPump; qL: number; qR: number };
  flaps: { cmd: 0 | 50 | 100 };
  ctrl: { pitch: number; roll: number; yaw: number };
  gear: {
    diff: number;
    park: boolean;
    /** Normalized trapped pressure, POH 7-26; not psi. */ held: { L: number; R: number };
  };
  /** fan: -1 OFF, 0 ram air, 1–3 blower */
  env: { fan: number; temp: number; vent: Vent; ac: boolean; recirc: boolean };
  pitot: { heat: boolean; oat: number; heaterFail: boolean; alt: boolean };
  stall: { aoa: number; fault: boolean; heaterFail: boolean; onGround: boolean };
  /** Cabin switch + door state, and the bolster exterior light switches. */
  lights: {
    cabin: CabinSwitch;
    door: boolean;
    unlocked: boolean;
    bag: boolean;
    nav: boolean;
    strobe: boolean;
    land: boolean;
    ice: boolean;
  };
  /**
   * fail: an ADAHRS or magnetometer failure, each unit separately (POH 3-43; dual ADAHRS and MAG 2 installed per operator,
   * 2026-10-08).
   */
  avx: {
    backup: boolean;
    pfdFail: boolean;
    fail: { adahrs1: boolean; adahrs2: boolean; mag1: boolean; mag2: boolean };
  };
  /** CAPS deployment active (time itself lives in `live`). */
  capsOn: boolean;
  ice: {
    on: boolean;
    mode: "NORM" | "HIGH";
    maxT: number;
    ws: number;
    bkup: boolean;
    sel: "AUTO" | "L" | "R";
    qL: number;
    qR: number;
  };
  equip: Equip;
  /**
   * Precise Flight Built-In Oxygen System (STC SA01708SE; AMM 35-00): `on` is the control-panel switch, `psi` the bottle
   * pressure (0–2000, set only from the panel: duration data is in the Oxygen AFMS, so flow never depletes it),
   * `above12k5Min` minutes spent continuously above 12,500 ft, `flowFault` a failed tank solenoid or low flow (POH 3-41).
   */
  oxy: { on: boolean; psi: number; above12k5Min: number; flowFault: boolean };
  /** Door positions and the exterior baggage key lock (POH 7-31, 7-26). Actions also write the lighting inputs. */
  doors: {
    L: "latched" | "unlatched" | "open";
    R: "latched" | "unlatched" | "open";
    bag: "closed" | "open";
    bagLocked: boolean;
  };
}

/** Usable TKS fluid per wing tank, US gal (AMM 30-00, PDF 1166; AMM 12-10 Table 12-10-1, PDF 269). */
export const TKS_USABLE = 4;

export const initialSim: Sim = {
  // Default cruise altitude: POH 13772-007 5-32, the 4,000-ft point used by avionics.
  paFt: 4000,
  turbo: { fail: "none" },
  eng: { running: true, key: "BOTH", lever: 0.72, mix: 0.85, filterBlocked: false, govFail: false, rpmWarn: false },
  elec: {
    bat1: true,
    bat2: true,
    alt1: true,
    alt2: true,
    avionics: true,
    fail: { alt1: false, alt2: false, bat1: false },
    tBat: 0,
  },
  cb: {},
  fuel: { sel: "L", pump: "OFF", qL: 24, qR: 22 },
  flaps: { cmd: 0 },
  ctrl: { pitch: 0, roll: 0, yaw: 0 },
  gear: { diff: 0, park: false, held: { L: 0, R: 0 } },
  env: { fan: 1, temp: 0.35, vent: "PF", ac: false, recirc: false },
  pitot: { heat: true, oat: 8, heaterFail: false, alt: false },
  stall: { aoa: 6, fault: false, heaterFail: false, onGround: false },
  lights: { cabin: "AUTO", door: false, unlocked: false, bag: false, nav: true, strobe: true, land: false, ice: false },
  avx: { backup: false, pfdFail: false, fail: { adahrs1: false, adahrs2: false, mag1: false, mag2: false } },
  capsOn: false,
  // the modelled airplane has FIKI (operator decision, 2026-10-07)
  equip: { fiki: true },
  ice: { on: false, mode: "NORM", maxT: 0, ws: 0, bkup: false, sel: "AUTO", qL: TKS_USABLE, qR: TKS_USABLE },
  // bottle charged to 1800 psig (AMM 35-00)
  oxy: { on: false, psi: 1800, above12k5Min: 0, flowFault: false },
  doors: { L: "latched", R: "latched", bag: "closed", bagLocked: false },
};

/** Bolster exterior light switches `?lights=` can turn on (POH 7-57). */
const START_LIGHTS = ["nav", "strobe", "land", "ice"] as const;

/**
 * Starting state for the page's query string, so `npm run shot -- … --query …` can capture these states without a local
 * patch: `fiki=0` starts the non-FIKI SR22T (anything else keeps FIKI installed); `lights=land,ice` also turns on the named
 * exterior light switches (nav, strobe, land, ice; unknown names are ignored); `iceprotect=on` starts with the ICE
 * PROTECT power switch on, FIKI airplanes only.
 */
export const initialSimFor = (search: string): Sim => {
  const q = new URLSearchParams(search);
  const fiki = q.get("fiki") !== "0";
  const on = new Set(q.get("lights")?.split(","));
  return {
    ...initialSim,
    equip: { fiki },
    lights: {
      ...initialSim.lights,
      ...Object.fromEntries(START_LIGHTS.filter((l) => on.has(l)).map((l) => [l, true])),
    },
    ice: { ...initialSim.ice, on: fiki && q.get("iceprotect") === "on" },
  };
};

/** Fast-changing values advanced every frame; kept out of React state on purpose. */
export const live = {
  /** Door animation fractions; discrete commands stay in Sim (70° display approximation). */
  doors: { L: 0, R: 0, bag: 0 },
  rpm: 2500,
  flapAng: 0,
  capsT: -1,
  capsPlaying: false,
  startTimer: 0,
  crankT: 0,
  starve: 0,
  /** Seconds the RPM has stayed above 2,560 and above 2,580 (reset when it drops below), for rpmWarning. */
  rpmHi: { t2560: 0, t2580: 0 },
  /** Powered lift-transducer ground-operation seconds; procedural limit, not an automatic cutoff. */
  liftHeatGroundSec: 0,
  icePhase: 0,
  /** Seconds MAX and WINDSHLD have run since they were armed; the store holds only the armed durations. */
  iceMaxRun: 0,
  iceWsRun: 0,
  /** Minutes above 12,500 ft, counted every frame; the store gets it at each whole minute and on passing 30 min. */
  above12k5Min: 0,
  /** The `Sim.oxy.above12k5Min` value the tick last wrote; any other store value came from a slider or scenario. */
  above12k5Written: 0,
};

export type BusId =
  "mdb1" | "mdb2" | "edb" | "ess1" | "ess2" | "main1" | "main2" | "main3" | "nonEss" | "ac1" | "ac2" | "avx" | "conv";

export interface Elec extends Record<BusId, number> {
  alt1: boolean;
  alt2: boolean;
  bat1ok: boolean;
  bat2ok: boolean;
  bat1Dead: boolean;
  bat2Dead: boolean;
  bat1Charging: boolean;
  bat2Charging: boolean;
  bat2Supplying: boolean;
  a1: number;
  a2: number;
  b1: number;
  pfd: boolean;
  mfd: boolean;
  stby: boolean;
  /** ADAHRS 1: 5 A ADAHRS 1 on ESS BUS 1; ADAHRS 2: 5 A ADAHRS 2 on MAIN BUS 2 (POH 7-75); each powered and not failed. */
  adahrs1: boolean;
  adahrs2: boolean;
  /** GMU 44 MAG 1 through 5 A PFD A on ESS BUS 1, MAG 2 through 5 A PFD B on MAIN BUS 2 (AMM 34-20 PDF p. 1675). */
  mag1: boolean;
  mag2: boolean;
  flapsPwr: boolean;
  pitotPwr: boolean;
  stallPwr: boolean;
  /** STALL VANE HEAT feed: POH 13772-007 Fig 7-11 (7-52); AMM 13773-002 Rev 7, 27-31 ¶B(2)(e), PDF p. 1038. */
  liftHeatPwr: boolean;
  boostPwr: boolean;
  starterPwr: boolean;
  pitchTrim: boolean;
  rollTrim: boolean;
  navPwr: boolean;
  strobePwr: boolean;
  /** Lower-cowl HID landing light: Main Dist Bus 1 through the MCU relay and 7.5 A fuse, no CB-panel breaker (POH 7-57). */
  landPwr: boolean;
  /** Wingtip recognition lights: 15 A LANDING LIGHTS breaker on MAIN BUS 3 (POH 7-57). */
  recogPwr: boolean;
  icePwr: boolean;
  ipsPwr: boolean;
  eisPwr: boolean;
  convPwr: boolean;
  /** Display cooling fans: AVIONICS FAN 1 cools the MFD, AVIONICS FAN 2 the PFD (POH 3A-17). */
  fan1: boolean;
  fan2: boolean;
  /** Oxygen control panel and quantity display: 5 A CABIN LIGHTS / OXYGEN on MAIN BUS 1 (POH 7-52; AMM 35-00). */
  oxyPwr: boolean;
  /** A/C compressor feed: 5 A A/C COMPR on A/C BUS 2 (POH 7-61; AMM 21-50 PDF p. 496). */
  acComprPwr: boolean;
  /** Condenser blower feed: 15 A A/C COND on A/C BUS 1 (POH 13772-007 7-61). */
  acCondPwr: boolean;
  /** Last powered ECS selections (7waz N2 and A/C latch lead rulings; POH silent on power loss). */
  envHeld: Sim["env"];
}

/**
 * Breaker feeding the ice inspection lights: ICE PROTECT 1 (MAIN BUS 1) with ice protection, the 5 A ICE LIGHTS breaker
 * (MAIN BUS 1) without (AMM 30-80, 33-40).
 */
export const iceLightBreaker = (equip: Equip) => (equip.fiki ? "ICE PROTECT 1" : "ICE LIGHTS");

/**
 * Electrical solver (SR22T POH 13772-007 7-47 – 7-54, Figure 7-10 on 7-48).
 * Diode-ORed distribution buses in the MCU; CB-panel buses hang off them. Pulled breakers
 * remove individual loads. BAT 2 alone powers the PFD for approximately 30 min (POH 3-17).
 * BAT 1 has no published endurance and does not run down on a timer. Battery voltages
 * and the 0.7 V diode drop are illustrative, not POH performance predictions.
 */
export function solve(s: Sim, prev?: Elec): Elec {
  const e = s.elec,
    run = s.eng.running,
    t = e.tBat;
  const cb = (name: string) => !s.cb[name];
  const bat1Dead = e.fail.bat1;
  const bat1ok = e.bat1 && !bat1Dead;
  const enabled1 = run && e.alt1 && !e.fail.alt1 && cb("ALT 1"),
    enabled2 = run && e.alt2 && !e.fail.alt2 && cb("ALT 2");
  // Self-exciting, not self-starting (POH 7-47). An online alternator feeds its own regulator; stopping the engine,
  // opening its field breaker or switching it off clears that state (7-53). Without a previous solution, require a
  // live startup source. ALT 2 cannot back-feed ALT 1's A/C BUS 1 supply (7-49).
  const held1 = enabled1 && prev?.alt1 === true,
    held2 = enabled2 && prev?.alt2 === true;
  // Establish BAT 2 availability BEFORE new excitation: otherwise assuming ALT 2 output first conceals depletion.
  // The timeline represents time with BAT 2 as the sole source (POH 3-17); existing generation or BAT 1 backs it up.
  const bat2Dead = !held1 && !held2 && !bat1ok && t >= 30;
  const bat2ok = e.bat2 && !bat2Dead && cb("BAT 2");
  const essPwr = cb("ESSENTIAL POWER");
  const alt1 = enabled1 && (held1 || bat1ok); // field supply: A/C BUS 1, fed by MDB 1 (POH 7-49, 7-53)
  // ALT 2's field supply is ESS BUS 2. BAT 2 reaches it through BAT 2 and ESSENTIAL POWER; BAT 1 / ALT 1 reach the
  // Essential Distribution Bus directly, without ESSENTIAL POWER (POH Fig 7-10, 7-50, 7-53).
  const alt2 = enabled2 && (held2 || bat1ok || alt1 || (bat2ok && essPwr));
  const D = 0.7; // diode drop
  const mdb1 = Math.max(alt1 ? 28 : 0, bat1ok ? 24.3 : 0);
  const mdb2 = Math.max(alt2 ? 28.75 : 0, mdb1 ? mdb1 - D : 0); // MDB1 → MDB2 only
  // Ess Dist Bus: diode-fed from MDB 1, from BAT 1 ahead of its 125 A fuse (the same voltage as MDB 1 here) and from MDB 2.
  // ESS BUS 2 hangs straight off it; ESS BUS 1 through the ESSENTIAL POWER breaker, and BAT 2 joins ESS BUS 1 through the
  // BAT 2 breaker, so with the alternators and BAT 1 gone BAT 2 feeds the Ess Dist Bus and ESS BUS 2 back through
  // ESSENTIAL POWER (POH 7-50, Fig 7-10 on 7-48)
  const bat2v = bat2ok ? 24.2 : 0;
  const edbIn = Math.max(mdb1, mdb2) ? Math.max(mdb1, mdb2) - D : 0;
  const edb = Math.max(edbIn, essPwr ? bat2v : 0);
  const ess1 = Math.max(essPwr ? edb : 0, bat2v),
    ess2 = edb;
  const r = (v: number) => Math.round(v * 100) / 100;
  const buses: Record<BusId, number> = {
    mdb1: r(mdb1),
    mdb2: r(mdb2),
    edb: r(edb),
    ess1: r(ess1),
    ess2: r(ess2),
    main1: r(mdb2),
    main2: r(mdb2),
    nonEss: r(mdb2),
    main3: r(mdb1),
    ac1: r(mdb1),
    ac2: r(mdb1),
    avx: e.avionics && mdb2 && cb("AVIONICS") ? r(mdb2) : 0,
    conv: bat1Dead ? 0 : 24.4,
  };
  const pw = (bus: BusId, name: string) => buses[bus] > 0 && cb(name);
  return {
    ...buses,
    envHeld: pw("main1", "CABIN AIR CONTROL") ? { ...s.env } : { ...(prev?.envHeld ?? s.env) },
    alt1,
    alt2,
    bat1ok,
    bat2ok,
    bat1Dead,
    bat2Dead,
    bat1Charging: bat1ok && mdb1 > 26,
    // BAT 2 is charged from ESS BUS 1 (POH 7-47)
    bat2Charging: bat2ok && ess1 > 26,
    bat2Supplying: bat2ok && ess1 < 26,
    // Illustrative currents; no SR22T operating-current prediction is published.
    a1: alt1 ? (alt2 ? 23 : 36) : 0,
    a2: alt2 ? (alt1 ? 13 : 22) : 0,
    b1: !bat1ok ? 0 : alt1 ? 1 : alt2 ? -14 : -36,
    pfd: !s.avx.pfdFail && (pw("ess1", "PFD A") || pw("main2", "PFD B")),
    mfd: pw("main3", "MFD A") || pw("main1", "MFD B"),
    stby: pw("ess1", "STDBY ATTD A") || pw("main1", "STDBY ATTD B"),
    adahrs1: !s.avx.fail.adahrs1 && pw("ess1", "ADAHRS 1"),
    adahrs2: !s.avx.fail.adahrs2 && pw("main2", "ADAHRS 2"),
    mag1: !s.avx.fail.mag1 && pw("ess1", "PFD A"),
    mag2: !s.avx.fail.mag2 && pw("main2", "PFD B"),
    flapsPwr: pw("nonEss", "FLAPS"),
    pitotPwr: pw("nonEss", "PITOT HEAT"),
    stallPwr: pw("ess2", "STALL WARNING"),
    liftHeatPwr: s.equip.fiki && pw("nonEss", "STALL VANE HEAT"),
    boostPwr: pw("main2", "FUEL PUMP"),
    starterPwr: pw("nonEss", "STARTER") && bat1ok,
    pitchTrim: pw("ess2", "PITCH TRIM"),
    rollTrim: pw("ess2", "ROLL TRIM"),
    navPwr: pw("nonEss", "NAV LIGHTS"),
    strobePwr: pw("nonEss", "STROBE LIGHTS"),
    // HID landing light: LAND energizes a relay in the MCU, 28 VDC from Main Dist Bus 1 behind a 7.5 A fuse (POH 7-57,
    // Fig 7-10); recognition lights: LANDING LIGHTS on MAIN BUS 3 (POH 7-57); ice lights on MAIN BUS 1 (Figs 7-10, 7-11)
    landPwr: buses.mdb1 > 0,
    recogPwr: pw("main3", "LANDING LIGHTS"),
    // Both documented IPS feeds are required here, on the buses the breaker table gives them; individual pump fault
    // behavior awaits the supplement.
    ipsPwr:
      s.equip.fiki &&
      ["ICE PROTECT 1", "ICE PROTECT 2"].every((n) => {
        const bus = breakerBus(s.equip, n);
        return !!bus && pw(bus, n);
      }),
    icePwr: pw("main1", iceLightBreaker(s.equip)),
    eisPwr: pw("ess2", "ENGINE INSTR"),
    convPwr: buses.conv > 0 && cb("CONV LIGHTS"),
    fan1: pw("nonEss", "AVIONICS FAN 1"),
    fan2: pw("main2", "AVIONICS FAN 2"),
    oxyPwr: pw("main1", "CABIN LIGHTS / OXYGEN"),
    acComprPwr: pw("ac2", "A/C COMPR"),
    acCondPwr: pw("ac1", "A/C COND"),
  };
}

/** HIGH BOOST/PRIME lockout for software 2647.M4 or later (POH 13772-007 7-41).
 * POH text governs the different boundaries in Fig 7-8 and AMM 28-00 / 73-20.
 */
export function pumpSpeed(s: Sim, E: Elec, rpm: number, map: number, paFt: number): "off" | "low" | "high" {
  if (!E.boostPwr || s.fuel.pump === "OFF") return "off";
  if (s.fuel.pump === "BOOST") return "low";
  return rpm < 500 || (map >= 24 && paFt >= 10000) ? "high" : "low";
}

export const fuelAvail = (s: Sim) => s.fuel.sel !== "OFF" && (s.fuel.sel === "L" ? s.fuel.qL : s.fuel.qR) > 0.05;
/**
 * The alternate air door: held shut by a magnet, sucked open by the running engine when the induction air is blocked, and
 * then a switch raises ALT AIR OPEN (POH 7-37, 3A-11). There is no pilot control.
 */
export const altAirOpen = (s: Sim) => s.eng.running && s.eng.filterBlocked;
/** Full-power manifold pressure: power lever full forward, 2,500 RPM, 36.0 in.Hg (POH 4-17). */
export const MAP_FULL = 36.0;
/** Manifold pressure red line, 37.5 in.Hg (POH 2-9): the MAN PRESSURE warning boundary. */
export const MAP_RED_LINE = 37.5;
/** Illustrative display ceiling, not a valve setting: with the wastegate seized closed, MAP rises to the 37.5 in.Hg red
 * line; the overboost relief valve may lift (its setting is not published consistently: AMM 81-20 gives 35, POH 4-17
 * normal is 36.0). */
export const SEIZED_GATE_MAP_CEILING = MAP_RED_LINE;
/** Illustrative ISA ambient pressure for the fixed 4,500 ft picture (POH 3-27 analogy).
 * No critical-altitude curve is documented. */
export const TURBO_AMBIENT_INHG = 25.4;
/** Illustrative lever curve: 11.5 idle, normal full power 36.0 (POH 4-17),
 * cold oil 37.0 (POH 4-17), illustrative seized-gate demand 42 held at the display ceiling above.
 * Stopped-engine 29.9 is illustrative; alternate air remains a power loss in displays.ts. */
export function mapInHg(s: Sim, rpm: number): number {
  if (!s.eng.running || rpm < 200) return 29.9;
  const full = s.turbo.fail === "coldOil" ? 37 : s.turbo.fail === "gateClosed" ? 42 : MAP_FULL;
  const map = 11.5 + s.eng.lever * (full - 11.5);
  const cap =
    s.turbo.fail === "leak" ? TURBO_AMBIENT_INHG : s.turbo.fail === "gateClosed" ? SEIZED_GATE_MAP_CEILING : full;
  return +Math.min(map, cap).toFixed(1);
}
/** Illustrative controller/valve position, not calibrated: opens as throttle comes back
 * (differential-pressure controller, POH 7-39; AMM 81-20 PDF p. 2812).
 * A leak commands boost recovery, modelled as closed rather than interpreting lost MAP
 * as throttle reduction (POH 3-27). A seized gate stays closed (3-30). With the engine stopped there is no oil
 * pressure on the actuator piston, so its spring holds the gate fully open: Teledyne Continental Motors Overhaul Manual excerpt, section 81-20 "Hydraulic Wastegate", page 81-04 (NTSB docket, document ID 40265210).
 * The Cirrus documents give no rest position; the excerpt's manual covers the TSIO-520 series (Form X30574A). */
export function wastegateOpen(s: Sim): number {
  if (s.turbo.fail === "gateClosed") return 0;
  if (!s.eng.running) return 1;
  if (s.turbo.fail === "leak") return 0;
  return Math.max(0, Math.min(1, 1 - s.eng.lever));
}
/** Panel readout for the wastegate, percent open. */
export const wastegateReading = (s: Sim) => Math.round(wastegateOpen(s) * 100) + "%";
/** TIT state, qualitative: "high" when the High TIT condition drives a turbocharger past the 1750 °F limit (POH 2-9,
 * 3-30); otherwise "normal", inside the green 1000–1750 °F band (2-9), illustrative, with no mixture or power mapping.
 * "off" with the engine stopped. Both turbochargers read the same. */
export const titState = (s: Sim): "off" | "normal" | "high" =>
  !s.eng.running ? "off" : s.turbo.fail === "highTit" ? "high" : "normal";
/** With the wastegate seized closed, MAP rises to the 37.5 in.Hg red line; the overboost relief valve may lift (its
 * setting is not published consistently: AMM 81-20 gives 35, POH 4-17 normal is 36.0). Qualitative (POH 3-30), with
 * no pressure threshold. */
export const overboostMayLift = (s: Sim) => s.eng.running && s.turbo.fail === "gateClosed";
/** Governed RPM: the governor is factory-set to 2,500 RPM, with no propeller control or cable (POH 7-32, 7-39; AMM 61-20). */
export const GOV_RPM = 2500;
/** Low-pitch (fine) blade angle, illustrative: where the blades go without governor oil pressure (POH 7-39, 3-33). */
const FINE_PITCH = 14;
/**
 * RPM the engine settles toward. Below the governing range the blades sit on the low-pitch stop and RPM follows the power
 * lever: an illustrative ramp from 700 RPM at IDLE to 2,450 at lever 0.14. From lever 0.14 to MAX the governor holds 2,500;
 * there is no propeller control (POH 7-32; AMM 61-00). With a failed governor the propeller is fixed
 * at fine pitch and RPM rises with power to 3,000 at MAX, the lower bound of POH 3-33's "3000 RPM or more" (illustrative).
 * A single magneto costs 60 RPM (illustrative, inside POH 4-15's 150 RPM drop limit); the starter cranks at 260.
 */
export function rpmTarget(s: Sim, starterPwr: boolean): number {
  const g = s.eng;
  if (!g.running) return g.key === "START" && starterPwr ? 260 : 0;
  const L = g.lever;
  const rpm = L < 0.14 ? 700 + (L / 0.14) * 1750 : g.govFail ? 2450 + ((L - 0.14) / 0.86) * 550 : GOV_RPM;
  return g.key === "L" || g.key === "R" ? rpm - 60 : rpm;
}
/** RPM warning: engine speed above 2,560 RPM for ten seconds, or above 2,580 RPM for five seconds (AMM 77-10). */
export const rpmWarning = (secAbove2560: number, secAbove2580: number) => secAbove2560 > 10 || secAbove2580 > 5;
/**
 * RPM warning procedure, in the POH's order (POH 3-32): the first reduction tells a failed governor (RPM follows power) from
 * one that is governing too fast. The Propeller panel lists these steps.
 */
export const RPM_WARNING_STEPS = [
  "Reduce the power lever by 2 in.Hg manifold pressure (POH 3-32).",
  "RPM reduces and stays lower: the governor is not in control — perform the Propeller Governor Failure checklist (POH 3-32).",
  "RPM stays high but stable: the governor is in control — reduce below 34 in.Hg for climb, below 30.5 in.Hg for cruise (POH 3-32).",
  "Then, governed speed above 2,600 RPM: perform the Propeller Governor Failure checklist; governed 2,600 RPM or less: continue the flight (POH 3-32).",
];
/** Blade angle, illustrative: coarsens with power while the governor holds RPM; fine pitch once it has failed. */
export const bladeAngle = (s: Sim) => (s.eng.govFail ? FINE_PITCH : FINE_PITCH + s.eng.lever * 20);
/**
 * Display blade pitch, radians: the blade groups' y-rotation in Airplane.tsx, which the hub-mounted boot feed tubes cancel
 * (parts/ice.ts). The 0.6 display factor is illustrative, not a POH/AMM value.
 */
export const bladeDisplayPitch = (s: Sim) => bladeAngle(s) * D2R * 0.6;

/** Oxygen pressure altitude boundaries for the CAS (POH 3-42, 3A-24, 3A-25). */
export const OXY_FT = { rqdCaution: 12500, rqdWarning: 14000 } as const;
/** OXYGEN RQD caution: above 12,500 ft for greater than this many minutes (POH 3A-24). */
export const OXY_RQD_MIN = 30;
/**
 * Oxygen quantity readout, psi: setting the switch ON lights the quantity display (AMM 35-00), which runs on 28 V through
 * CABIN LIGHTS / OXYGEN; null when it is dark.
 */
export const oxyDisplay = (s: Sim, E: Elec): number | null => (s.oxy.on && E.oxyPwr ? s.oxy.psi : null);

/** AFMS 102NMAN0001 Rev F §1 pp. 8–9, Fig 2 p. 10. Single-band ladder is illustrative: the AFMS does not
 * specify bar versus single-lamp operation. FULL uses the AMM 35-00 nominal 1800 psig charge (PDF p. 1780).
 * AFMS §1.1.2 p. 14 lights O₂ REQ’D when OFF or outlet pressure is insufficient above approximately 12,000 ft.
 * The earlier AFMS's 12,000 ft panel reminder is separate from the governing POH CAS thresholds.
 * Wiring-fault latching is not simulated. Power loss darkens the lamps, without changing the latched oxygen selection.
 */
export const OXY_CAPACITY_LABELS = ["FULL", "1600", "1200", "800", "400", "EMPTY"] as const;
export type OxygenLamp = "dark" | "on" | "flash";
export function oxyPanelLamps(s: Sim, E: Elec) {
  const enabled = s.oxy.on && E.oxyPwr;
  const band =
    s.oxy.psi >= 1800
      ? 0
      : s.oxy.psi >= 1600
        ? 1
        : s.oxy.psi >= 1200
          ? 2
          : s.oxy.psi >= 800
            ? 3
            : s.oxy.psi >= 400
              ? 4
              : 5;
  return {
    capacity: OXY_CAPACITY_LABELS.map((_, i): OxygenLamp =>
      !enabled || band !== i ? "dark" : i === 5 ? "flash" : "on",
    ),
    required: E.oxyPwr && s.paFt > 12000 && (!s.oxy.on || s.oxy.flowFault) ? ("on" as const) : ("dark" as const),
    fault: enabled && s.oxy.flowFault ? ("flash" as const) : ("dark" as const),
  };
}

/**
 * Minutes spent continuously above 12,500 ft after `dtSec` more seconds at `paFt`; the count restarts at or below 12,500 ft.
 * Feeds OXYGEN RQD caution (POH 3A-24).
 */
export const above12k5 = (min: number, paFt: number, dtSec: number) =>
  paFt > OXY_FT.rqdCaution ? min + dtSec / 60 : 0;

export function cabinLit(s: Sim, E: Elec) {
  const L = s.lights,
    off = { dome: false, foot: false, step: false, bag: false };
  if (!E.convPwr || L.cabin === "OFF") return off;
  const trig = L.door || L.unlocked;
  if (L.cabin === "ON") return { dome: true, foot: true, step: trig, bag: L.bag };
  return { dome: trig, foot: trig, step: trig, bag: L.bag };
}

/** Exterior lights actually lit: bolster switch AND breaker/bus power. LAND drives the cowl and recognition lights (POH 7-57). */
export function extLit(s: Sim, E: Elec) {
  const L = s.lights;
  return {
    nav: L.nav && E.navPwr,
    strobe: L.strobe && E.strobePwr,
    land: L.land && E.landPwr,
    recog: L.land && E.recogPwr,
    ice: L.ice && E.icePwr,
  };
}

export type { CasLevel };
/** MAN PRESSURE level for a manifold pressure: caution > 36.5, warning > 37.5 (provisional POH 2-9 band mapping). */
export const manPressureCas = (map: number): CasLevel | null => (map > MAP_RED_LINE ? "w" : map > 36.5 ? "c" : null);
/**
 * Crew Alerting System messages, named as in POH Sections 3 and 3A (and the Pilot's Guide CAS lists), for the conditions the
 * model simulates. Fuel: FUEL LOW LEFT / RIGHT below 1 gal in that tank (POH 3-34); FUEL LOW TOTAL warning below 9 gal (3-35),
 * caution at 14 gal or less (3A-12); FUEL IMBALANCE warning / caution / advisory above 12 / 10 / 8 gal (3-35, 3A-12, 3A-13).
 * FUEL FLOW is not raised: flow is illustrative and POH 3-36 gives no annunciation trigger.
 * Electrical: ESS BUS warning below 24.5 V (3-39); M BUS 1 / 2 cautions (3A-13 / 14).
 * Alternator loss gives ALT 1 / 2 (3A-15 / 16); AVIONICS OFF when its switch is off (3A-16); PFD FAN
 * FAIL / MFD FAN FAIL when a displayed screen's cooling fan (AVIONICS FAN 2 / FAN 1) has no power (3A-17). BATT 1 (battery 1
 * discharging while ALT 1 works, an MCU fault, 3A-14) has no counterpart in the model, so it isn't raised.
 * ALT AIR OPEN when the alternate air door is open (3A-11). OIL PRESS, OIL TEMP (3-25, 3A-8), CHT (3-26) and START
 * ENGAGED (3-48, 3A-10) aren't raised: the model has no oil, CHT or stuck-starter model.
 * Stall warning and fault: POH 7-68. PITOT HEAT FAIL / REQD: POH 7-69, 3A-20; REQD is immediate in this
 * study model rather than delayed 15 seconds as in the airplane. The illustrative stall trigger is 14° AoA.
 * RPM when the RPM warning is active (POH 3-32; timing AMM 77-10), through the Engine Airframe Unit on ENGINE INSTR
 * (AMM 77-10).
 * TIT when the High TIT condition puts a turbocharger past 1750 °F (2-9, 3-30).
 * MAN PRESSURE caution > 36.5, warning > 37.5: provisional mapping to POH 2-9
 * band edges, pending Pilot’s Guide confirmation (3A-9, 3-29). TIT and MAN PRESSURE, like RPM, need the Engine Airframe
 * Unit on ENGINE INSTR (AMM 77-10).
 */
export function casMessages(s: Sim, E: Elec): [CasLevel, string][] {
  const m: [CasLevel, string][] = [],
    f = s.fuel,
    tot = f.qL + f.qR,
    imb = Math.abs(f.qL - f.qR);
  const imbalance: CasLevel | null = imb > 12 ? "w" : imb > 10 ? "c" : imb > 8 ? "a" : null;
  if (s.stall.aoa >= 14 && !s.stall.fault && E.stallPwr) m.push(["w", "STALL"]);
  if (E.ess1 < 24.5) m.push(["w", "ESS BUS"]);
  if (f.qL < 1) m.push(["w", "FUEL LOW LEFT"]);
  if (f.qR < 1) m.push(["w", "FUEL LOW RIGHT"]);
  if (tot < 9) m.push(["w", "FUEL LOW TOTAL"]);
  if (s.eng.rpmWarn && E.eisPwr) m.push(["w", "RPM"]);
  const turbo = s.eng.running && E.eisPwr,
    man = turbo ? manPressureCas(mapInHg(s, 2500)) : null;
  if (man === "w") m.push(["w", "MAN PRESSURE"]);
  if (turbo && titState(s) === "high") m.push(["w", "TIT"]);
  // oxygen messages join the end of their level's group; the others keep their order
  const oxy = oxygenCas(s);
  m.push(...oxy.filter(([l]) => l === "w"));
  if (E.mdb1 < 24.5) m.push(["c", "M BUS 1"]);
  if (E.mdb2 < 24.5) m.push(["c", "M BUS 2"]);
  if (s.eng.running && !E.alt1) m.push(["c", "ALT 1"]);
  if (s.eng.running && !E.alt2) m.push(["c", "ALT 2"]);
  if (man === "c") m.push(["c", "MAN PRESSURE"]);
  if (altAirOpen(s)) m.push(["c", "ALT AIR OPEN"]);
  if (tot >= 9 && tot <= 14) m.push(["c", "FUEL LOW TOTAL"]);
  if (imbalance) m.push([imbalance, "FUEL IMBALANCE"]);
  if (s.pitot.heat && (s.pitot.heaterFail || !E.pitotPwr)) m.push(["c", "PITOT HEAT FAIL"]);
  if (!s.pitot.heat && s.pitot.oat < 5) m.push(["c", "PITOT HEAT REQD"]);
  if (s.stall.fault) m.push(["c", "STALL WARN FAIL"]);
  // Heater failure caution, p. 15 (ref. 13772-134 Rev 05, applicability to the modelled airplane unconfirmed).
  if (s.equip.fiki && s.pitot.heat && (s.stall.heaterFail || !E.liftHeatPwr || !E.pitotPwr))
    m.push(["c", "ANTI ICE HTR"]);
  if (s.gear.park) m.push(["c", "PARK BRAKE"]);
  if (!s.elec.avionics) m.push(["c", "AVIONICS OFF"]); // 3A-16
  m.push(...oxy.filter(([l]) => l === "c"));
  if (E.pfd && !E.fan2) m.push(["a", "PFD FAN FAIL"]); // 3A-17
  if (E.mfd && !E.fan1) m.push(["a", "MFD FAN FAIL"]);
  m.push(...oxy.filter(([l]) => l === "a"));
  return m;
}

/**
 * Oxygen CAS (POH 3-41, 3-42, 3A-24, 3A-25). OXYGEN FAULT warning: system ON and the tank solenoid or flow failed.
 * OXYGEN QTY: warning below 400 psi; caution 400–800 psi inclusive at or above 12,500 ft and advisory at or below 800 psi under 12,500 ft
 * (pressure altitude, 3A-25). A modelling assumption selects the inclusive 800 psi boundary from AFMS 102NMAN0001
 * Rev F §1.1.2 Table 2 p. 16 (PDF p. 18); POH altitude logic and below-400 warning retain precedence. OXYGEN RQD: warning above 14,000 ft with the system not ON; caution after more than 30 min
 * above 12,500 ft. OXYGEN LEFT ON advisory: system ON after engine shutdown (the model has no flight state, so a stopped
 * engine stands for "on ground"). CHECK OXYGEN (3A-26) gives no trigger, so it isn't raised.
 */
export function oxygenCas(s: Sim): [CasLevel, string][] {
  const m: [CasLevel, string][] = [],
    o = s.oxy,
    high = s.paFt >= OXY_FT.rqdCaution;
  if (o.on && o.flowFault) m.push(["w", "OXYGEN FAULT"]);
  if (o.psi < 400) m.push(["w", "OXYGEN QTY"]);
  else if (o.psi <= 800) m.push([high ? "c" : "a", "OXYGEN QTY"]);
  if (!o.on && s.paFt > OXY_FT.rqdWarning) m.push(["w", "OXYGEN RQD"]);
  else if (!o.on && s.paFt > OXY_FT.rqdCaution && o.above12k5Min > OXY_RQD_MIN) m.push(["c", "OXYGEN RQD"]);
  if (o.on && !s.eng.running) m.push(["a", "OXYGEN LEFT ON"]);
  return m;
}

/** Breakers on one bus: [label, amps]; no amps where the documents give none. */
export type Loads = [string, number?][];
export type BusRow = [BusId, string, string, Loads];

/** Circuit-breaker buses without the rows that depend on the equipment fitted (see `busTable`). */
const BUSES: BusRow[] = [
  [
    "ess1",
    "ESS BUS 1",
    "Ess Dist Bus via ESSENTIAL POWER · BAT 2",
    [
      ["ESSENTIAL POWER", 20],
      ["PFD A", 5],
      ["ADAHRS 1", 5],
      ["COM 1", 7.5],
      ["GPS NAV GIA 1", 5],
      ["STDBY ATTD A", 5],
      ["BAT 2", 20],
    ],
  ],
  [
    "ess2",
    "ESS BUS 2",
    "Ess Dist Bus (BAT 2 through ESS BUS 1)",
    [
      ["PITCH TRIM", 2],
      ["ROLL TRIM", 2],
      ["STALL WARNING", 2],
      ["ENGINE INSTR", 3],
      ["ALT 2", 5],
    ],
  ],
  [
    "main1",
    "MAIN BUS 1",
    "Main Dist Bus 2",
    [
      ["MFD B", 5],
      ["STDBY ATTD B", 5],
      ["KEYPADS / AP CTRL", 5],
      ["CABIN LIGHTS / OXYGEN", 5],
      ["CABIN AIR CONTROL", 2],
      ["FUEL QTY", 5],
      ["AP SERVOS", 5],
      ["AVIONICS", 10],
    ],
  ],
  [
    "main2",
    "MAIN BUS 2",
    "Main Dist Bus 2",
    [
      ["PFD B", 5],
      ["FUEL PUMP", 5],
      ["COM 2", 7.5],
      ["GPS NAV GIA 2", 5],
      ["ADAHRS 2", 5],
      ["AVIONICS FAN 2", 5],
    ],
  ],
  [
    "nonEss",
    "NON ESS BUS",
    "Main Dist Bus 2",
    [
      ["FLAPS", 10],
      ["PITOT HEAT", 7.5],
      ["STARTER", 2],
      ["AVIONICS FAN 1", 5],
      ["NAV LIGHTS", 5],
      ["STROBE LIGHTS", 5],
    ],
  ],
  [
    "avx",
    "AVIONICS BUS",
    "MAIN BUS 1 via AVIONICS switch",
    [
      ["AUDIO PANEL", 5],
      ["XPONDER", 2],
      ["DATA LINK/WX", 5],
      ["TRAFFIC", 5],
      ["DME/ADF", 3],
    ],
  ],
  [
    "main3",
    "MAIN BUS 3",
    "Main Dist Bus 1",
    [
      ["LANDING LIGHTS", 15],
      ["YAW SERVO", 3],
      ["MFD A", 5],
      ["12V & USB", 5],
      ["EVS CAMERA", 5],
    ],
  ],
  [
    "ac1",
    "A/C BUS 1",
    "Main Dist Bus 1",
    [
      ["ALT 1", 5],
      ["A/C COND", 15],
    ],
  ],
  [
    "ac2",
    "A/C BUS 2",
    "Main Dist Bus 1",
    [
      ["CABIN FAN", 15],
      ["A/C COMPR", 5],
    ],
  ],
  ["conv", "CONV BUS", "BAT 1 direct, 5 A fuse", [["CONV LIGHTS", 5]]],
];

/**
 * Breakers that come and go with ice protection. With FIKI: ICE PROTECT 2 heads ESS BUS 2, ICE PROTECT 1 (which also feeds
 * the ice inspection lights) is on MAIN BUS 1, and STALL VANE HEAT (no published rating) is on the NON ESS BUS (POH Figs 7-10,
 * 7-11, 7-48, 7-52; AMM 30-00, 30-80; AMM 30-07 puts ICE PROTECT 2 on Main Bus 1, the POH governs). Without: the ice
 * inspection lights get their own 5 A ICE LIGHTS breaker on MAIN BUS 1 (AMM 30-80, 33-40; the POH has no ice-light rating).
 */
const equipRows = (equip: Equip): { first: Partial<Record<BusId, Loads>>; last: Partial<Record<BusId, Loads>> } =>
  equip.fiki
    ? {
        first: { ess2: [["ICE PROTECT 2", 5]], main1: [["ICE PROTECT 1", 7.5]] },
        last: { nonEss: [["STALL VANE HEAT"]] },
      }
    : { first: { main1: [["ICE LIGHTS", 5]] }, last: {} };

/** Circuit-breaker buses as shown on the panel for the equipment fitted: [bus, label, source, loads]. */
export function busTable(equip: Equip): BusRow[] {
  const { first, last } = equipRows(equip);
  return BUSES.map(([id, name, src, loads]) => [id, name, src, [...(first[id] ?? []), ...loads, ...(last[id] ?? [])]]);
}

/** The bus whose breaker row lists `breaker` for the equipment fitted, or undefined when no row lists it. */
export const breakerBus = (equip: Equip, breaker: string): BusId | undefined =>
  busTable(equip).find(([, , , loads]) => loads.some(([n]) => n === breaker))?.[0];

/** Mode-average relative flow, not gal/hr (AMM 30-00, PDF 1167). */
export function pumpDuty(s: Sim): number {
  if (!s.equip.fiki) return 0;
  const i = s.ice;
  if (i.on && i.maxT > 0) return 400;
  return (i.on ? (i.mode === "HIGH" ? 200 : i.bkup ? 50 : 100) : 0) + (i.bkup ? 200 : 0);
}

/** Actual metering-pump commands during the NORM cycle (AMM 30-00, PDF 1167). */
export function icePumps(s: Sim, phase: number): [boolean, boolean] {
  if (!s.equip.fiki) return [false, false];
  const i = s.ice,
    normal = phase % 120 < 30;
  return [
    i.on && (i.maxT > 0 || i.mode === "HIGH" || normal),
    i.bkup || (i.on && (i.maxT > 0 || (i.mode === "NORM" && normal))),
  ];
}

/**
 * Ends MAX and WINDSHLD once their run time reaches the armed duration (AMM 30-00, PDF 1167); no fluid burn without
 * supplement rates.
 */
export function expireIce(ice: Sim["ice"], maxRun: number, wsRun: number): Sim["ice"] {
  return { ...ice, maxT: maxRun >= ice.maxT ? 0 : ice.maxT, ws: wsRun >= ice.ws ? 0 : ice.ws };
}

/**
 * The A/C compressor runs, and the refrigerant circulates, only with the A/C selected, the engine running and the A/C COMPR
 * feed powered: "The airplane engine must be running for the air conditioner to operate"; 5 A A/C COMPR on A/C BUS 2
 * (POH 7-61). `env` is the A/C selection the system follows: callers pass the control panel's held selections
 * (`valveEnv` in parts/environment.ts), so with CABIN AIR CONTROL unpowered the compressor keeps its last powered command,
 * like the hot-air valve (lead ruling, POH silent).
 */
export const acCompressorOn = (s: Sim, E: Elec, env: Sim["env"] = s.env) => env.ac && s.eng.running && E.acComprPwr;

/** POH 13772-007 7-26: apply toes, then pull PARK to hold that pressure.
 * With no toe input retain the legacy 0.6 display cue (a default, not a sourced pressure).
 */
export function setPark(gear: Sim["gear"], on: boolean): Sim["gear"] {
  if (!on) return { ...gear, park: false, held: { L: 0, R: 0 } };
  const R = Math.max(0, gear.diff),
    L = Math.max(0, -gear.diff);
  return { ...gear, park: true, held: R || L ? { L, R } : { L: 0.6, R: 0.6 } };
}

/** Reference-only supplement; never replaces POH/AMM authority. */
export const LIFT_HEAT_REF = "ref. 13772-134 Rev 05, applicability to the modelled airplane unconfirmed";
/** p. 6 (ref. 13772-134 Rev 05, applicability to the modelled airplane unconfirmed). A pilot limit, not a thermal trip. */
export const LIFT_HEAT_GROUND_LIMIT = 45;
/** PITOT HEAT switch: AMM 13773-002 Rev 7, 27-31 ¶B(2)(f), PDF p. 1038; two mounting-plate heaters, vane and case
 * heaters: ¶B(3)(d), PDF p. 1039. STALL VANE HEAT feed: POH 13772-007 Fig 7-11 (7-52).
 * Require PITOT HEAT breaker power as an inferred control dependency: the heater-failure recovery cycles both breakers,
 * p. 15 (ref. 13772-134 Rev 05, applicability to the modelled airplane unconfirmed); no circuit topology is asserted.
 * The AMM draws no lift-heat circuit. Fig 24-30-1 (PDF p. 706) lists PITOT HEAT and STALL VANE HEAT as
 * separate NON-ESSENTIAL BUS breakers; Fig 34-00-2 sheets 1–3 (PDF pp. 1624–1626) draw only the pitot heater; circuit
 * schematics are in the Wiring Manual (AMM 24-50, PDF p. 751), not a project source. The dependency stays inferred.
 * Ground 25%, airborne 100%, p. 45 (ref. 13772-134 Rev 05, applicability to the modelled airplane unconfirmed).
 * Ground mode is a manual study input because this airplane has no flight-state integrator.
 */
export const liftHeatDuty = (s: Sim, E: Elec): number =>
  s.equip.fiki && s.pitot.heat && E.pitotPwr && E.liftHeatPwr && !s.stall.heaterFail
    ? s.stall.onGround
      ? 0.25
      : 1
    : 0;
/** Elapsed continuous powered ground operation, p. 6 (ref. 13772-134 Rev 05, applicability to the modelled airplane unconfirmed). */
export const liftHeatGroundTime = (seconds: number, s: Sim, E: Elec, dt: number) =>
  s.stall.onGround && liftHeatDuty(s, E) > 0 ? seconds + dt : 0;
