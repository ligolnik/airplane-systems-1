/**
 * SR22T guided preflight walk-around: POH 13772-007 Section 4, Normal Procedures, "Preflight Inspection" (pp. 4-4 – 4-9,
 * Figure 4-1 "Recommended Walk-Around Sequence", stations 1–13). Pure data: every lettered item in POH order, with the POH
 * action and standard, the catalogue parts that show it, the system X-ray shows, and a one-line why.
 *
 * FIKI TKS supplement items are out of scope. The oxygen items (1i, 1q) show only when the oxygen system is fitted. The
 * cabin items carry `sim`: the switch or control the step sets in the model (see walk.ts).
 */
import type { Vec3 } from "@/lib/math";
import type { SysId } from "@/lib/systems";
import type { Sim } from "./model";

/** A standing viewpoint: eye position and the point looked at (airplane coordinates, metres; x forward, z right). */
export interface CameraPose {
  p: Vec3;
  t: Vec3;
}
/** Phase 2 item animations (not drawn yet). */
export type WalkAnim = "flaps100" | "aileronSweep" | "elevatorSweep" | "rudderSweep" | "drainSample" | "dipstick";

export interface WalkItem {
  /** Station number and POH letter, e.g. "7c". */
  id: string;
  /** POH item text, e.g. "Fuel Drains (2 underside)". */
  text: string;
  /** POH action / standard, e.g. "DRAIN AND SAMPLE". */
  standard: string;
  /** POH sub-steps, e.g. 1q (1)–(3). */
  steps?: string[];
  /** POH note printed with the item. */
  note?: string;
  /** Catalogue part, surface or shell names to highlight; names in NOT_MODELLED are shown as text only. */
  parts: string[];
  /** Which side's instances of a shared part name (e.g. "Main wheel"); defaults to the station's side, "any" for both. */
  side?: "L" | "R" | "any";
  /** X-ray system shown with the item. */
  system?: SysId;
  /** One line: what the check protects against, or what the system does. */
  why: string;
  /** An underside check (drains, vents, gascolator): the item camera crouches to CROUCH_Y instead of standing. */
  crouch?: boolean;
  /**
   * A technique item, not a lettered POH item: shown with the TECHNIQUE_BADGE, kept out of the POH item counts, and
   * otherwise walked like the others (progress, ✓ / skip, resume, the summary).
   */
  technique?: boolean;
  /** Explicit eye position for the item, used instead of the one walk.ts computes; the camera still looks at the parts. */
  eye?: Vec3;
  /** Where the pilot is looking from, e.g. "Looking across at the LEFT main wheel". */
  look?: string;
  /** Id of the item where the pilot stands for this check: the mini-map and the scene draw the line of sight from there. */
  sightFrom?: string;
  /** Pointer to a related item, e.g. where a part is checked from the other side. */
  see?: string;
  /** Emphasize the parts beyond the spot colour: a pulsing halo on every instance. */
  emphasis?: boolean;
  /** Optional equipment: the item is left out while this is false. */
  fitted?: (s: Sim) => boolean;
  /** What stepping onto this item sets in the model (cabin station). */
  sim?: (d: Sim) => void;
  anim?: WalkAnim;
  ref: string;
}

export interface WalkStation {
  /** 1..13, Figure 4-1. */
  n: number;
  title: string;
  /** Standing eye height viewpoint outside the airplane. */
  cam: CameraPose;
  /** Where the station sits on the top-down mini-map, [x, z] in airplane coordinates, around the airplane as in Fig 4-1. */
  map: [number, number];
  /** Side the station's shared part names refer to. */
  side?: "L" | "R";
  items: WalkItem[];
  /** POH warning or caution printed with the station. */
  warning?: string;
  /** POH note printed before the station's first item. */
  note?: string;
}

/** Eye height above the ground for the station viewpoints, m (GROUND_Y −1.39 + 1.65). */
export const EYE_Y = 0.26; // approximate: a typical standing eye height, 1.65 m; no source gives one
/** Eye height crouched to look under a wing or the nose, m (GROUND_Y −1.39 + 1.1). */
export const CROUCH_Y = -0.29; // approximate: a crouched eye height, 1.1 m; no source gives one

/** The oxygen system is fitted (POH 4-5, 1i and 1q "if available"). */
export const oxygenFitted = (s: Sim) => s.equip.oxygen !== false;

/** Names the walk-around refers to that the 3D model doesn't have, with the reason. */
export const NOT_MODELLED: Record<string, string> = {
  "Required documents": "Paperwork is not part of the 3D model.",
  "Oxygen masks and cannulas": "Only the ceiling outlets are modelled, not the masks, cannulas or their hoses.",
  "CAPS handle safety pin": "The model shows the handle and its cover, not the removable safety pin.",
  "Wing/fuselage fairing": "The wing-root fairing is blended into the fuselage and wing skins, not a separate part.",
  "Parachute cover": "The CAPS compartment cover is part of the fuselage skin; the canister under it is modelled.",
  "Tail tiedown": "Tiedown rings and ropes are not modelled.",
  "Stabilizer inspection-hole tape": "Inspection holes and their tape are not modelled.",
  "Empennage hinges, bolts and cotter pins": "Hinge hardware is not modelled separately from the surfaces.",
  "Flap rub strips": "Rub strips are not modelled.",
  "Aileron gap seal": "The gap seal is not modelled.",
  "Aileron hinge bolt safety wire": "Safety wire is not modelled.",
  "Wing tip": "The tip is part of the wing skin, not a separate part; its light is modelled.",
  "Chocks and tiedown ropes": "Chocks and tiedowns are not modelled.",
  "Vortex generator": "The cowl vortex generators are not modelled.",
  "Tow bar": "The tow bar is not modelled.",
};

/** Badge on technique items: checks taught at the airplane that the POH checklist doesn't list. */
export const TECHNIQUE_BADGE = "Technique (not in the POH)";
/** Is the item one of the POH's lettered items (not a technique item)? */
export const isPoh = (item: WalkItem) => !item.technique;

