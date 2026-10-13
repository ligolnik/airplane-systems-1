"use client";
/**
 * Airplane and system selection. The fleet itself is registered by aircraft/index.ts, so airplane
 * modules (panels etc.) can import these helpers without importing each other.
 */
import type { AircraftDef } from "@/aircraft/types";
import type { CameraPreset } from "./camera";
import type { Vec3 } from "./math";
import type { AircraftId, SysDef, SysId } from "./systems";
import { useView } from "./view";
import { setBuild } from "./build";

let FLEET: AircraftDef[] = [];
/** Called once by aircraft/index.ts with every airplane, in picker order. */
export function registerFleet(defs: AircraftDef[]) {
  FLEET = defs;
}
export const aircraft = (id: AircraftId) => FLEET.find((a) => a.id === id) ?? FLEET[0];
/** The airplane currently shown. */
export const useAircraft = () => aircraft(useView((v) => v.ac));

export const sysOf = (def: AircraftDef, id: SysId): SysDef => def.systems.find((s) => s.id === id) ?? def.systems[0];
export const hasSys = (def: AircraftDef, id: unknown): id is SysId => def.systems.some((s) => s.id === id);

const remember = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};
/** Keep the address bar on the view shown (/c172s/electrical), so a reload or a copied link opens it. */
export const showInUrl = (ac: AircraftId, sys: SysId) => {
  try {
    history.replaceState(null, "", `/${ac}/${sys}${location.search}`);
  } catch {}
};

/** Show a system of the current airplane, optionally flying the camera to it. */
export function selectSys(id: SysId, fly = true) {
  const v = useView.getState(),
    def = aircraft(v.ac);
  def.onSelect?.(id);
  useView.setState({ sys: id, focus: null });
  if (fly) {
    const [p, t] = sysOf(def, id).cam;
    v.flyTo(p, t);
  }
  remember("sys:" + v.ac, id);
  showInUrl(v.ac, id);
}

/** Switch airplane (to its overview, or to `sys` if it has one). */
export function selectAircraft(id: AircraftId, sys?: SysId) {
  const v = useView.getState();
  if (v.ac !== id) {
    aircraft(v.ac).onSelect?.("overview");
    setBuild("airframe");
  }
  const def = aircraft(id),
    to = sys && hasSys(def, sys) ? sys : "overview";
  def.onSelect?.(to);
  useView.setState({ ac: id, sys: to, focus: null, ctrlFocus: "all", hover: null });
  const [p, t] = sysOf(def, to).cam;
  v.flyTo(p, t);
  remember("fleetAc", id);
  remember("sys:" + id, to);
  showInUrl(id, to);
}

/** Camera for the toolbar's Reset view. */
export function resetCam(): [Vec3, Vec3] {
  const v = useView.getState(),
    def = aircraft(v.ac);
  return def.resetCam?.() ?? sysOf(def, v.sys).cam;
}

/** Apply a URL preset to the same focus used by Reset view. */
export function applyCameraPreset(preset: CameraPreset) {
  const [p, t] = resetCam();
  useView.getState().flyTo(p, t, preset);
}
