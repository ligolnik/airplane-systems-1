import type { Vec3 } from "./math";

/** Every airplane in the fleet. Each one lives in aircraft/<id>/. */
export const AIRCRAFT_IDS = ["sr20", "c172s", "c182t", "da40", "m20c"] as const;
export type AircraftId = (typeof AIRCRAFT_IDS)[number];
export const isAircraftId = (v: unknown): v is AircraftId =>
  typeof v === "string" && (AIRCRAFT_IDS as readonly string[]).includes(v);

/** All system views across the fleet; each airplane lists the ones it has (in rail order). */
export type SysId =
  | "overview"
  | "airframe"
  | "doors"
  | "controls"
  | "flaps"
  | "gear"
  | "engine"
  | "propeller"
  | "fuel"
  | "electrical"
  | "lighting"
  | "environment"
  | "pitot"
  | "ice"
  | "vacuum"
  | "avionics"
  | "autopilot"
  | "cabin"
  | "oxygen"
  | "caps";

/** Flight-control channels (for the channel-focus view in Flight controls). */
export type Chan = "elevator" | "aileron" | "rudder";

export type ColorKey =
  "accent" | "frame" | "ctrl" | "gear" | "oil" | "fuel" | "elec" | "air" | "pitot" | "avx" | "cabin" | "caps";

/**
 * One entry in the system rail: POH page, camera [position, target] and overview blurb (its colour comes from SYS_COLOR by
 * id). `ref` replaces the panel's "<doc> · p. <pg>" source line when the system is described in another document (e.g. a
 * supplement).
 */
export interface SysDef {
  id: SysId;
  name: string;
  pg: string;
  cam: [Vec3, Vec3];
  blurb: string;
  ref?: string;
}

/** Each system's palette colour, used by the rail, the panel and the parts (by their first system). Every SysId needs one. */
const SYS_COLOR: Record<SysId, ColorKey> = {
  overview: "accent",
  airframe: "frame",
  doors: "frame",
  controls: "ctrl",
  flaps: "ctrl",
  gear: "gear",
  engine: "oil",
  propeller: "oil",
  fuel: "fuel",
  electrical: "elec",
  lighting: "elec",
  environment: "air",
  pitot: "pitot",
  ice: "pitot",
  vacuum: "pitot",
  avionics: "avx",
  autopilot: "avx",
  cabin: "cabin",
  oxygen: "cabin",
  caps: "caps",
};

export type Theme = "light" | "dark";
type Palette = Record<ColorKey, string> & { scene: string; grid: string; shell: string };

const LIGHT: Palette = {
  accent: "#1B5E88",
  frame: "#3D5A73",
  ctrl: "#7C57CF",
  gear: "#5C6E7E",
  oil: "#B85A2A",
  fuel: "#2F7FE6",
  elec: "#D9960F",
  air: "#149C94",
  pitot: "#3A9448",
  avx: "#C8399F",
  cabin: "#6F7F8C",
  caps: "#D32640",
  scene: "#DCE3E7",
  grid: "#B9C4CB",
  shell: "#2A3B48",
};
const DARK: Palette = {
  ...LIGHT,
  accent: "#63B4E6",
  frame: "#8FB0CC",
  gear: "#8C9DAC",
  cabin: "#9AA8B3",
  scene: "#0C141B",
  grid: "#1D2A34",
  shell: "#9FB6C8",
};

export const palette = (t: Theme) => (t === "dark" ? DARK : LIGHT);
export const sysColor = (id: SysId, t: Theme) => palette(t)[SYS_COLOR[id]];
