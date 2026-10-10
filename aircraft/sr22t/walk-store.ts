"use client";
/**
 * Guided preflight walk-around state (POH 4-4 – 4-9; data in walkaround.ts, logic in walk.ts). Opening it remembers the
 * airplane's systems state, its animated values (flap angle and the rest of `live`) and the view, camera framing included;
 * closing it puts all of them back exactly. While it is open the cabin station drives the SR22T model through the items'
 * `sim` steps, and the progress is saved (when storage allows) so a walk can be resumed.
 */
import { create } from "zustand";
import { aircraft, selectAircraft, sysOf } from "@/lib/fleet";
import { toVec3 } from "@/lib/math";
import { view as scene } from "@/lib/registry";
import { useView, type CamRequest, type View } from "@/lib/view";
import { FLAP_DEG, live, type Elec, type Sim } from "./model";
import { useSR22T } from "./store";
import {
  flapsAt,
  loadProgress,
  rampState,
  saveProgress,
  simAt,
  stationStart,
  walkParam,
  walkSteps,
  type Progress,
  type Step,
} from "./walk";

export type WalkPhase = "intro" | "resume" | "walk" | "done";
export interface WalkState {
  phase: WalkPhase;
  /** Current step index into `walkNow().steps`. */
  at: number;
  marks: Progress["marks"];
  /** Walking time banked before `since`, ms. */
  ms: number;
  /** performance.now() when the current timing run started; null while not walking. */
  since: number | null;
  /** Station the intro's Begin goes to. */
  from: number;
  /** Larger text, for use at the airplane. */
  big: boolean;
}

const BIG_KEY = "sr22t-walkaround-big";
const readBig = () => {
  try {
    return localStorage.getItem(BIG_KEY) === "1";
  } catch {
    return false;
  }
};

export const useWalk = create<WalkState>(() => ({
  phase: "intro",
  at: 0,
  marks: {},
  ms: 0,
  since: null,
  from: 1,
  big: false,
}));

type ViewKeep = Pick<View, "sys" | "xray" | "labels" | "spin" | "ctrlFocus" | "focus" | "hover" | "cam">;
type Live = typeof live;
/** What opening the walk-around changed, to put back on close; and the steps for the equipment fitted. */
let prior: { s: Sim; E: Elec; live: Live; view: ViewKeep } | null = null;
let steps: Step[] = [];

/** The steps of the open walk-around, and the airplane state it started from. */
export const walkNow = () => ({ steps, prior: prior?.s ?? null });

const now = () => performance.now();
/** Walking time so far, ms. */
export const elapsed = (w: WalkState) => w.ms + (w.since === null ? 0 : now() - w.since);

function persist() {
  const w = useWalk.getState();
  if (w.phase !== "walk" && w.phase !== "done") return;
  const step = steps[w.at];
  if (step)
    saveProgress({ v: 1, at: step.item.id, marks: w.marks, ms: Math.round(elapsed(w)), done: w.phase === "done" });
}

/** The camera as the user left it (the live orbit, which may have moved since the last request), else the last request. */
function framing(cam: CamRequest | null): CamRequest | null {
  const { camera, target } = scene;
  if (!camera || !target) return cam;
  return { p: toVec3(camera.position), t: toVec3(target), id: cam?.id ?? 0, exact: true };
}

/** Put `live` back to a snapshot, keeping its nested objects (the tick holds on to them). */
function restoreLive(from: Live) {
  for (const k of Object.keys(from) as (keyof Live)[]) {
    const v = from[k];
    if (v && typeof v === "object") Object.assign(live[k] as object, v);
    else (live as Record<string, unknown>)[k] = v;
  }
}

/** Put the SR22T model in `s` (the solution is recomputed). */
const setSim = (s: Sim) =>
  useSR22T.getState().update((d) => {
    Object.assign(d, s);
  });

/**
 * Open the walk-around: at station `n` (deep link `/sr22t?walk=n`, after the intro), else offering to resume saved
 * progress, else at the intro.
 */
export function openWalk(n?: number) {
  if (useView.getState().walking) {
    if (n) useWalk.setState({ phase: "intro", from: n });
    return;
  }
  if (useView.getState().ac !== "sr22t") selectAircraft("sr22t");
  const v = useView.getState(),
    { s, E } = useSR22T.getState();
  prior = {
    s,
    E,
    live: structuredClone(live),
    view: {
      sys: v.sys,
      xray: v.xray,
      labels: v.labels,
      spin: v.spin,
      ctrlFocus: v.ctrlFocus,
      focus: v.focus,
      hover: v.hover,
      cam: framing(v.cam),
    },
  };
  steps = walkSteps(s);
  const saved = n ? null : loadProgress();
  const resumable = !!saved && !saved.done && steps.some((x) => x.item.id === saved.at);
  useWalk.setState({
    phase: resumable ? "resume" : "intro",
    from: n ?? 1,
    at: 0,
    marks: {},
    ms: 0,
    since: null,
    big: readBig(),
  });
  useView.setState({
    walking: true,
    xray: true,
    labels: false,
    spin: false,
    ctrlFocus: "all",
    hover: null,
    focus: null,
    spot: null,
  });
  setSim(rampState(s));
  live.flapAng = FLAP_DEG[0];
}

