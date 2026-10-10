"use client";
import { useTicker } from "@/components/ui/controls";
import type { AircraftDef, ModelRefs } from "../types";
import { GROUND_Y, inFus } from "./geometry";
import { casMessages, live } from "./model";
import { Model } from "./Airplane";
import { Parachute, capsPhase } from "./Parachute";
import { CAT } from "./parts";
import { Caps } from "./panels/caps";
import { Electrical } from "./panels/electrical";
import { Controls, Flaps, Gear } from "./panels/flight";
import { Airframe, Avionics, Cabin, Doors, Lighting, Overview } from "./panels/general";
import { Oxygen } from "./panels/oxygen";
import { Engine, Fuel, Propeller } from "./panels/powerplant";
import { Ice } from "./panels/ice";
import { Environment, Pitot } from "./panels/air";
import { resetCaps, useSR22T } from "./store";
import { CAPS_CAM, SYS } from "./systems";
import { simTick } from "./tick";
import { useView } from "@/lib/view";
import { WalkPanel } from "./panels/walkaround";
import { WalkMarker } from "./WalkMarker";
import { bootWalk, closeWalk, openWalk } from "./walk-store";

/** CAPS timeline readout in the viewport while the CAPS view is open. */
function CapsHud() {
  useTicker(100);
  const sys = useView((x) => x.sys);
  if (sys !== "caps") return null;
  const t = Math.max(0, live.capsT),
    [, title, sub] = live.capsT < 0 ? [0, "Ready", ""] : capsPhase(t);
  return (
    <div className="caps-hud">
      <span>T + {t.toFixed(1)} s</span>
      <b>{title}</b>
      <span className="sub">{sub}</span>
    </div>
  );
}

/** Scene effects: the CAPS deployment and the walk-around's item marker. */
function Overlay(refs: ModelRefs) {
  return (
    <>
      <Parachute {...refs} />
      <WalkMarker />
    </>
  );
}

function useAlerts() {
  const s = useSR22T((x) => x.s),
    E = useSR22T((x) => x.E);
  const powered = E.pfd || E.mfd;
  return { powered, msgs: powered ? casMessages(s, E) : [] };
}

export const SR22T: AircraftDef = {
  id: "sr22t",
  short: "SR22T",
  name: "SR22T G6",
  sub: "Perspective+ · GFC 700 · TSIO-550-K",
  doc: "POH §7",
  systems: SYS,
  groundY: GROUND_Y,
  pivotX: 1,
  Model,
  Overlay,
  panels: {
    overview: Overview,
    airframe: Airframe,
    doors: Doors,
    controls: Controls,
    flaps: Flaps,
    gear: Gear,
    engine: Engine,
    propeller: Propeller,
    fuel: Fuel,
    electrical: Electrical,
    lighting: Lighting,
    environment: Environment,
    pitot: Pitot,
    ice: Ice,
    avionics: Avionics,
    cabin: Cabin,
    oxygen: Oxygen,
    caps: Caps,
  },
  tick: simTick,
  useAlerts,
  alertTitle: "CAS",
  Hud: CapsHud,
  onSelect: (to) => {
    if (to !== "caps" && useSR22T.getState().s.capsOn) resetCaps();
  },
  labels: { cat: CAT, inside: inFus },
  resetCam: () => (useSR22T.getState().s.capsOn ? CAPS_CAM : null),
  walk: { Panel: WalkPanel, open: () => openWalk(), close: closeWalk, boot: bootWalk },
};
