/**
 * Per-frame part animations shared by every airplane (`PartAnim`s for the parts catalogue). Each takes getters into the
 * airplane's own store or `live` values, so the same kind of part behaves the same way in every airplane.
 */
import type * as THREE from "three";
import type { PartAnim, PartSpec } from "./catalogue";
import { mats } from "./materials";
import type { SysId } from "./systems";
import { useView } from "./view";

export const sysNow = () => useView.getState().sys;
const inView = (views: readonly SysId[]) => views.includes(sysNow());

/** Apply live motion/colour, then enforce the scene's focus, visibility and material policy. */
export function animatePart(
  mesh: THREE.Mesh,
  t: number,
  spec: Pick<PartSpec, "anim" | "plate">,
  appearance: { material: THREE.Material; active: boolean; focused: boolean; ghost: boolean },
) {
  // Start from the current view, not last frame's animation material. Motion-only animations leave this alone.
  mesh.material = appearance.material;
  spec.anim?.(mesh, t);
  if (appearance.focused || !appearance.active || appearance.ghost || spec.plate) mesh.material = appearance.material;
  // A locator must also reveal parts whose animation hides them, such as an unfitted control lock.
  if (appearance.focused) mesh.visible = true;
}

/** Views where engine parts are shown live (spark plugs flashing, magnetos lit): the same in every airplane. */
const ENGINE_VIEWS: readonly SysId[] = ["overview", "engine", "propeller"];
const GEAR_VIEWS: readonly SysId[] = ["overview", "gear"];

/** Lit (`hot`) when `on()` in the given systems' views (and the Overview); Part owns dimming and focus. */
export const glowAnim =
  (color: string, on: () => boolean, sys: SysId[], hot = "#FFD34D"): PartAnim =>
  (m) => {
    const v = sysNow(),
      show = v === "overview" || sys.includes(v);
    m.material = show && on() ? mats(hot).hi : mats(color).on;
  };

/**
 * Push-pull knob on the panel (x forward): `inFrac()` 1 = pushed full in, at `x0`; 0 = pulled full out, `travel` m aft.
 * E.g. FUEL SHUTOFF in = ON, CABIN HT out = heat, throttle in = open.
 */
export const pushPull =
  (x0: number, inFrac: () => number, travel = 0.05): PartAnim =>
  (m) => {
    m.position.x = x0 - (1 - inFrac()) * travel;
  };

/** The ignition switch position `key` fires magneto `mag` (BOTH, START or that magneto), and the magneto isn't `failed`. */
export const magFires = (mag: "L" | "R", key: string, failed = false) =>
  (key === "BOTH" || key === "START" || key === mag) && !failed;

/** A stable phase (0–10) per plug id, so the spark plugs don't all flash together. */
export const sparkPhase = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h % 100) / 10;
};

/** Spark flash rate, rad/s: one flash per plug every 2π / SPARK_RATE seconds (illustrative, not engine speed). */
export const SPARK_RATE = 18;

/**
 * Spark phase for cylinder `n` so the cylinders flash one after another in `order` (the engine firing order), evenly
 * spaced over one flash cycle, the first cylinder in the order at t = 0.
 */
export const firingPhase = (order: readonly number[], n: number) => {
  const i = order.indexOf(n);
  if (i < 0) throw new Error(`Cylinder ${n} is not in the firing order ${order.join("-")}; add it to the order.`);
  return Math.PI / 2 - (2 * Math.PI * i) / order.length;
};

/**
 * Spark plug: flashes while `firing()` in the engine views; Part owns dimming and focus.
 * It flashes while sin(t · SPARK_RATE + phase) is above `on`; cos(π / cylinders) gives each cylinder its own slot.
 */
export const plugAnim =
  (firing: () => boolean, phase: number, on = 0.3): PartAnim =>
  (m, t) => {
    const live = inView(ENGINE_VIEWS),
      flash = live && firing() && Math.sin(t * SPARK_RATE + phase) > on;
    m.material = flash ? mats("#6FD8FF").hi : mats("#DADFE2").on;
  };

/** Shielded ignition lead: same flash window as its plug; dark while its magneto cannot fire. */
export const leadAnim =
  (firing: () => boolean, phase: number, on = 0.3): PartAnim =>
  (m, t) => {
    const show = inView(ENGINE_VIEWS),
      flash = show && firing() && Math.sin(t * SPARK_RATE + phase) > on;
    m.material = flash ? mats("#6FD8FF").hi : show ? mats("#26333D").on : mats("#26333D").dim;
  };

/** Magneto: lit while `firing()` in the engine views; Part owns dimming and focus. */
export const magAnim =
  (firing: () => boolean): PartAnim =>
  (m) => {
    m.material = inView(ENGINE_VIEWS) && firing() ? mats("#6FD8FF").on : mats("#3E4A52").on;
  };

/** Brake cue: glows while `amount()` (0..1, toe brake or parking brake) is applied in Gear/Overview; dimmed elsewhere. */
export const brakeAnim =
  (amount: () => number): PartAnim =>
  (m) => {
    m.material =
      !inView(GEAR_VIEWS) && useView.getState().xray
        ? mats("#9AA3AA").dim
        : amount() > 0.05
          ? mats("#FF6A2A").hi
          : mats("#9AA3AA").on;
  };

/** Toe-brake amount for one side from differential braking (`diff` −1 left … +1 right) and the parking brake. */
export const brakeAmount = (gear: { park: boolean; diff: number; held?: { L: number; R: number } }, side: "R" | "L") =>
  gear.park ? (gear.held?.[side] ?? 0.6) : side === "R" ? Math.max(0, gear.diff) : Math.max(0, -gear.diff);

/** Hydraulic pressure cue in Gear/Overview (normalized 0–1, not a temperature or psi measurement); dimmed elsewhere. */
export const pressureAnim =
  (amount: () => number): PartAnim =>
  (m) => {
    m.material =
      !inView(GEAR_VIEWS) && useView.getState().xray
        ? mats("#67727D").dim
        : amount() > 0.05
          ? mats("#FF6A2A").hi
          : mats("#67727D").on;
  };