/** Brake temperature indicator, checked from under the opposite wing (AMM 13773-002 Rev 7 32-42). */
const BRAKE_INDICATOR_WHY =
  "Brake temperature indicator: not discoloured (white is normal; it turns black once the brake reaches 450 °F, AMM 32-42). It sits on the inboard side of the caliper, so check it from under the opposite wing.";
const BRAKE_INDICATOR_REF = "AMM 32-42, PDF 1450, 1461; Fig 32-42-1, PDF 1462";

const avionics = (on: boolean) => (d: Sim) => {
  d.elec.avionics = on;
};
const pitotHeat = (on: boolean) => (d: Sim) => {
  d.pitot.heat = on;
};

/** POH 4-4 general warning, in our own words: the intro card. */
export const GENERAL_WARNING =
  "Before the walk-around, make sure the required maintenance is done and the flight is planned, including weight and balance and performance.";
/** POH 4-4, in our own words: what to check throughout the walk-around (shown with every item). */
export const THROUGHOUT = [
  "Hinges, hinge pins and bolts are secure.",
  "The skin shows no damage or delamination.",
  "Control surfaces move freely, without excess play.",
  "No leaks around fluid reservoirs and lines.",
];
/** POH 4-4, in our own words: cold weather. */
export const COLD_WEATHER = [
  "In cold weather, remove all frost, ice and snow from the airframe and control surfaces, and keep the wheel fairings clear.",
  "The pitot probe warms within 30 seconds of turning pitot heat on.",
];
export const WARNING_CONSEQUENCE =
  "Skipping these checks can lead to serious damage, loss of the airplane or loss of life. (POH 4-4)";
/** Where the checklist continues (POH 4-10). */
export const NEXT_CHECKLIST = { title: "Before Engine Start", ref: "POH 4-10" };
export const SOURCE = "SR22T POH 13772-007 Reissue A, Section 4, pp. 4-4 – 4-9, Figure 4-1";

const AILERON_BOLT_NOTE = "Verify bolt located under the inboard edge of aileron is secured with safety wire.";

