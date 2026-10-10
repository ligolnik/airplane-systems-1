/**
 * Declarative catalogue of every modelled SR22T component, one file per system group.
 * Geometry is built lazily (browser only). Positions are in airplane coordinates unless the
 * part has a `parent`, in which case they are relative to that moving group.
 * - catalogue.ts — `CAT` and its label lists, the `part`/`shell`/`surface`/`onSurf` wrappers and the per-frame animation
 *   helpers the sections share (no parts)
 * - airframe.ts — fuselage, spinner, wing, trailing-edge, stabilizer and fin shells
 * - surfaces.ts — flaps, ailerons, elevator and rudder, and the details on them (wicks, horn balances, hinges, trim tabs)
 * - cowl.ts — cowl openings: cooling inlets, NACA induction ducts, exit louvers, oil filler door; front cowl fasteners
 * - gear.ts — main and nose gear, wheels, brakes, parking brake, rudder pedals / toe brakes
 * - engine.ts — propeller and engine: ignition, governor, oil, induction, exhaust, alternators, starter; the turbo, intercooler
 *   and heat-exchanger anchors
 * - engine-ignition.ts — engine ignition and starting
 * - engine-oil.ts — engine oil system
 * - engine-air.ts — engine induction and exhaust
 * - engine-sensors.ts — engine sensors, mount and baffles
 * - engine-baffles.ts — engine cooling baffles, their seals and the intercooler seals
 * - structure.ts — firewall, aft bulkhead, spar, roll cage, wing attach points
 * - cabin.ts — cockpit / cabin: panel, bolster switches, console, seats, side yokes and trim, flap drive and switch, fuel
 *   selector, CAPS handle, safety equipment
 * - cockpit.ts — centre panel and console controls
 * - electrical.ts — electrical hardware: MCU, batteries, ground power
 * - avionics.ts — avionics, antennas, magnetometer
 * - pitot.ts — pitot-static and stall warning
 * - fuel.ts — fuel system hardware
 * - environment.ts — environmental system
 * - aircon.ts — air conditioning hardware
 * - caps.ts — CAPS canister and harness
 * - lights.ts — interior and exterior lights
 * - controls.ts — flight-control mechanisms (POH Figures 7-1, 7-2, 7-3)
 * - controls-trim.ts — trim systems and servo linkages
 * - ice.ts — TKS ice protection hardware, present only with FIKI (AMM 30-00)
 * - oxygen.ts — built-in oxygen: bottle, regulator, supply line, overhead manifold and outlets, control panel, filler station
 * - electrical-harness.ts — electrical harness and circuit protection
 *
 * The sections are imported below in registration order. Part ids come from a running counter and the first part with a
 * given name gets the label pin, so keep this order, and never import a section from one that comes before it here.
 * Sections may import anchors only from earlier sections; outside consumers use ./parts.
 * Shared constants go in catalogue.ts.
 */
