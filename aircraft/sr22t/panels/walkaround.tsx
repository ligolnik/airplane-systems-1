"use client";
/**
 * Guided preflight walk-around panel (POH 13772-007 4-4 – 4-9, Figure 4-1). Replaces the system panel while open: on
 * desktops it sits in the right-hand panel, on phones under a shortened 3D view. Each item flies the camera to its station
 * and then to the item's parts, highlights them, dims the rest and shows the item's system in X-ray.
 */
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useTicker } from "@/components/ui/controls";
import { revealStage, useView } from "@/lib/view";
import { SYS } from "../systems";
import {
  beginWalk,
  closeWalk,
  elapsed,
  goStep,
  markStep,
  resetWalk,
  resumeWalk,
  setBig,
  useWalk,
  walkNow,
  type WalkPhase,
} from "../walk-store";
import { clock, loadProgress, MAP_MARK_R, sightLine, stepParts, stepPose, stepSide, tally, type Step } from "../walk";
import {
  COLD_WEATHER,
  GENERAL_WARNING,
  NEXT_CHECKLIST,
  NOT_MODELLED,
  SOURCE,
  TECHNIQUE_BADGE,
  THROUGHOUT,
  WALK,
  WARNING_CONSEQUENCE,
} from "../walkaround";
import "./walkaround.css";

const NOTICE = "Study aid, not a substitute for the POH checklist.";

/** Wait after flying to a station before framing the item, ms (the camera flight takes 1 s). */
const STATION_SETTLE_MS = 1100;

/** Keep the screen awake while the walk-around is open; a refusal (or no Wake Lock support) is ignored. */
function useWakeLock() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } }).wakeLock;
    if (!wl) return;
    let lock: Sentinel | null = null,
      live = true;
    const request = () => {
      if (document.visibilityState !== "visible") return;
      wl.request("screen").then(
        (l) => {
          if (live) lock = l;
          else l.release().catch(() => {});
        },
        () => {},
      );
    };
    request();
    // the browser drops the lock when the page is hidden; take it again on return
    document.addEventListener("visibilitychange", request);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", request);
      lock?.release().catch(() => {});
    };
  }, []);
}

/** Camera, highlight, X-ray system and the cabin station's switches for the current step. */
function useStepScene(step: Step | undefined, phase: WalkPhase) {
  const last = useRef<number | null>(null);
  useEffect(() => {
    const { flyTo } = useView.getState();
    if (!step) {
      // intro and resume: the first station's view; finished: the whole airplane
      useView.setState({ spot: null, sys: "overview" });
      const [p, t] = phase === "done" ? SYS[0].cam : [WALK[0].cam.p, WALK[0].cam.t];
      flyTo(p, t);
      last.current = null;
      return;
    }
    useView.setState({
      sys: step.item.system ?? "overview",
      spot: { names: stepParts(step).shown, side: stepSide(step) },
      focus: null,
    });
    const pose = stepPose(step);
    if (last.current === step.station.n) {
      flyTo(pose.p, pose.t);
      return;
    }
    // a new station: walk to it first, then look at the item
    last.current = step.station.n;
    flyTo(step.station.cam.p, step.station.cam.t);
    const t = setTimeout(() => useView.getState().flyTo(pose.p, pose.t), STATION_SETTLE_MS);
    return () => clearTimeout(t);
  }, [step, phase]);
}

/** Arrow keys step through the items, unless a form control has focus. */
function useArrowKeys(walking: boolean, at: number) {
  useEffect(() => {
    if (!walking) return;
    const onKey = (e: KeyboardEvent) => {
      const a = document.activeElement;
      if (a instanceof HTMLInputElement || a instanceof HTMLSelectElement || a instanceof HTMLTextAreaElement) return;
      if (document.querySelector(".tour")) return; // the welcome tour has the arrows
      if (e.key === "ArrowRight") goStep(at + 1);
      else if (e.key === "ArrowLeft") goStep(at - 1);
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [walking, at]);
}

/** A horizontal swipe on the card: left for the next item, right for the previous. */
function useSwipe(at: number) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current,
        t = e.changedTouches[0];
      start.current = null;
      if (!s || !t) return;
      const dx = t.clientX - s.x,
        dy = t.clientY - s.y;
      // approximate: swipe thresholds are a feel choice (60 px, mostly horizontal)
      if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) goStep(dx < 0 ? at + 1 : at - 1);
    },
  };
}

