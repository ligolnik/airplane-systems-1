"use client";
import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  FLEET,
  aircraft,
  hasSys,
  resetCam,
  selectAircraft,
  selectSys,
  showInUrl,
  sysOf,
  useAircraft,
} from "@/aircraft";
import { isAircraftId, sysColor, type AircraftId, type SysId, type Theme } from "@/lib/systems";
import { revealStage, useView } from "@/lib/view";
import { Tour, startTour } from "./Tour";

// WebGL scene is client-only
const Scene = dynamic(() => import("./scene/Scene"), {
  ssr: false,
  loading: () => <div className="loading">Loading 3D model…</div>,
});

function Fleet() {
  const ac = useView((x) => x.ac);
  const ref = useRef<HTMLDivElement>(null);
  // more airplanes than the rail fits scroll sideways: keep the selected one in view, also when the rail resizes
  useEffect(() => {
    const strip = ref.current;
    if (!strip) return;
    const reveal = () => {
      const b = strip.querySelector<HTMLElement>('button[aria-pressed="true"]');
      if (!b) return;
      const r = b.getBoundingClientRect(),
        s = strip.getBoundingClientRect();
      if (r.left < s.left) strip.scrollLeft -= s.left - r.left;
      else if (r.right > s.right) strip.scrollLeft += r.right - s.right;
    };
    reveal();
    const ro = new ResizeObserver(reveal);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [ac]);
  return (
    <div className="fleet" role="group" aria-label="Airplane" ref={ref}>
      {FLEET.map((a) => (
        <button key={a.id} type="button" aria-pressed={a.id === ac} title={a.name} onClick={() => selectAircraft(a.id)}>
          {a.short}
        </button>
      ))}
    </div>
  );
}

function Rail() {
  const def = useAircraft();
  const sys = useView((x) => x.sys),
    theme = useView((x) => x.theme);
  // keep the selected entry visible (the list scrolls: vertically on desktop, a chip strip on phones) without scrolling the page
  useEffect(() => {
    const b = document.querySelector<HTMLElement>('.syslist button[aria-current="true"]'),
      ul = b?.closest("ul");
    if (!b || !ul) return;
    const r = b.getBoundingClientRect(),
      u = ul.getBoundingClientRect();
    if (r.left < u.left) ul.scrollLeft -= u.left - r.left + 10;
    else if (r.right > u.right) ul.scrollLeft += r.right - u.right + 10;
    if (r.top < u.top) ul.scrollTop -= u.top - r.top + 8;
    else if (r.bottom > u.bottom) ul.scrollTop += r.bottom - u.bottom + 8;
  }, [sys, def]);
  return (
    <nav className="rail" aria-label="Systems">
      <div className="brand">
        <Fleet />
        <h1>{def.name}</h1>
        <p>{def.sub}</p>
      </div>
      <ul className="syslist">
        {def.systems.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              aria-current={s.id === sys}
              style={{ "--c": sysColor(s.id, theme) } as React.CSSProperties}
              onClick={() => selectSys(s.id)}
            >
              <span className="sw" />
              <span className="nm">{s.name}</span>
              <span className="pg">{s.pg}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="foot">
        Drag to orbit · scroll or pinch to zoom · right-drag to pan. Hover a part for its note.
      </div>
    </nav>
  );
}

function Panel() {
  const def = useAircraft();
  const sys = useView((x) => x.sys),
    theme = useView((x) => x.theme),
    walking = useView((x) => x.walking);
  const s = sysOf(def, sys),
    Body = def.panels[s.id];
  // phones: after picking a system from far down the panel, bring the 3D view back up
  useEffect(revealStage, [sys, def]);
  const Walk = walking ? def.walk?.Panel : undefined;
  if (Walk)
    return (
      <aside className="panel">
        <div className="panel-inner">
          <Walk />
        </div>
      </aside>
    );
  return (
    <aside className="panel">
      <div className="panel-inner" style={{ "--c": sysColor(s.id, theme) } as React.CSSProperties}>
        <div className="ref">
          <i />
          {s.ref ?? `${def.doc} · p. ${s.pg}`}
        </div>
        <h2>{s.id === "overview" ? "Airplane & Systems" : s.name}</h2>
        {Body ? <Body /> : <p className="lead">This system isn&apos;t modelled yet for the {def.name}.</p>}
      </div>
    </aside>
  );
}

const SUN = (
  <>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" />
  </>
);
const MOON = <path d="M13.5 10.2A5.8 5.8 0 0 1 5.8 2.5a5.8 5.8 0 1 0 7.7 7.7z" />;

function Toolbar() {
  const def = useAircraft();
  const xray = useView((x) => x.xray),
    labels = useView((x) => x.labels),
    spin = useView((x) => x.spin),
    theme = useView((x) => x.theme),
    walking = useView((x) => x.walking);
  const { set, setTheme, flyTo } = useView.getState();
  const dark = theme === "dark";
  const walk = def.walk;
  return (
    <div className="toolbar">
      {walk && (
        <button
          className="tb"
          aria-pressed={walking}
          title={walking ? "Leave the preflight walk-around" : "Guided preflight walk-around"}
          onClick={() => (walking ? walk.close() : walk.open())}
        >
          Preflight
        </button>
      )}
      <button className="tb" aria-pressed={xray} onClick={() => set({ xray: !xray })}>
        X-ray
      </button>
      <button className="tb" aria-pressed={labels} onClick={() => set({ labels: !labels })}>
        Labels
      </button>
      <button className="tb" aria-pressed={spin} onClick={() => set({ spin: !spin })}>
        Auto-rotate
      </button>
      <button
        className="tb tb-theme"
        title={dark ? "Switch to light mode" : "Switch to dark mode"}
        onClick={() => setTheme(dark ? "light" : "dark")}
      >
        <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
          {dark ? SUN : MOON}
        </svg>
        <span>{dark ? "Light" : "Dark"}</span>
      </button>
      <button
        className="tb"
        onClick={() => {
          const [p, t] = resetCam();
          flyTo([...p], [...t]);
        }}
      >
        Reset view
      </button>
      <button
        className="tb tb-help"
        title="Show the welcome tour"
        aria-label="Show the welcome tour"
        onClick={startTour}
      >
        ?
      </button>
    </div>
  );
}

/** Crew-alert window; keyed by airplane so each airplane's alert hook is called consistently. */
function Alerts() {
  const def = useAircraft();
  const { powered, msgs } = def.useAlerts();
  return (
    <div className="cas" aria-live="polite">
      <div className="hd">
        <span>{def.alertTitle}</span>
        <span>{powered ? `${msgs.length} ${msgs.length === 1 ? "msg" : "msgs"}` : "NO DISPLAY PWR"}</span>
      </div>
      <ul>
        {msgs.length ? (
          msgs.map(([c, t]) => (
            <li key={t} className={c}>
              {t}
            </li>
          ))
        ) : (
          <li className="none">{powered ? "No alerts" : "—"}</li>
        )}
      </ul>
    </div>
  );
}

function Hud() {
  const { Hud: H } = useAircraft();
  return H ? <H /> : null;
}

/** A part's colour for the tooltip title, or the ink colour when it is too pale (light theme) or too dark (dark theme) to read. */
function tipColor(c: string, theme: Theme) {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return c;
  const n = parseInt(m[1], 16),
    lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return (theme === "light" ? lum > 0.75 : lum < 0.25) ? "var(--ink)" : c;
}

function Tooltip() {
  const hover = useView((x) => x.hover),
    theme = useView((x) => x.theme);
  const ref = useRef<HTMLDivElement>(null);
  // below-right of the cursor; flipped above it when the note would run past the bottom of the 3D view
  useLayoutEffect(() => {
    const el = ref.current,
      h = el?.parentElement?.clientHeight;
    if (!el || !hover || !h) return;
    const ht = el.offsetHeight,
      below = hover.y + 14;
    el.style.top = `${below + ht <= h ? below : Math.max(0, Math.min(hover.y - 14 - ht, h - ht))}px`;
  }, [hover]);
  if (!hover) return null;
  const stage = document.querySelector(".stage") as HTMLElement | null;
  const w = stage?.clientWidth ?? 800;
  return (
    <div ref={ref} className="tip" style={{ left: Math.min(hover.x + 14, w - 270) }}>
      <h4 style={{ color: tipColor(hover.color, theme) }}>{hover.name}</h4>
      {hover.note && <p>{hover.note}</p>}
    </div>
  );
}

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

/** Airplane and system named by `s`, a URL path or hash: c172s/electrical, c172s, or (SR20) electrical. */
function viewIn(s: string): [AircraftId, string | undefined] | null {
  try {
    s = decodeURIComponent(s);
  } catch {} // malformed escape (e.g. a truncated link): use the raw text
  const [a, b] = s.replace(/^[/#]+/, "").split("/");
  if (isAircraftId(a)) return [a, b];
  if (a && hasSys(aircraft("sr20"), a)) return ["sr20", a];
  return null;
}

/** The view named by the URL: its path (/c172s/electrical), or a hash from links made before views had paths (#c172s/electrical). */
const fromUrl = () => viewIn(location.pathname) ?? viewIn(location.hash);

/** Show an airplane at `sys`, or else at its last-viewed system, or else its overview; remember it for the next visit. */
function show(ac: AircraftId, sys?: string | null) {
  const def = aircraft(ac),
    v = useView.getState();
  if (!hasSys(def, sys)) sys = read("sys:" + ac) ?? (ac === "sr20" ? read("sr20sys") : null);
  const start: SysId = hasSys(def, sys) ? sys : "overview";
  if (ac !== v.ac) selectAircraft(ac, start);
  else if (start !== v.sys) selectSys(start);
  else showInUrl(ac, start); // already shown (e.g. the SR20 overview on a fresh load): still put the view in the address bar
  try {
    localStorage.setItem("fleetAc", ac);
  } catch {}
}

/** Restore theme, airplane and last-viewed system; a view named by the URL wins. */
function useBoot() {
  useEffect(() => {
    // the toolbar's theme toggle saves a choice; until then follow the system setting, without saving it
    const os = matchMedia("(prefers-color-scheme: dark)");
    const t = read("sr20theme"),
      chosen = () => {
        const x = read("sr20theme");
        return x === "light" || x === "dark";
      };
    useView.getState().setTheme(t === "light" || t === "dark" ? t : os.matches ? "dark" : "light", false);
    const onOs = () => {
      if (!chosen()) useView.getState().setTheme(os.matches ? "dark" : "light", false);
    };
    os.addEventListener("change", onOs);
    // either way the address bar ends up on the view shown, as a path
    const u = fromUrl(),
      saved = read("fleetAc");
    if (u) show(...u);
    else show(isAircraftId(saved) ? saved : "sr20");
    // the airplane's walk-around: a ?walk= deep link, or saved progress to resume
    aircraft(useView.getState().ac).walk?.boot(location.search);
    return () => os.removeEventListener("change", onOs);
  }, []);
}

export default function App() {
  useBoot();
  const def = useAircraft();
  // The tab title follows the airplane shown, but only once mounted: every view is served the same static HTML
  // (next.config.ts rewrites), which gets a neutral title. (React hoists <title> into <head>; app/layout.tsx sets none.)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const walking = useView((x) => x.walking);
  return (
    <div className={walking ? "app walking" : "app"}>
      <title>{mounted ? `${def.name} Systems` : "Airplane Systems"}</title>
      <Rail />
      <main className="stage">
        <Scene />
        <Toolbar />
        <div className="stage-foot">
          <Alerts key={def.id} />
          <Hud />
        </div>
        <Tooltip />
      </main>
      {/* phones: the HUD shows here, under the 3D view, instead (see globals.css) */}
      <div className="stage-under">
        <Hud />
      </div>
      <Panel />
      <Tour />
    </div>
  );
}