/**
 * Leave the walk-around: progress is saved, and the airplane state, its animated values and the view (camera framing,
 * focus and hover included) go back to what they were; only the display toggles when another airplane is now shown.
 */
export function closeWalk() {
  if (!useView.getState().walking) return;
  persist();
  useWalk.setState({ since: null });
  const p = prior;
  prior = null;
  const { sys, focus, hover, cam, ...toggles } = p?.view ?? { sys: "overview" as const, cam: null };
  const here = useView.getState().ac === "sr22t";
  useView.setState({
    walking: false,
    spot: null,
    focus: null,
    hover: null,
    ...toggles,
    ...(here ? { sys, focus, hover } : {}),
  });
  if (!p) return;
  useSR22T.setState({ s: p.s, E: p.E });
  restoreLive(p.live);
  if (!here) return;
  // back to the user's own framing; with none recorded, the system's view
  if (cam) useView.setState({ cam });
  else {
    const [cp, ct] = sysOf(aircraft("sr22t"), sys).cam;
    useView.getState().flyTo(cp, ct);
  }
}

// switching to another airplane ends the walk-around
useView.subscribe((v) => {
  if (v.walking && v.ac !== "sr22t") closeWalk();
});

/** Page load: `?walk=n` opens station n (and leaves the address bar); otherwise unfinished saved progress is offered. */
export function bootWalk(search: string) {
  const n = walkParam(search);
  if (n) {
    const q = new URLSearchParams(search);
    q.delete("walk");
    const rest = q.toString();
    try {
      history.replaceState(null, "", location.pathname + (rest ? "?" + rest : ""));
    } catch {}
    openWalk(n);
    return;
  }
  const saved = loadProgress();
  if (saved && !saved.done) openWalk();
}

/** Start walking at the intro's station, with no marks. */
export function beginWalk() {
  const at = Math.max(0, stationStart(steps, useWalk.getState().from));
  useWalk.setState({ phase: "walk", at, marks: {}, ms: 0, since: now() });
  persist();
}

/** Carry on from the saved progress. */
export function resumeWalk() {
  const saved = loadProgress(),
    at = saved ? steps.findIndex((x) => x.item.id === saved.at) : -1;
  if (!saved || at < 0) return beginWalk();
  useWalk.setState({ phase: "walk", at, marks: saved.marks, ms: saved.ms, since: now() });
}

/** Forget the saved progress and go back to the intro. */
export function resetWalk() {
  saveProgress(null);
  useWalk.setState({ phase: "intro", from: 1, at: 0, marks: {}, ms: 0, since: null });
  if (prior) setSim(rampState(prior.s));
}

/** Go to step `i` (clamped). */
export function goStep(i: number) {
  const w = useWalk.getState();
  if (w.phase !== "walk" && w.phase !== "done") return;
  const at = Math.max(0, Math.min(i, steps.length - 1));
  useWalk.setState({ phase: "walk", at, since: w.since ?? now() });
  persist();
}

/** Mark the current item checked or skipped and move on; the last item finishes the walk. */
export function markStep(kind: "ok" | "skip") {
  const w = useWalk.getState();
  if (w.phase !== "walk") return;
  const marks = { ...w.marks, [steps[w.at].item.id]: kind };
  if (w.at >= steps.length - 1) {
    useWalk.setState({ marks, phase: "done", ms: elapsed(w), since: null });
    persist();
  } else {
    useWalk.setState({ marks });
    goStep(w.at + 1);
  }
}

export function setBig(big: boolean) {
  useWalk.setState({ big });
  try {
    localStorage.setItem(BIG_KEY, big ? "1" : "0");
  } catch {}
}

/**
 * Model state for the current step: the ramp state plus the cabin station's switches up to it (walk.ts simAt), and the
 * flaps where that leaves them (walk.ts flapsAt), so a jump, a resume or a step back shows the same airplane as walking
 * there item by item.
 */
function applyStepSim(was: WalkState) {
  const w = useWalk.getState();
  if (!prior || !useView.getState().walking) return;
  const on = w.phase === "walk" || w.phase === "done";
  setSim(on ? simAt(prior.s, steps, w.at) : rampState(prior.s));
  const next = on && (was.phase === "walk" || was.phase === "done") && w.at === was.at + 1;
  live.flapAng = flapsAt(prior.s, steps, on ? w.at : -1, next && useSR22T.getState().E.flapsPwr);
}
// stepping forward or back (or starting over) puts the switches where that step leaves them
useWalk.subscribe((w, was) => {
  if (w.at !== was.at || w.phase !== was.phase) applyStepSim(was);
});