/** Top-down outline with the 13 stations placed as in Figure 4-1, nose up; tap a number to go there. */
function MiniMap({ steps, at, marks }: { steps: Step[]; at: number; marks: Record<string, string> }) {
  const cur = steps[at]?.station.n;
  // airplane [x, z] → map: right wing to the right, nose up
  const px = (z: number) => z * 10,
    py = (x: number) => -x * 10;
  // an item checked from somewhere else: the line of sight from where the pilot stands
  const step = steps[at];
  const sight = useMemo(() => (step ? sightLine(step) : null), [step]);
  return (
    <svg className="walk-map" viewBox="-80 -64 160 120" role="group" aria-label="Walk-around stations (POH Figure 4-1)">
      <title>SR22T from above, nose up</title>
      <path
        d="M-3.5,-37 L-6,-30 L-6.5,-18 L-6.5,26 L-1.5,34 L1.5,34 L6.5,26 L6.5,-18 L6,-30 L3.5,-37 Z"
        className="fus"
      />
      <path
        d="M-6.5,-18.4 L-58.4,-16.7 L-58.4,-8.5 L-6.5,-4 Z M6.5,-18.4 L58.4,-16.7 L58.4,-8.5 L6.5,-4 Z M-18.6,23 L18.6,23 L18.6,31 L-18.6,31 Z"
        className="wing"
      />
      {WALK.map((st) => {
        const [x, z] = st.map,
          own = steps.filter((s) => s.station.n === st.n),
          done = own.length > 0 && own.every((s) => marks[s.item.id]);
        return (
          <g
            key={st.n}
            className={`stn${st.n === cur ? " cur" : ""}${done ? " done" : ""}`}
            transform={`translate(${px(z)},${py(x)})`}
            role="button"
            tabIndex={0}
            aria-label={`Station ${st.n}: ${st.title}${done ? ", done" : ""}`}
            aria-current={st.n === cur ? "step" : undefined}
            onClick={() => goStep(steps.findIndex((s) => s.station.n === st.n))}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              goStep(steps.findIndex((s) => s.station.n === st.n));
            }}
          >
            <circle r={MAP_MARK_R * 10} />
            <text dy="3.4">{done ? "✓" : st.n}</text>
          </g>
        );
      })}
      {/* drawn over the markers, which it may cross (station 1 sits between the main wheels) */}
      {sight && (
        <g className="sight" aria-label="Line of sight">
          <line x1={px(sight[0].z)} y1={py(sight[0].x)} x2={px(sight[1].z)} y2={py(sight[1].x)} />
          <circle cx={px(sight[1].z)} cy={py(sight[1].x)} r={2.2} />
        </g>
      )}
    </svg>
  );
}

function Shell({ children, big }: { children: ReactNode; big: boolean }) {
  return (
    <div className={`walk${big ? " walk-big" : ""}`}>
      <div className="walk-hd">
        <span className="walk-title">Preflight walk-around</span>
        <button type="button" className="walk-x" onClick={closeWalk} aria-label="Exit the walk-around">
          Exit
        </button>
      </div>
      {children}
      <div className="walk-ft">
        <label className="walk-opt">
          <input type="checkbox" checked={big} onChange={(e) => setBig(e.target.checked)} /> Larger text
        </label>
        <span className="walk-src">{SOURCE}</span>
      </div>
    </div>
  );
}