export { CAT, CONSOLE_QUADRANT, STALL_Z, chanOfKey, surfacePivot, MD302_POS } from "./catalogue";
import "./airframe";
import "./surfaces";
import "./cowl";
export {
  MG,
  NOSE_CASTER,
  NOSE_GEAR,
  PARK_VALVE,
  PARK_VALVE_PORT,
  BRAKE_FITTINGS,
  BRAKE_LINES,
  PARK_HANDLE,
  PARK_ARM,
  PARK_CLEVIS,
  PARK_BRACKET,
  parkClevis,
  parkStop,
  parkArmAngle,
  parkWire,
  parkWrap,
  PARK_CABLE,
  PARK_STOP,
  PARK_SHEATH,
} from "./gear";
export {
  AIR_BOX,
  ALT_AIR,
  ALT1,
  ALT1_LEN,
  ALT1_PAD,
  ALT1_R,
  ALT1_TERM,
  ALT2,
  ALT2_BRACKET,
  ALT2_BRACKET_SIZE,
  ALT2_LEN,
  ALT2_PULLEY,
  ALT2_R,
  ALT2_TERM,
  CRANKCASE,
  CRANKCASE_SIZE,
  CYLS,
  cylOrigin,
  cylIntake,
  cylExhaust,
  injectorAnchor,
  GOV,
  HEAT_X,
  COMPRESSOR_DUCT,
  INTERCOOLER,
  INTERCOOLER_AFT,
  INTERCOOLER_IN,
  INTERCOOLER_OUT,
  INTERCOOLER_SEAT,
  PROP,
  SHEAVE_X,
  THROTTLE,
  TURBO,
  WASTEGATE,
  GATE_CONTROLLER,
  TURBO_SCAVENGE,
  GATE_TRANSITION,
  OIL_COOLER,
} from "./engine";
import "./engine-ignition";
export { OIL_SCREEN, OIL_PUMP, OIL_CONTROL, OIL_SOURCE, OIL_CHECK, OIL_TEE } from "./engine-oil";
export {
  MIXTURE_ARM,
  INDUCTION_Y,
  INTAKE_MANIFOLD,
  HEADER,
  EXHAUST_RUN,
  ALTERNATE_DUCT,
  BLAST_TUBE,
  EXHAUST_TIE_ROD,
  THROTTLE_CABLE,
  MIXTURE_CABLE,
  INDUCTION_PATH,
  INLET_RUN,
  INTAKE_RUN,
  UPPER_DECK_LINE,
  GATE_OIL_RUN,
  COMPRESSOR_RUN,
} from "./engine-air";
export { MOUNT_ATTACH, MOUNT_FEET, MOUNT_RUNS } from "./engine-sensors";
import "./engine-baffles";
import "./structure";
export {
  ELT_POS,
  ELT_SIZE,
  ELT_SHELF,
  ELT_GROMMET,
  ELT_SHELF_OUTLINE,
  ELT_SHELF_THICKNESS,
  ELT_ANTENNA_BASE,
  ELT_ANTENNA_FEED,
  ELT_ANTENNA_JACK,
  ELT_REMOTE_JACK,
  ELT_RCPI,
  ELT_RCPI_JACK,
  ELT_BUZZER,
  ELT_ANTENNA_CABLE,
  ELT_REMOTE_CABLE,
  FT,
  YOKES,
  YOKE_X,
  YOKE_Y,
  CAPS_HANDLE_POS,
  CAPS_HANDLE_HEIGHT,
  CAPS_HANDLE_ATTACH,
  capsHandleDrop,
} from "./cabin";
import "./doors";
import "./cockpit";
export { BAT2_BOX, BAT2_SIZE, BAT2_SHELF, CRANK_PULLEY, MCU, MCU_RELAYS, MCU_SIZE } from "./electrical";
export {
  ADAHRS_1,
  ADAHRS_2,
  GIA_1,
  GIA_2,
  GEA_71,
  PFD_CONN,
  MFD_CONN,
  PFD_FAN,
  MFD_FAN,
  IAU_FAN,
  XPDR,
  XM_RADIO,
  GDL_69A,
  GATEWAY,
  GSR_56,
  WX_500,
  GTS_800,
  KN_63,
  MAG_1,
  MAG_2,
  MAG_WIRES,
  GMA_350,
} from "./avionics";
export {
  OAT_1,
  OAT_2,
  PITOT_Z,
  SPX,
  pitotBase,
  statR,
  ALT_STATIC,
  PITOT_TIP,
  STATIC_TEE,
  SUMPS,
  TRAPS,
  DRAINS,
} from "./pitot";
export { TANK_SPAN, TANK_CHORD, tankTop } from "./fuel";
export {
  airflowValveOpen,
  butterflies,
  cabinAirControlPowered,
  freshValveOpen,
  hotValveOpen,
  valveEnv,
} from "./environment";
export { AC } from "./aircon";
export { CAPS_BOX, HARNESS, ROCKET_T, TAUT_T, strapOut, strapPeel, CAPS_CABLE, ROCKET_IGNITER } from "./caps";
export { LIGHTS } from "./lights";
import "./controls";
import "./controls-trim";
export { TKS_TANK } from "./ice";
export { OXY } from "./oxygen";
import "./electrical-harness";

export { FIN } from "../geometry";
export type { PartSpec } from "@/lib/catalogue";
