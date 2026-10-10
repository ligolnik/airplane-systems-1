"use client";
/**
 * View state shared by every airplane: which airplane and system are shown, display toggles,
 * theme, camera requests and the hover tooltip. Each airplane keeps its own systems state in
 * its own store (see lib/simStore.ts), so switching airplanes keeps each one's switches as left.
 */
import { create } from "zustand";
import { useSyncExternalStore } from "react";
import type { Spot } from "./spot";
import type { Vec3 } from "./math";
import type { AircraftId, Chan, SysId, Theme } from "./systems";

export interface HoverInfo {
  name: string;
  note: string;
  color: string;
  x: number;
  y: number;
}
export interface CamRequest {
  p: Vec3;
  t: Vec3;
  id: number;
  /** A pose already fitted to the viewport (e.g. a framing put back as the user left it): used as is. */
  exact?: boolean;
}

export interface View {
  ac: AircraftId;
  sys: SysId;
  xray: boolean;
  labels: boolean;
  spin: boolean;
  /** Part name flashed by a "tap to locate" list. */
  focus: string | null;
  /** Flight-controls view: highlight one control channel. */
  ctrlFocus: Chan | "all";
  theme: Theme;
  cam: CamRequest | null;
  hover: HoverInfo | null;
  /** Guided walk-around: parts highlighted while everything else is dimmed. */
  spot: Spot | null;
  /** The airplane's guided walk-around is open (it replaces the system panel). */
  walking: boolean;
}

interface ViewStore extends View {
  set: (p: Partial<View>) => void;
  flyTo: (p: Vec3, t: Vec3) => void;
  /** Apply a theme; `save` (the default) remembers it as the user's choice. */
  setTheme: (t: Theme, save?: boolean) => void;
  setHover: (h: HoverInfo | null) => void;
}

/** The stacked phone layout (app/globals.css uses the same breakpoint): short full-width 3D view, page scrolls. */
export const NARROW_PX = 860;
export const narrowLayout = () =>
  typeof window !== "undefined" && (layoutQuery ?? window.matchMedia(`(max-width:${NARROW_PX}px)`)).matches;

// Parts and screens share one media-query listener, including when there are hundreds of label candidates.
const layoutListeners = new Set<() => void>();
let layoutQuery: MediaQueryList | undefined;
const notifyLayout = () => layoutListeners.forEach((notify) => notify());
const subscribeLayout = (notify: () => void) => {
  if (!layoutQuery) {
    layoutQuery = window.matchMedia(`(max-width:${NARROW_PX}px)`);
    layoutQuery.addEventListener("change", notifyLayout);
  }
  layoutListeners.add(notify);
  return () => {
    layoutListeners.delete(notify);
    if (!layoutListeners.size) {
      layoutQuery?.removeEventListener("change", notifyLayout);
      layoutQuery = undefined;
    }
  };
};
const desktopLayout = () => false;
export const useNarrowLayout = () => useSyncExternalStore(subscribeLayout, narrowLayout, desktopLayout);

/** Phones: the page scrolls and the panel sits below the 3D view, so bring the view back up when it has scrolled away. */
export function revealStage() {
  const stage = document.querySelector(".stage");
  if (narrowLayout() && stage && stage.getBoundingClientRect().top < 0) stage.scrollIntoView({ block: "start" });
}

let camId = 0;
let focusTimer: ReturnType<typeof setTimeout> | undefined;

export const useView = create<ViewStore>((set) => ({
  ac: "sr20",
  sys: "overview",
  xray: true,
  labels: true,
  spin: false,
  focus: null,
  ctrlFocus: "all",
  theme: "light",
  cam: null,
  hover: null,
  spot: null,
  walking: false,
  set: (p) => set(p),
  flyTo: (p, t) => set({ cam: { p, t, id: ++camId } }),
  setTheme: (theme, save = true) => {
    set({ theme });
    document.documentElement.setAttribute("data-theme", theme);
    if (save)
      try {
        localStorage.setItem("sr20theme", theme);
      } catch {}
  },
  setHover: (hover) => set({ hover }),
}));

/** Highlight a part by name for a moment (used by "tap to locate" lists). */
export function flashFocus(name: string) {
  useView.setState({ focus: name });
  clearTimeout(focusTimer);
  focusTimer = setTimeout(() => useView.setState({ focus: null }), 2600);
}