function Intro() {
  const from = useWalk((x) => x.from);
  return (
    <>
      <p className="walk-notice" role="note">
        <b>{NOTICE}</b> Follow the POH/AFM for your serial number; this walk-through shows where each item is and why it
        matters.
      </p>
      <div className="walk-warn" role="note">
        <b>Warning</b>
        <p>{GENERAL_WARNING}</p>
        <p>Throughout the walk-around:</p>
        <ul>
          {THROUGHOUT.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <ul>
          {COLD_WEATHER.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p>{WARNING_CONSEQUENCE}</p>
      </div>
      <div className="walk-actions">
        <button type="button" className="walk-go" onClick={beginWalk}>
          {from > 1 ? `Begin at station ${from}` : "Begin walk-around"}
        </button>
      </div>
    </>
  );
}

function Resume() {
  const saved = loadProgress();
  const { steps } = walkNow();
  const step = steps.find((s) => s.item.id === saved?.at);
  return (
    <>
      <p className="walk-notice" role="note">
        <b>{NOTICE}</b>
      </p>
      <h3 className="walk-q">Resume walk-around?</h3>
      {step && (
        <p>
          You stopped at station {step.station.n}, {step.station.title}: item {step.item.id} {step.item.text}.
        </p>
      )}
      <div className="walk-actions">
        <button type="button" className="walk-go" onClick={resumeWalk}>
          Resume
        </button>
        <button type="button" className="btn" onClick={resetWalk}>
          Start over
        </button>
      </div>
    </>
  );
}

export function Item({ step, at, steps }: { step: Step; at: number; steps: Step[] }) {
  const marks = useWalk((x) => x.marks);
  const swipe = useSwipe(at);
  const { station, item } = step;
  const own = steps.filter((s) => s.station.n === station.n);
  const k = own.indexOf(step) + 1;
  const missing = stepParts(step).missing;
  const mark = marks[item.id];
  return (
    <div className="walk-item" {...swipe}>
      <div className="walk-prog" aria-live="polite">
        Station {station.n} of {WALK.length} · item {k} of {own.length}
      </div>
      <div
        className="walk-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={at + 1}
      >
        <i style={{ width: `${((at + 1) / steps.length) * 100}%` }} />
      </div>
      <MiniMap steps={steps} at={at} marks={marks} />
      <h3 className="walk-stn">
        {station.n}. {station.title}
      </h3>
      {station.warning && (
        <p className={`walk-alert ${station.n === 10 ? "caution" : "warning"}`} role="note">
          <b>{station.n === 10 ? "Caution" : "Warning"}</b> {station.warning}
        </p>
      )}
      {station.note && k === 1 && (
        <p className="walk-note" role="note">
          <b>Note</b> {station.note}
        </p>
      )}
      <div className="walk-card">
        <div className="walk-line">
          <span className="walk-id">{item.id}</span>
          <span className="walk-text">{item.text}</span>
          {mark && <span className={`walk-mark ${mark}`}>{mark === "ok" ? "✓ Checked" : "Skipped"}</span>}
        </div>
        {item.technique && <span className="walk-tech">{TECHNIQUE_BADGE}</span>}
        <div className="walk-std">{item.standard}</div>
        {item.look && <p className="walk-look">{item.look}</p>}
        {item.steps && (
          <ol className="walk-steps">
            {item.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
        {item.note && (
          <p className="walk-note">
            <b>Note</b> {item.note}
          </p>
        )}
        {item.why && <p className="walk-why">{item.why}</p>}
        {item.see && <p className="walk-see">{item.see}</p>}
        {missing.length > 0 && (
          <p className="walk-nm">Not in the 3D model: {missing.map((n) => `${n} (${NOT_MODELLED[n]})`).join("; ")}</p>
        )}
        <span className="walk-ref">{item.ref}</span>
      </div>
      <div className="walk-actions">
        <button
          type="button"
          className="walk-nav"
          onClick={() => goStep(at - 1)}
          disabled={at === 0}
          aria-label="Previous item"
        >
          ←
        </button>
        <button type="button" className="btn walk-skip" onClick={() => markStep("skip")}>
          Skip
        </button>
        <button type="button" className="walk-go" onClick={() => markStep("ok")}>
          ✓ Checked
        </button>
        <button
          type="button"
          className="walk-nav"
          onClick={() => goStep(at + 1)}
          disabled={at === steps.length - 1}
          aria-label="Next item"
        >
          →
        </button>
      </div>
      <details className="walk-through">
        <summary>Throughout the walk-around</summary>
        <ul>
          {THROUGHOUT.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <span className="walk-ref">POH 4-4</span>
      </details>
    </div>
  );
}

function Done({ steps }: { steps: Step[] }) {
  const w = useWalk();
  const n = tally(steps, w.marks);
  return (
    <div className="walk-done">
      <h3 className="walk-q">Walk-around complete</h3>
      <dl className="walk-sum">
        <dt>Checked</dt>
        <dd>{n.ok}</dd>
        <dt>Skipped</dt>
        <dd>{n.skip}</dd>
        {n.open > 0 && (
          <>
            <dt>Not marked</dt>
            <dd>{n.open}</dd>
          </>
        )}
        {n.tech.of > 0 && (
          <>
            <dt>Technique items</dt>
            <dd>
              {n.tech.ok} of {n.tech.of} checked
            </dd>
          </>
        )}
        <dt>Time</dt>
        <dd>{clock(elapsed(w))}</dd>
      </dl>
      <p className="walk-next">
        Next: <b>{NEXT_CHECKLIST.title}</b> checklist, {NEXT_CHECKLIST.ref}.
      </p>
      <p className="walk-notice" role="note">
        <b>{NOTICE}</b>
      </p>
      <div className="walk-actions">
        <button type="button" className="btn" onClick={() => goStep(steps.length - 1)}>
          Review items
        </button>
        <button type="button" className="btn" onClick={resetWalk}>
          Reset
        </button>
        <button type="button" className="walk-go" onClick={closeWalk}>
          Exit
        </button>
      </div>
    </div>
  );
}

/** The walk-around in the side panel (desktop) or under the 3D view (phone). */
export function WalkPanel() {
  const phase = useWalk((x) => x.phase),
    at = useWalk((x) => x.at),
    big = useWalk((x) => x.big);
  useTicker(1000);
  useWakeLock();
  const { steps } = walkNow();
  const walking = phase === "walk";
  const step = walking ? steps[at] : undefined;
  useStepScene(step, phase);
  useArrowKeys(walking, at);
  // phones: the card is below the view, so keep the view in sight when the step changes
  useEffect(revealStage, [at, phase]);
  return (
    <Shell big={big}>
      {phase === "intro" ? (
        <Intro />
      ) : phase === "resume" ? (
        <Resume />
      ) : phase === "done" ? (
        <Done steps={steps} />
      ) : step ? (
        <Item step={step} at={at} steps={steps} />
      ) : null}
    </Shell>
  );
}