export const WALK: WalkStation[] = [
  {
    n: 1,
    title: "Cabin",
    cam: { p: [-0.2, EYE_Y, -1.35], t: [1.8, -0.1, -0.05] }, // approximate: standing viewpoint chosen on the model
    map: [1.55, 0], // approximate: placed around the airplane as in Fig 4-1
    items: [
      {
        id: "1a",
        text: "Required Documents",
        standard: "ON BOARD",
        parts: ["Required documents"],
        system: "cabin",
        why: "The airworthiness and registration certificates and the POH/AFM must be in the airplane.",
        ref: "POH 4-5",
      },
      {
        id: "1b",
        text: "AVIONICS Switch",
        standard: "OFF",
        parts: ["AVIONICS switch"],
        system: "electrical",
        why: "Avionics off before the batteries come on, so the avionics bus isn't loaded while you check the essential bus.",
        sim: avionics(false),
        ref: "POH 4-5",
      },
      {
        id: "1c",
        text: "BAT 2 Switch",
        standard: "ON",
        parts: ["BAT 2 switch"],
        system: "electrical",
        why: "BAT 2 alone feeds ESS BUS 1 and the PFD: the next two items test the backup battery by itself.",
        sim: (d) => {
          d.elec.bat2 = true;
        },
        ref: "POH 4-5",
      },
      {
        id: "1d",
        text: "PFD",
        standard: "VERIFY ON",
        parts: ["PFD bezel"],
        system: "avionics",
        why: "With BAT 2 alone the PFD runs on ESS BUS 1, through its PFD A breaker (POH Fig 7-10, 7-48).",
        ref: "POH 4-5",
      },
      {
        id: "1e",
        text: "Essential Bus Voltage",
        standard: "23-25 VOLTS",
        parts: ["PFD bezel", "Essential Distribution Bus"],
        system: "electrical",
        why: "Read with BAT 2 as the only source: it shows the backup battery can hold up the essential bus.",
        ref: "POH 4-5",
      },
      {
        id: "1f",
        text: "Flap Position Light",
        standard: "OUT",
        parts: ["Flap position light"],
        system: "flaps",
        why: "The flaps are not powered yet (no main bus), so no position light should show.",
        ref: "POH 4-5",
      },
      {
        id: "1g",
        text: "BAT 1 Switch",
        standard: "ON",
        parts: ["BAT 1 switch"],
        system: "electrical",
        why: "BAT 1 powers the main distribution buses and everything on them.",
        sim: (d) => {
          d.elec.bat1 = true;
        },
        ref: "POH 4-5",
      },
      {
        id: "1h",
        text: "Avionics Cooling Fan",
        standard: "AUDIBLE",
        parts: ["PFD cooling fan", "MFD cooling fan", "Avionics (IAU) cooling fan"],
        system: "avionics",
        why: "The displays rely on their cooling fans; listen for them before you rely on the displays.",
        ref: "POH 4-5",
      },
      {
        id: "1i",
        text: "Oxygen Masks/Cannulas and Hoses (if available)",
        standard: "CHECK CONDITION",
        parts: ["Oxygen outlet 1", "Oxygen outlet 2", "Oxygen masks and cannulas"],
        system: "oxygen",
        why: "Masks, cannulas and hoses are what deliver the oxygen; check them before you need them.",
        fitted: oxygenFitted,
        ref: "POH 4-5",
      },
      {
        id: "1j",
        text: "AVIONICS Switch",
        standard: "ON",
        parts: ["AVIONICS switch"],
        system: "electrical",
        why: "Powers the avionics bus for the checks that follow.",
        sim: avionics(true),
        ref: "POH 4-5",
      },
      {
        id: "1k",
        text: "Fuel Quantity",
        standard: "CHECK",
        parts: ["MFD bezel"],
        system: "fuel",
        why: "The gauged quantity, to compare with what you see at the filler caps (7b, 11f).",
        ref: "POH 4-5",
      },
      {
        id: "1l",
        text: "Fuel Selector",
        standard: "SELECT FULLER TANK",
        parts: ["Fuel selector valve"],
        system: "fuel",
        why: "The selector feeds from one tank at a time: LEFT, RIGHT or OFF (POH 7-41).",
        sim: (d) => {
          d.fuel.sel = d.fuel.qR > d.fuel.qL ? "R" : "L";
        },
        ref: "POH 4-5",
      },
      {
        id: "1m",
        text: "Flaps",
        standard: "100%, CHECK LIGHT ON",
        parts: ["FLAPS switch", "Flap position light", "Right flap", "Left flap"],
        system: "flaps",
        why: "Run the flaps to 100% to check the motor and the position light, and leave them down to inspect the hinges.",
        sim: (d) => {
          d.flaps.cmd = 100;
        },
        anim: "flaps100",
        ref: "POH 4-5",
      },
      {
        id: "1n",
        text: "Lights",
        standard: "CHECK OPERATION",
        parts: ["NAV switch", "STROBE switch", "LAND switch"],
        system: "lighting",
        why: "Switch each exterior light on and look for it, then switch it off again.",
        ref: "POH 4-5",
      },
      {
        id: "1o",
        text: "Stall Warning System Inlet",
        standard: "UNOBSTRUCTED",
        parts: ["Stall warning inlet", "Stall warning lift transducer"],
        side: "R",
        system: "pitot",
        why: "The inlet in the right wing leading edge feeds the stall warning pressure switch; blocked, it gives no warning (POH 7-68).",
        ref: "POH 4-5",
      },
      {
        id: "1p",
        text: "Stall Warning",
        standard: "TEST",
        note: "Test stall warning system by applying suction to the stall warning system inlet and noting the warning horn sounds.",
        parts: ["Stall warning inlet", "Stall warning lift transducer"],
        side: "R",
        system: "pitot",
        why: "Proves the whole chain from the inlet to the horn.",
        ref: "POH 4-5",
      },
      {
        id: "1q",
        text: "Oxygen System (if available)",
        standard: "ON",
        steps: [
          "Quantity ... VERIFY ADEQUATE SUPPLY FOR FLIGHT WITH RESERVE",
          "Flow ... CHECK FLOWMETER ON ALL MASKS",
          "Oxygen System ... OFF",
        ],
        parts: ["Oxygen system control panel"],
        system: "oxygen",
        why: "Switching it on lights the quantity display and lets you check flow at every mask.",
        fitted: oxygenFitted,
        sim: (d) => {
          d.oxy.on = true;
        },
        ref: "POH 4-5",
      },
      {
        id: "1r",
        text: "Pitot Heat",
        standard: "ON",
        steps: ["Verify probe is hot."],
        note: "WARNING: Pitot Heat Probe may be hot.",
        parts: ["PITOT HEAT switch", "Heated pitot tube"],
        side: "L",
        system: "pitot",
        why: "A cold probe can ice over in cloud; the probe should warm within 30 seconds (POH 4-4).",
        sim: (d) => {
          d.oxy.on = false; // 1q (3): Oxygen System OFF
          d.pitot.heat = true;
        },
        ref: "POH 4-5",
      },
      {
        id: "1s",
        text: "Pitot Heat",
        standard: "OFF",
        parts: ["PITOT HEAT switch"],
        system: "pitot",
        why: "Off again until it is needed.",
        sim: pitotHeat(false),
        ref: "POH 4-5",
      },
      {
        id: "1t",
        text: "AVIONICS Switch",
        standard: "OFF",
        parts: ["AVIONICS switch"],
        system: "electrical",
        why: "Avionics off before the batteries go off.",
        sim: avionics(false),
        ref: "POH 4-5",
      },
      {
        id: "1u",
        text: "BAT 1 and BAT 2 Switches",
        standard: "OFF",
        parts: ["BAT 1 switch", "BAT 2 switch"],
        system: "electrical",
        why: "Don't run the batteries down while you walk around the airplane.",
        sim: (d) => {
          d.elec.bat1 = false;
          d.elec.bat2 = false;
        },
        ref: "POH 4-6",
      },
      {
        id: "1v",
        text: "Alternate Static Source",
        standard: "NORMAL",
        parts: ["Alternate static knob"],
        system: "pitot",
        why: "The instruments should read from the outside static ports, not the cabin.",
        sim: (d) => {
          d.pitot.alt = false;
        },
        ref: "POH 4-6",
      },
      {
        id: "1w",
        text: "Circuit Breakers",
        standard: "IN",
        parts: ["Circuit breaker panel"],
        system: "electrical",
        why: "A pulled breaker leaves its equipment unpowered.",
        sim: (d) => {
          d.cb = {};
        },
        ref: "POH 4-6",
      },
      {
        id: "1x",
        text: "Fire Extinguisher",
        standard: "CHARGED AND AVAILABLE",
        parts: ["Fire extinguisher"],
        system: "cabin",
        why: "It has to be charged and within reach of the pilot.",
        ref: "POH 4-6",
      },
      {
        id: "1y",
        text: "Emergency Egress Hammer",
        standard: "AVAILABLE",
        parts: ["Armrest: egress hammer & hour meters"],
        system: "cabin",
        why: "Breaks the window to get out if the doors jam.",
        ref: "POH 4-6",
      },
      {
        id: "1z",
        text: "CAPS Handle",
        standard: "PIN REMOVED",
        parts: ["CAPS activation T-handle", "CAPS activation handle cover", "CAPS handle safety pin"],
        system: "caps",
        why: "With the pin in, the parachute can't be deployed.",
        ref: "POH 4-6",
      },
    ],
  },
  {
    n: 2,
    title: "Left Fuselage",
    cam: { p: [-0.7, EYE_Y, -2.3], t: [-0.15, -0.05, -0.3] }, // approximate: standing viewpoint chosen on the model
    map: [-0.9, -1.7], // approximate: placed around the airplane as in Fig 4-1
    side: "L",
    items: [
      {
        id: "2a",
        text: "Door Lock",
        standard: "UNLOCK",
        parts: ["Door lock cylinder"],
        system: "doors",
        why: "A locked door can't be opened from outside to help occupants out.",
        ref: "POH 4-6",
      },
      {
        id: "2b",
        text: "COM 1 Antenna (top)",
        standard: "CONDITION AND ATTACHMENT",
        parts: ["COM 1 antenna"],
        side: "any",
        system: "avionics",
        why: "COM 1's rod antenna, above the passenger compartment, serves the first VHF radio in the integrated avionics (POH 7-89).",
        ref: "POH 4-6",
      },
      {
        id: "2c",
        text: "Transponder Antenna (underside)",
        standard: "CONDITION AND ATTACHMENT",
        parts: ["Transponder antenna"],
        side: "any",
        system: "avionics",
        why: "The transponder antenna sits underneath, just aft of the baggage compartment bulkhead on the right side (POH 7-89).",
        ref: "POH 4-6",
      },
      {
        id: "2d",
        text: "COM 2 Antenna (underside)",
        standard: "CONDITION AND ATTACHMENT",
        parts: ["COM 2 antenna"],
        side: "any",
        system: "avionics",
        why: "COM 2's rod antenna, below the baggage compartment, serves the second VHF radio in the integrated avionics (POH 7-89).",
        ref: "POH 4-6",
      },
      {
        id: "2e",
        text: "Wing/Fuselage Fairing",
        standard: "CHECK",
        parts: ["Wing/fuselage fairing"],
        system: "airframe",
        why: "Check the fairing, like all the skin, for damage, condition and delamination (POH 4-4).",
        ref: "POH 4-6",
      },
      {
        id: "2f",
        text: "Baggage Door",
        standard: "CLOSED AND SECURE",
        parts: ["Baggage door", "Baggage door latch", "Baggage door lock"],
        system: "doors",
        why: "An unlatched baggage door can open in flight.",
        ref: "POH 4-6",
      },
      {
        id: "2g",
        text: "Static Button",
        standard: "CHECK FOR BLOCKAGE",
        parts: ["Static port (L)"],
        system: "pitot",
        why: "A blocked static port gives false altimeter, airspeed and vertical speed readings.",
        ref: "POH 4-6",
      },
      {
        id: "2h",
        text: "Parachute Cover",
        standard: "SEALED AND SECURE",
        parts: ["Parachute cover", "CAPS canister"],
        system: "caps",
        why: "The cover keeps the parachute compartment closed until the rocket deploys it.",
        ref: "POH 4-6",
      },
    ],
  },
  {
    n: 3,
    title: "Empennage",
    cam: { p: [-4.9, EYE_Y, -1.7], t: [-2.95, 0.15, 0] }, // approximate: standing viewpoint chosen on the model
    map: [-4.6, 0], // approximate: placed around the airplane as in Fig 4-1
    items: [
      {
        id: "3a",
        text: "Tiedown Rope",
        standard: "REMOVE",
        parts: ["Tail tiedown"],
        system: "airframe",
        why: "The tail is tied down by its tail ring; a rope left on holds the airplane to the ground (POH 8-12).",
        ref: "POH 4-6",
      },
      {
        id: "3b",
        text: "Horizontal and Vertical Stabilizers",
        standard: "CONDITION",
        note: "Verify tape covering the forward and aft inspection holes located on outboard ends of horizontal stabilizer is installed and securely attached.",
        parts: ["Horizontal stabilizer", "Vertical stabilizer", "Stabilizer inspection-hole tape"],
        system: "airframe",
        why: "The horizontal stabilizer is one composite structure tip to tip, and the vertical stabilizer is integral to the fuselage shell for smooth transfer of flight loads (POH 7-6).",
        ref: "POH 4-6",
      },
      {
        id: "3c",
        text: "Elevator and Tab",
        standard: "CONDITION AND MOVEMENT",
        parts: ["Elevator (left half)", "Elevator (right half)", "Elevator trim tab (ground-adjustable)"],
        system: "controls",
        why: "Free, full movement without excessive play; the cables run forward to the side yokes.",
        anim: "elevatorSweep",
        ref: "POH 4-6",
      },
      {
        id: "3d",
        text: "Rudder",
        standard: "FREEDOM OF MOVEMENT",
        parts: ["Rudder"],
        system: "controls",
        anim: "rudderSweep",
        why: "The rudder hangs on three hinge points and is cable-driven from the rudder pedals; it must move freely (POH 7-11).",
        ref: "POH 4-6",
      },
      {
        id: "3e",
        text: "Rudder Trim Tab",
        standard: "CONDITION AND SECURITY",
        parts: ["Rudder trim tab (ground-adjustable)"],
        system: "controls",
        why: "The ground-adjustable rudder tab is factory set for small adjustments in neutral trim and doesn't normally need adjusting (POH 7-11).",
        ref: "POH 4-6",
      },
      {
        id: "3f",
        text: "Attachment hinges, bolts, and cotter pins",
        standard: "SECURE",
        parts: ["Empennage hinges, bolts and cotter pins", "Elevator (left half)", "Elevator (right half)", "Rudder"],
        system: "controls",
        why: "Each elevator half has two hinge points and the rudder three; check their attachment hardware for security (POH 4-4, 7-6, 7-11).",
        ref: "POH 4-6",
      },
    ],
  },
  {
    n: 4,
    title: "Right Fuselage",
    cam: { p: [-0.7, EYE_Y, 2.3], t: [-0.15, -0.05, 0.3] }, // approximate: standing viewpoint chosen on the model
    map: [-0.9, 1.7], // approximate: placed around the airplane as in Fig 4-1
    side: "R",
    items: [
      {
        id: "4a",
        text: "Static Button",
        standard: "CHECK FOR BLOCKAGE",
        parts: ["Static port (R)"],
        system: "pitot",
        why: "A blocked static port gives false altimeter, airspeed and vertical speed readings.",
        ref: "POH 4-7",
      },
      {
        id: "4b",
        text: "Wing/Fuselage Fairings",
        standard: "CHECK",
        parts: ["Wing/fuselage fairing"],
        system: "airframe",
        why: "Check the fairings, like all the skin, for damage, condition and delamination (POH 4-4).",
        ref: "POH 4-7",
      },
      {
        id: "4c",
        text: "Door Lock",
        standard: "UNLOCK",
        parts: ["Door lock cylinder"],
        system: "doors",
        why: "A locked door can't be opened from outside to help occupants out.",
        ref: "POH 4-7",
      },
    ],
  },
  {
    n: 5,
    title: "Right Wing Trailing Edge",
    cam: { p: [-1.1, EYE_Y, 3.7], t: [0.75, -0.35, 3.3] }, // approximate: standing viewpoint chosen on the model
    map: [-0.6, 4], // approximate: placed around the airplane as in Fig 4-1
    side: "R",
    items: [
      {
        id: "5a",
        text: "Flap and Rub Strips (if installed)",
        standard: "CONDITION AND SECURITY",
        parts: ["Right flap", "Flap rub strips"],
        system: "flaps",
        why: "Each flap hangs on three hinge points, and the rub strips on its top leading edge keep it from rubbing the wing's flap cove (POH 7-22).",
        ref: "POH 4-7",
      },
      {
        id: "5b",
        text: "Aileron and Tab",
        standard: "CONDITION AND MOVEMENT",
        parts: ["Right aileron", "Aileron trim tab (ground-adjustable)"],
        system: "controls",
        anim: "aileronSweep",
        why: "The ailerons give roll control; the right one carries the factory-set ground-adjustable trim tab (POH 7-9).",
        ref: "POH 4-7",
      },
      {
        id: "5c",
        text: "Aileron Gap Seal",
        standard: "SECURITY",
        note: AILERON_BOLT_NOTE,
        parts: ["Aileron gap seal", "Aileron hinge bolt safety wire", "Right aileron"],
        system: "controls",
        why: "Each aileron hangs on two hinge points; the POH note asks you to check the bolt under its inboard edge is safety-wired (POH 4-7, 7-9).",
        ref: "POH 4-7",
      },
      {
        id: "5d",
        text: "Hinges, actuation arm, bolts, and cotter pins",
        standard: "SECURE",
        parts: ["Aileron hinge fairing", "Aileron conical drive arm", "Flap hinge bracket", "Flap hinge arm"],
        system: "controls",
        why: "The aileron is driven through a right-angle conical drive arm, and the flap hangs on three hinge points (POH 7-9, 7-22).",
        ref: "POH 4-7",
      },
    ],
  },
  {
    n: 6,
    title: "Right Wing Tip",
    cam: { p: [0.9, EYE_Y, 7.4], t: [1.2, -0.15, 5.5] }, // approximate: standing viewpoint chosen on the model
    map: [1.2, 7], // approximate: placed around the airplane as in Fig 4-1
    side: "R",
    items: [
      {
        id: "6a",
        text: "Tip",
        standard: "ATTACHMENT",
        parts: ["Wing tip", "Right wingtip: nav (green) + strobe"],
        system: "airframe",
        why: "The wing tip carries the navigation, strobe and recognition lights (POH 7-57).",
        ref: "POH 4-7",
      },
      {
        id: "6b",
        text: "Wing Tip Light and Lens",
        standard: "CONDITION AND SECURITY",
        parts: ["Right wingtip: nav (green) + strobe", "Wingtip recognition light"],
        system: "lighting",
        why: "The tip holds the navigation light with its built-in anti-collision strobe, and the recognition light on its leading edge (POH 7-57).",
        ref: "POH 4-7",
      },
      {
        id: "6c",
        text: "Fuel Vent (underside)",
        standard: "UNOBSTRUCTED",
        parts: ["NACA fuel vent"],
        system: "fuel",
        why: "A blocked vent starves the engine as the tank empties (POH 7-40).",
        crouch: true,
        ref: "POH 4-7",
      },
    ],
  },
  {
    n: 7,
    title: "Right Forward Wing and Main Gear",
    cam: { p: [3.4, EYE_Y, 2.7], t: [1.4, -0.6, 1.9] }, // approximate: standing viewpoint chosen on the model
    map: [3, 3.6], // approximate: placed around the airplane as in Fig 4-1
    side: "R",
    items: [
      {
        id: "7a",
        text: "Leading Edge and Stall Strips",
        standard: "CONDITION",
        parts: ["Right inboard stall strip", "Right outboard stall strip", "Right porous stall strip"],
        system: "airframe",
        why: "The stall strips shape how the wing stalls; damage changes the stall.",
        ref: "POH 4-7",
      },
      {
        id: "7b",
        text: "Fuel Cap",
        standard: "CHECK QUANTITY AND SECURE",
        parts: ["Filler cap"],
        system: "fuel",
        why: "Look at the fuel itself, then make sure the cap is secure.",
        ref: "POH 4-7",
      },
      {
        id: "7c",
        text: "Fuel Drains (2 underside)",
        standard: "DRAIN AND SAMPLE",
        parts: ["Tank drain", "Collector drain"],
        system: "fuel",
        why: "Sample for water, sediment and the right fuel grade before it reaches the engine.",
        anim: "drainSample",
        crouch: true,
        ref: "POH 4-7",
      },
      {
        id: "7c+",
        text: "Brake Temperature Indicator, Left Main Wheel",
        standard: "NOT DISCOLOURED",
        technique: true,
        look: "Looking across at the LEFT main wheel",
        sightFrom: "7c",
        parts: ["Brake temperature indicator"],
        side: "L",
        system: "gear",
        why: BRAKE_INDICATOR_WHY,
        crouch: true,
        // approximate: crouched just ahead of the right wing, where the line of sight to the left caliper passes under the fuselage
        eye: [2.3, CROUCH_Y, 1.55],
        ref: BRAKE_INDICATOR_REF,
      },
      {
        id: "7d",
        text: "Wheel Fairings",
        standard: "SECURITY, ACCUMULATION OF DEBRIS",
        parts: ["Wheel pant"],
        system: "gear",
        why: "The wheel pants are bolted to the gear struts; check they are secure and free of debris, snow and ice (POH 7-25, 4-4).",
        ref: "POH 4-7",
      },
      {
        id: "7e",
        text: "Tire",
        standard: "CONDITION, INFLATION, AND WEAR",
        parts: ["Main wheel"],
        system: "gear",
        why: "Each main wheel has a 15 x 6.00 x 6 tubeless tire; a door in the wheel pant gives access to check its pressure (POH 7-25).",
        ref: "POH 4-7",
      },
      {
        id: "7f",
        text: "Wheel and Brakes",
        standard: "FLUID LEAKS, EVIDENCE OF OVERHEATING, GENERAL CONDITION, AND SECURITY",
        parts: ["Main wheel hub", "Brake disc", "Brake caliper", "Brake temperature indicator"],
        system: "gear",
        why: "The brakes are hydraulic; a leak or an overheated brake shows here first.",
        see: "Indicator checked from the other side, see 11e.",
        ref: "POH 4-7",
      },
      {
        id: "7g",
        text: "Chocks and Tiedown Ropes",
        standard: "REMOVE",
        parts: ["Chocks and tiedown ropes"],
        system: "gear",
        why: "Chocks and the wing tiedown rope hold the airplane in place on the ramp, so they must be off before it moves (POH 8-12).",
        ref: "POH 4-7",
      },
    ],
  },
  {
    n: 8,
    title: "Nose, Right Side",
    cam: { p: [3.5, EYE_Y, 1.9], t: [2.55, -0.35, 0.45] }, // approximate: standing viewpoint chosen on the model
    map: [3.6, 1.6], // approximate: placed around the airplane as in Fig 4-1
    side: "R",
    items: [
      {
        id: "8a",
        text: "Vortex Generator",
        standard: "CONDITION",
        parts: ["Vortex generator"],
        system: "airframe",
        why: "Check it, like all the skin, for damage and security (POH 4-4).",
        ref: "POH 4-7",
      },
      {
        id: "8b",
        text: "Ice Inspection Light",
        standard: "CONDITION AND SECURITY",
        parts: ["Ice inspection light"],
        system: "lighting",
        why: "The ice inspection light shines on the wing and horizontal tail leading edges so you can see ice forming (AMM 30-80).",
        ref: "POH 4-7",
      },
      {
        id: "8c",
        text: "Cowling",
        standard: "ATTACHMENTS SECURE",
        parts: ["Front cowl fastener", "Cowl inlet — cooling"],
        system: "engine",
        why: "Cooling air enters the engine compartment through the two inlets in the cowling, and baffles direct it over the cylinders (POH 7-38).",
        ref: "POH 4-8",
      },
      {
        id: "8d",
        text: "Exhaust Pipe",
        standard: "CONDITION, SECURITY, AND CLEARANCE",
        parts: ["Tailpipe"],
        system: "engine",
        why: "A loose or cracked exhaust can leak hot gas into the cowling.",
        ref: "POH 4-8",
      },
    ],
  },
  {
    n: 9,
    title: "Nose Gear, Propeller, and Spinner",
    cam: { p: [5.5, EYE_Y, 0.7], t: [3.5, -0.4, 0] }, // approximate: standing viewpoint chosen on the model
    map: [5.4, 0], // approximate: placed around the airplane as in Fig 4-1
    warning: "Keep clear of propeller rotation plane. Do not allow others to approach propeller.",
    items: [
      {
        id: "9a",
        text: "Tow Bar",
        standard: "REMOVE AND STOW",
        parts: ["Tow bar"],
        system: "gear",
        why: "The steering bar fits into lugs just forward of the nose wheel axle; it stows in the rear baggage compartment (POH 8-9).",
        ref: "POH 4-8",
      },
      {
        id: "9b",
        text: "Landing Light",
        standard: "CONDITION",
        parts: ["Landing light (HID, lower cowl)"],
        system: "lighting",
        why: "The HID landing light is mounted in the lower engine cowl (POH 7-57).",
        ref: "POH 4-8",
      },
      {
        id: "9c",
        text: "Strut",
        standard: "CONDITION",
        parts: ["Nose gear strut", "Nose oleo cylinder", "Nose strut fairing"],
        system: "gear",
        why: "The nose gear is a tubular steel strut on the engine mount, with an oleo strut absorbing the shocks (POH 7-25).",
        ref: "POH 4-8",
      },
      {
        id: "9d",
        text: "Wheel Fairing",
        standard: "SECURITY, ACCUMULATION OF DEBRIS",
        parts: ["Nose wheel pant"],
        system: "gear",
        why: "Wheel fairings must be free of snow and ice accumulation and other debris (POH 4-4).",
        ref: "POH 4-8",
      },
      {
        id: "9e",
        text: "Wheel and Tire",
        standard: "CONDITION, INFLATION, AND WEAR",
        parts: ["Nose wheel"],
        system: "gear",
        why: "The nose wheel has a 5.00 x 5 tubeless tire and casters freely about 85° either side (POH 7-25).",
        ref: "POH 4-8",
      },
      {
        id: "9f",
        text: "Propeller",
        standard: "CONDITION (INDENTATIONS, NICKS, ETC.)",
        parts: ["Propeller blade"],
        system: "propeller",
        why: "A nick concentrates stress in the blade.",
        ref: "POH 4-8",
      },
      {
        id: "9g",
        text: "Spinner",
        standard: "CONDITION, SECURITY, AND OIL LEAKS",
        parts: ["Spinner"],
        system: "propeller",
        why: "The governor sets blade pitch with engine oil to a piston in the hub (POH 7-39); oil on the spinner can mean a leak.",
        ref: "POH 4-8",
      },
      {
        id: "9g+",
        text: "Front Cowl Fasteners (behind the spinner)",
        standard: "PRESENT AND SECURE",
        technique: true,
        parts: ["Front cowl fastener"],
        side: "any",
        system: "engine",
        why: "If the screws joining the upper and lower cowls at the forward inlets are not in before the engine starts, the cowl can sit out of line and the spinner can contact and damage its flanges (AMM 71-10).",
        emphasis: true,
        // approximate: in front of the spinner, clear of the propeller disc, looking aft at the fastener ring
        eye: [4.75, EYE_Y, 0.45],
        ref: "AMM 71-10, PDF 2504, 2515; Fig 71-10-2, PDF 2510",
      },
      {
        id: "9h",
        text: "Air Inlets",
        standard: "UNOBSTRUCTED",
        parts: ["Cowl inlet — cooling", "NACA induction duct"],
        system: "engine",
        why: "The engine needs its cooling air and its induction air.",
        ref: "POH 4-8",
      },
      {
        id: "9i",
        text: "Alternator",
        standard: "CONDITION",
        parts: ["ALT 1 — 100 A", "ALT 2 — 70 A"],
        system: "electrical",
        why: "ALT 1 (100 A, gear-driven, right front) and ALT 2 (70 A, belt-driven, left front) are the airplane's two alternators (POH 7-47).",
        ref: "POH 4-8",
      },
    ],
  },
  {
    n: 10,
    title: "Nose, Left Side",
    cam: { p: [3.5, EYE_Y, -1.9], t: [2.65, -0.3, -0.3] }, // approximate: standing viewpoint chosen on the model
    map: [3.6, -1.6], // approximate: placed around the airplane as in Fig 4-1
    side: "L",
    warning:
      "The engine should not be operated with less than six quarts of oil. Seven quarts (dipstick indication) is recommended for extended flights.",
    items: [
      {
        id: "10a",
        text: "Engine Oil",
        standard: "CHECK 6-8 QUARTS, LEAKS, CAP AND DOOR SECURE",
        parts: ["Oil filler cap / dipstick", "Oil filler access door"],
        system: "engine",
        why: "Oil lubricates and cools the engine and works the propeller governor.",
        anim: "dipstick",
        ref: "POH 4-8",
      },
      {
        id: "10b",
        text: "Ice Inspection Light",
        standard: "CONDITION AND SECURITY",
        parts: ["Ice inspection light"],
        system: "lighting",
        why: "The ice inspection light shines on the wing and horizontal tail leading edges so you can see ice forming (AMM 30-80).",
        ref: "POH 4-8",
      },
      {
        id: "10c",
        text: "Cowling",
        standard: "ATTACHMENTS SECURE",
        parts: ["Front cowl fastener", "Cowl inlet — cooling"],
        system: "engine",
        why: "Cooling air enters the engine compartment through the two inlets in the cowling, and baffles direct it over the cylinders (POH 7-38).",
        ref: "POH 4-8",
      },
      {
        id: "10d",
        text: "External Power",
        standard: "DOOR SECURE",
        parts: ["Ground service receptacle"],
        system: "electrical",
        why: "The ground service receptacle, just aft of the cowl on the left side, takes 28 V external power for cold starts and maintenance (POH 7-54).",
        ref: "POH 4-8",
      },
      {
        id: "10e",
        text: "Gascolator (underside)",
        standard: "DRAIN FOR 3 SECONDS, SAMPLE",
        parts: ["Gascolator", "Gascolator drain"],
        side: "R",
        system: "fuel",
        why: "The gascolator is the low point of the fuel system ahead of the engine; sample it for water and sediment.",
        anim: "drainSample",
        crouch: true,
        ref: "POH 4-8",
      },
      {
        id: "10f",
        text: "Vortex Generator",
        standard: "CONDITION",
        parts: ["Vortex generator"],
        system: "airframe",
        why: "Check it, like all the skin, for damage and security (POH 4-4).",
        ref: "POH 4-8",
      },
      {
        id: "10g",
        text: "Exhaust Pipe",
        standard: "CONDITION, SECURITY, AND CLEARANCE",
        parts: ["Tailpipe"],
        system: "engine",
        why: "A loose or cracked exhaust can leak hot gas into the cowling.",
        ref: "POH 4-8",
      },
    ],
  },
  {
    n: 11,
    title: "Left Main Gear and Forward Wing",
    cam: { p: [3.4, EYE_Y, -2.7], t: [1.4, -0.6, -1.9] }, // approximate: standing viewpoint chosen on the model
    map: [3, -3.6], // approximate: placed around the airplane as in Fig 4-1
    side: "L",
    items: [
      {
        id: "11a",
        text: "Wheel Fairings",
        standard: "SECURITY, ACCUMULATION OF DEBRIS",
        parts: ["Wheel pant"],
        system: "gear",
        why: "The wheel pants are bolted to the gear struts; check they are secure and free of debris, snow and ice (POH 7-25, 4-4).",
        ref: "POH 4-9",
      },
      {
        id: "11b",
        text: "Tire",
        standard: "CONDITION, INFLATION, AND WEAR",
        parts: ["Main wheel"],
        system: "gear",
        why: "Each main wheel has a 15 x 6.00 x 6 tubeless tire; a door in the wheel pant gives access to check its pressure (POH 7-25).",
        ref: "POH 4-9",
      },
      {
        id: "11c",
        text: "Wheel and Brakes",
        standard: "FLUID LEAKS, EVIDENCE OF OVERHEATING, GENERAL CONDITION, AND SECURITY",
        parts: ["Main wheel hub", "Brake disc", "Brake caliper", "Brake temperature indicator"],
        system: "gear",
        why: "The brakes are hydraulic; a leak or an overheated brake shows here first.",
        see: "Indicator checked from the other side, see 7c.",
        ref: "POH 4-9",
      },
      {
        id: "11d",
        text: "Chocks and Tiedown Ropes",
        standard: "REMOVE",
        parts: ["Chocks and tiedown ropes"],
        system: "gear",
        why: "Chocks and the wing tiedown rope hold the airplane in place on the ramp, so they must be off before it moves (POH 8-12).",
        ref: "POH 4-9",
      },
      {
        id: "11e",
        text: "Fuel Drains (2 underside)",
        standard: "DRAIN AND SAMPLE",
        parts: ["Tank drain", "Collector drain"],
        system: "fuel",
        why: "Sample for water, sediment and the right fuel grade before it reaches the engine.",
        anim: "drainSample",
        crouch: true,
        ref: "POH 4-9",
      },
      {
        id: "11e+",
        text: "Brake Temperature Indicator, Right Main Wheel",
        standard: "NOT DISCOLOURED",
        technique: true,
        look: "Looking across at the RIGHT main wheel",
        sightFrom: "11e",
        parts: ["Brake temperature indicator"],
        side: "R",
        system: "gear",
        why: BRAKE_INDICATOR_WHY,
        crouch: true,
        // approximate: crouched just ahead of the left wing, where the line of sight to the right caliper passes under the fuselage
        eye: [2.3, CROUCH_Y, -1.55],
        ref: BRAKE_INDICATOR_REF,
      },
      {
        id: "11f",
        text: "Fuel Cap",
        standard: "CHECK QUANTITY AND SECURE",
        parts: ["Filler cap"],
        system: "fuel",
        why: "Look at the fuel itself, then make sure the cap is secure.",
        ref: "POH 4-9",
      },
      {
        id: "11g",
        text: "Leading Edge and Stall Strips",
        standard: "CONDITION",
        parts: ["Left inboard stall strip", "Left outboard stall strip", "Left porous stall strip"],
        system: "airframe",
        why: "The stall strips shape how the wing stalls; damage changes the stall.",
        ref: "POH 4-9",
      },
    ],
  },
  {
    n: 12,
    title: "Left Wing Tip",
    cam: { p: [2.5, EYE_Y, -7.1], t: [1.3, -0.2, -5.4] }, // approximate: standing viewpoint chosen on the model
    map: [1.2, -7], // approximate: placed around the airplane as in Fig 4-1
    side: "L",
    items: [
      {
        id: "12a",
        text: "Fuel Vent (underside)",
        standard: "UNOBSTRUCTED",
        parts: ["NACA fuel vent"],
        system: "fuel",
        why: "A blocked vent starves the engine as the tank empties (POH 7-40).",
        crouch: true,
        ref: "POH 4-9",
      },
      {
        id: "12b",
        text: "Pitot Probe",
        standard: "COVER REMOVED, UNOBSTRUCTED",
        parts: ["Heated pitot tube", "Pitot mast"],
        system: "pitot",
        why: "A covered or blocked pitot probe means no airspeed.",
        ref: "POH 4-9",
      },
      {
        id: "12c",
        text: "Wing Tip Light and Lens",
        standard: "CONDITION AND SECURITY",
        parts: ["Left wingtip: nav (red) + strobe", "Wingtip recognition light"],
        system: "lighting",
        why: "The tip holds the navigation light with its built-in anti-collision strobe, and the recognition light on its leading edge (POH 7-57).",
        ref: "POH 4-9",
      },
      {
        id: "12d",
        text: "Tip",
        standard: "ATTACHMENT",
        parts: ["Wing tip", "Left wingtip: nav (red) + strobe"],
        system: "airframe",
        why: "The wing tip carries the navigation, strobe and recognition lights (POH 7-57).",
        ref: "POH 4-9",
      },
    ],
  },
  {
    n: 13,
    title: "Left Wing Trailing Edge",
    cam: { p: [-1.1, EYE_Y, -3.7], t: [0.75, -0.35, -3.3] }, // approximate: standing viewpoint chosen on the model
    map: [-0.6, -4], // approximate: placed around the airplane as in Fig 4-1
    side: "L",
    note: AILERON_BOLT_NOTE,
    items: [
      {
        id: "13a",
        text: "Hinges, actuation arm, bolts, and cotter pins",
        standard: "SECURE",
        parts: ["Aileron hinge fairing", "Flap hinge bracket", "Aileron hinge bolt safety wire"],
        system: "controls",
        why: "Each aileron hangs on two hinge points and each flap on three; the bolt under the aileron's inboard edge must be safety-wired (POH 4-9, 7-9, 7-22).",
        ref: "POH 4-9",
      },
      {
        id: "13b",
        text: "Aileron Gap Seal",
        standard: "SECURITY",
        parts: ["Aileron gap seal", "Left aileron"],
        system: "controls",
        why: "The gap seal is checked with the aileron, which hangs on two hinge points on the wing shear web (POH 7-9).",
        ref: "POH 4-9",
      },
      {
        id: "13c",
        text: "Aileron",
        standard: "FREEDOM OF MOVEMENT",
        parts: ["Left aileron"],
        system: "controls",
        anim: "aileronSweep",
        why: "The left aileron is cable-driven from the yokes through a conical drive arm in the wing and must move freely (POH 7-9).",
        ref: "POH 4-9",
      },
      {
        id: "13d",
        text: "Flap and Rub Strips (if installed)",
        standard: "CONDITION AND SECURITY",
        parts: ["Left flap", "Flap rub strips"],
        system: "flaps",
        why: "Each flap hangs on three hinge points, and the rub strips on its top leading edge keep it from rubbing the wing's flap cove (POH 7-22).",
        ref: "POH 4-9",
      },
    ],
  },
];
