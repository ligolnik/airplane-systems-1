/**
 * Garmin G1000 (GDU 1040, 10.4" 4:3) canvas drawing shared by the G1000 airplanes: PFD, MFD (EIS strip +
 * moving map), reversionary mode and round standby instruments. The SR20's Cirrus Perspective+ (GDU 1050A, also
 * 1024 × 768) uses the same drawing with `style: "perspective"` (see GduStyle). Pure: everything comes from the data
 * passed in. Drawn on a 640×480 design grid scaled uniformly (letterboxed) to the canvas — use ~640×480 canvases.
 *
 * Colours follow the G1000: white scales, cyan pilot selections (bugs, selected altitude/heading, baro),
 * magenta GPS course and trend vectors, green VOR/LOC course and active AFCS modes, white armed modes,
 * yellow cautions, red warnings and red X's over failed instruments.
 */
import type { CasLevel } from "@/aircraft/types";

type Ctx = CanvasRenderingContext2D;

/** HSI navigation source (CDI softkey). */
export type NavSrc = "GPS" | "VOR1" | "VOR2" | "LOC1" | "LOC2";

/** Everything the PFD shows about the airplane. `flightData()` in ./flight builds it from a FlightState. */
export interface FlightData {
  /** Attitude (deg): pitch + nose up, roll + right wing down; slip/skid ball −1..1 (+ = ball right). */
  pitch: number;
  roll: number;
  slip?: number;
  /** Indicated / true / ground speed (kt). */
  ias: number;
  tas?: number;
  gs?: number;
  /** Indicated altitude (ft) and vertical speed (fpm). */
  alt: number;
  vs: number;
  /** Heading and track (deg magnetic). */
  hdg: number;
  trk?: number;
  /** Altimeter setting (inHg) and outside air temperature (°C). */
  baro: number;
  oat: number;
  /** Heading bug and selected course (deg). */
  hdgBug: number;
  crs: number;
  /** Course deviation −1..1 of full scale (± 2 dots; + = course to the right). Undefined = no D-bar (invalid signal). */
  cdi?: number;
  /** Glideslope (LOC source) / glidepath (GPS source) deviation in dots (+ = path above, fly up). null = scale without diamond; undefined = hidden. */
  gsDev?: number | null;
  navSrc: NavSrc;
  /** Selected altitude (ft) — the cyan box and bug on the altimeter. */
  selAlt?: number;
  /** Radios as [active, standby]. Defaults are shown when omitted. */
  com1?: [string, string];
  com2?: [string, string];
  nav1?: [string, string];
  nav2?: [string, string];
  /** Transponder code and mode (e.g. "1200", "ALT"), clock text (e.g. "14:05:22": local time, UTC in the "perspective" style). */
  xpdr?: string;
  xpdrMode?: string;
  time?: string;
  /** Airspeed predicted 6 s ahead minus current (kt) — magenta trend vector. */
  iasTrend?: number;
  /** Turn rate (deg/s, + right) — magenta turn-rate vector above the HSI. */
  turnRate?: number;
  /** Navigation status box text (top centre). Default "<source> DTK nnn° TRK nnn°". */
  navStatus?: string;
  /** Position (nm east, nm north) and cross-track distance (nm right of course) for the moving map. */
  pos?: [number, number];
  xtk?: number;
  /** Failed instruments: red X over attitude (AHRS), heading/HSI, or airspeed/altitude/VSI (air data). */
  fail?: { att?: boolean; air?: boolean; hdg?: boolean };
}

/** Airspeed tape colour bands (kt) and V-speed bugs. */
export interface SpeedBands {
  /** Flap operating range (white), normal range (green), caution range (yellow). */
  white?: [number, number];
  green?: [number, number];
  yellow?: [number, number];
  /** Vne: red/white barber pole above it, red pointer at or beyond it. */
  red?: number;
  /** Low-speed awareness: red from 20 kt up to this speed, then yellow up to the bottom of the white/green band. Default: red all the way. */
  lowRed?: number;
  /** Cyan V-speed references on the tape: Vr, Vx, Vy, best glide. */
  vr?: number;
  vx?: number;
  vy?: number;
  vg?: number;
}

/** AFCS status bar content (GFC 700): `gfc700Annunc()` builds it. */
export interface AfcsAnnunc {
  /** Autopilot engaged (green AP), flight director on (modes shown), yaw damper (green YD, if installed). */
  ap: boolean;
  fd: boolean;
  yd?: boolean;
  /** CWS held with the AP engaged: white "CWS" replaces "AP". */
  cws?: boolean;
  /** Lateral active (green) and armed (white) modes, e.g. "HDG" / "GPS". */
  lat: string;
  latArm?: string;
  /** Vertical active (green) with its reference (e.g. "VS" + "↑500FPM", "ALT" + "6000FT", "FLC" + "90KT") and armed modes (white, e.g. "ALTS GS"). */
  vert: string;
  vertRef?: string;
  vertArm?: string;
  /** Active field flashing: "g" = automatic transition (green, 10 s), "y" = mode lost (yellow, 10 s; text is the lost mode). */
  latFlash?: "g" | "y" | null;
  vertFlash?: "g" | "y" | null;
  /** Flashing AP: "disc" = yellow (normal disconnect, 5 s), "abnormal" = red (until acknowledged). */
  apFlash?: "disc" | "abnormal" | null;
  /** AFCS system status annunciation left of the bar: PFT (white running / red failed), AFCS, PTCH, ROLL, PTRM (red), ↑ELE ↓ELE ←AIL AIL→ (yellow). */
  sys?: { text: string; level: CasLevel; flash?: boolean } | null;
  /** Disconnect tone sounding (for the panel UI; not drawn on the PFD). */
  tone?: boolean;
  /** FLC airspeed reference (cyan box + bug on the airspeed tape) and VS reference (cyan box + bug on the VSI). */
  iasRef?: number | null;
  vsRef?: number | null;
  /** Overspeed protection active: flashing yellow MAXSPD above the airspeed tape. */
  maxspd?: boolean;
  /** Flight director command bars (attitude, deg). */
  cmd?: { pitch: number; roll: number } | null;
}

/**
 * Display family. "g1000" (default): Garmin G1000 as in the Cessna NAV III and DA40. "perspective": Cirrus Perspective+
 * (Pilot's Guide 190-02183-03): a "% Power" box instead of the NAV box on the PFD and no COM box on the MFD (Fig 2-1, 3-1),
 * a Flight ID box under the COM box, mixed-case softkey labels with OBS subdued, GS beside TAS (p. 48), UTC clock, no
 * HDG / CRS readouts beside the heading box (shown only while being set, POH 7-21), a frameless left-aligned CAS window
 * right of the altimeter and VSI starting at the altitude pointer (Fig A-2), and OAT in °C and °F (p. 69). Everything
 * else is drawn the same.
 */
export type GduStyle = "g1000" | "perspective";

export interface PfdData {
  f: FlightData;
  speeds: SpeedBands;
  /** Display family; default "g1000". */
  style?: GduStyle;
  /** Perspective+ "% Power" box (top left of the PFD); null or undefined shows dashes. Not drawn in the "g1000" style. */
  pctPower?: number | null;
  /** Annunciation window right of the altimeter: [level, text] (red warnings, yellow cautions, white advisories). */
  alerts: [CasLevel, string][];
  /** GFC 700 status bar; omit (or null) for airplanes without it (e.g. KAP 140 C182T). */
  afcs?: AfcsAnnunc | null;
  /** Red "PITCH TRIM" annunciation (KAP 140 installations: `kap140Pfd()`), shown at the top of the annunciation window. */
  pitchTrim?: string | null;
  /** Sensor comparator annunciations, dual-sensor installations only; omit (or empty) for none. */
  comparators?: Comparator[];
  /** Reversionary sensor window text above the roll scale, e.g. "USING AHRS2" (PG 190-02183-01 Fig 2-48, Table 2-5). */
  reversionary?: string[];
  /** Clock (s) for flashing; defaults to the wall clock. */
  t?: number;
}

/**
 * A sensor comparator annunciation (Perspective+ PG 190-02183-01 Rev. A Fig 2-47, Table 2-4, p. 105–106): black text on a
 * white background when one or both sensed values are unavailable (no compare), on amber for a miscompare. `at` is the
 * compared value, which sets its place on the PFD as Fig 2-47 shows; `text` is what the box reads (e.g. "VDI NO COMP").
 */
export interface Comparator {
  at: "IAS" | "ALT" | "PIT" | "ROL" | "HDG" | "VDI";
  text: string;
  miscompare?: boolean;
}

/** One engine-indication item for the EIS strip. */
export interface Gauge {
  key: string;
  /** Label as printed on the G1000, e.g. "OIL PRES", "FUEL QTY GAL", "M BUS E BUS". */
  label: string;
  unit?: string;
  /**
   * dial (tach), horizontal bar, pair (L/R pointers on one bar, e.g. fuel), text row, head (section title), or tanks
   * (Perspective+ fuel: L/R vertical bars for value / value2, with `side` drawn as a vertical bar to their right).
   */
  style: "dial" | "bar" | "pair" | "text" | "head" | "tanks";
  min: number;
  max: number;
  /** Colour bands [from, to, colour]. */
  bands?: [number, number, "green" | "yellow" | "red" | "white"][];
  /**
   * Value; null = invalid → red X. `value2`: the R pointer of a pair, or the second column of a text row — the label
   * then holds both captions separated by two spaces ("M BUS  E BUS") and the row shows two readouts.
   */
  value: number | null;
  value2?: number | null;
  /** Digital readout format; omitted = no digits on bars. */
  fmt?: (v: number) => string;
  /** In a red range (flashing red readout) or yellow range (yellow readout). */
  alert?: "warning" | "caution" | null;
  /** Text-row content (overrides value/fmt), e.g. "1234.5". */
  text?: string;
  /** Shorter dial (60 px) or bar (30 px) so a long strip (e.g. two dials, MAN IN + RPM) fits the display. */
  compact?: boolean;
  /** Character drawn inside a bar's pointer, e.g. the hottest cylinder number on CHT / EGT. */
  ptrLabel?: string;
  /** "tanks" only: the vertical bar beside the tank pair (fuel flow), with its own label, range, bands, value and alert (readout colour). */
  side?: Gauge;
}

export interface MfdData extends PfdData {
  /** EIS strip items, top to bottom. */
  eis: Gauge[];
  /** Title above the strip, e.g. "ENGINE". */
  eisTitle?: string;
  /** Reversionary mode: PFD instruments plus the EIS strip on this display. */
  reversion: boolean;
  /** Page title over the map, default "MAP - NAVIGATION MAP". */
  page?: string;
}

/* ---------- palette & helpers ---------- */

const WHITE = "#FFFFFF",
  CYAN = "#00F0FF",
  MAG = "#FF2EFF",
  GREEN = "#2BFF2B",
  YEL = "#FFE000",
  RED = "#FF2020",
  GRAY = "#8E979E";
const TAPE = "rgba(20,24,28,0.55)",
  D2R = Math.PI / 180;
const FONT = `Arial, "Liberation Sans", "DejaVu Sans", Helvetica, sans-serif`;
const BAND: Record<string, string> = { green: "#14D21E", yellow: "#FFD400", red: RED, white: WHITE };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const wrap360 = (a: number) => ((a % 360) + 360) % 360;
const pad3 = (h: number) => String(Math.round(wrap360(h)) || 360).padStart(3, "0");
const now = () => (typeof performance !== "undefined" ? performance.now() / 1000 : 0);
const blinkOn = (t: number, hz = 2) => Math.floor(t * hz * 2) % 2 === 0;

function txt(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  c: string,
  px: number,
  align: CanvasTextAlign = "left",
  w = 700,
) {
  ctx.font = `${w} ${px}px ${FONT}`;
  ctx.fillStyle = c;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(s, x, y);
}
function rect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill?: string | null,
  stroke?: string | null,
  lw = 1,
) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
  }
}
function poly(ctx: Ctx, pts: number[], fill?: string | null, stroke?: string | null, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}
function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, c: string, lw = 1) {
  ctx.strokeStyle = c;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
/** `s` cut to `maxW` at a bold `px` font, ending in "…" when it had to be cut. */
function clip(ctx: Ctx, s: string, maxW: number, px: number) {
  ctx.font = `700 ${px}px ${FONT}`;
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s.trimEnd() + "…";
}
/** Red X across a failed field. */
function redX(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = RED;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x + 3, y + 3);
  ctx.lineTo(x + w - 3, y + h - 3);
  ctx.moveTo(x + w - 3, y + 3);
  ctx.lineTo(x + 3, y + h - 3);
  ctx.stroke();
  ctx.restore();
}

/** Black background, uniform scale of the 640×480 design grid, clipped. */
function frame(ctx: Ctx, W: number, H: number, body: () => void) {
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const k = Math.min(W / 640, H / 480);
  ctx.translate((W - 640 * k) / 2, (H - 480 * k) / 2);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.rect(0, 0, 640, 480);
  ctx.clip();
  ctx.lineJoin = "round";
  body();
  ctx.restore();
}

/* ---------- PFD layout ---------- */

const TOP = 40,
  BOT = 464,
  TT = 86,
  TB = 272,
  YC = (TT + TB) / 2;
interface Lay {
  x0: number;
  w: number;
  cx: number;
  cy: number;
  asX: number;
  altX: number;
  vsiX: number;
  ann: { x: number; y: number; w: number };
  hy: number;
  hr: number;
}
/** Instrument positions for a PFD occupying x0…x0+w (full width, or right of the EIS strip in reversion). */
function layout(x0: number, w: number): Lay {
  const full = w >= 600,
    cx = full ? x0 + w / 2 : x0 + 254;
  return {
    x0,
    w,
    cx,
    cy: YC,
    asX: cx - 248,
    altX: cx + 136,
    vsiX: cx + 208,
    hy: 393,
    hr: 70,
    ann: full ? { x: cx + 240, y: TT - 20, w: x0 + w - cx - 243 } : { x: x0 + w - 114, y: 338, w: 110 },
  };
}

const PFD_KEYS = ["", "INSET", "", "PFD", "OBS", "CDI", "DME", "XPDR", "IDENT", "TMR/REF", "NRST", "ALERTS"];
const MFD_KEYS = ["ENGINE", "", "MAP", "", "", "", "", "", "", "DCLTR", "SHW CHRT", "CHKLIST"];
/** Perspective+ level-1 softkeys (PG Fig 2-1, 3-1); OBS is subdued (unavailable) in the default picture. */
const PP_PFD_KEYS = [
  "",
  "Map/HSI",
  "TFC Map",
  "PFD Opt",
  "OBS",
  "CDI",
  "DME",
  "XPDR",
  "Ident",
  "TMR/REF",
  "Nearest",
  "Alerts",
];
const PP_MFD_KEYS = ["Engine", "", "Map Opt", "", "", "", "", "", "", "Detail", "Charts", "Checklist"];
const PP_SUBDUED = new Set(["OBS"]);
const isPP = (d: PfdData) => d.style === "perspective";

/** Primary flight display. */
export function drawPFD(ctx: Ctx, W: number, H: number, d: PfdData) {
  const pp = isPP(d);
  frame(ctx, W, H, () => {
    pfdBody(ctx, d, layout(0, 640));
    topBar(ctx, d.f, false, !pp);
    if (pp) {
      // Cirrus percent-power box where the G1000 has its NAV box (PG Fig 2-1 item 1)
      const p = d.pctPower;
      txt(ctx, `${p == null ? "--" : Math.round(p)}% Power`, 85, 20, WHITE, 15, "center");
    }
    softkeys(ctx, pp ? PP_PFD_KEYS : PFD_KEYS, pp ? PP_SUBDUED : undefined);
  });
}

function pfdBody(ctx: Ctx, d: PfdData, L: Lay) {
  const t = d.t ?? now(),
    pp = isPP(d);
  attitude(ctx, d, L);
  airspeed(ctx, d, L, t);
  altimeter(ctx, d, L);
  vsi(ctx, d, L);
  hsi(ctx, d.f, L, pp);
  if (d.afcs) afcsBar(ctx, d.afcs, L, t);
  sensorAnn(ctx, d, L);
  annWindow(ctx, d, L);
  // OAT, transponder, time
  if (pp) {
    rect(ctx, L.x0 + 4, 444, 136, 18, "#000", "#3A4046");
    txt(ctx, `OAT ${Math.round(d.f.oat)}°C`, L.x0 + 9, 453, WHITE, 12);
    txt(ctx, `OAT ${Math.round(d.f.oat * 1.8 + 32)}°F`, L.x0 + 135, 453, WHITE, 12, "right");
    // Flight ID box under the COM box (PG Fig A-2); no ID entered
    rect(ctx, 562, TOP + 3, 74, 16, "#000", "#3A4046");
    txt(ctx, "ID", 566, TOP + 11, WHITE, 10);
    txt(ctx, "--------", 632, TOP + 11, WHITE, 11, "right");
  } else {
    rect(ctx, L.x0 + 4, 444, 78, 18, "#000", "#3A4046");
    txt(ctx, `OAT ${Math.round(d.f.oat)}°C`, L.x0 + 9, 453, WHITE, 12);
  }
  rect(ctx, 540, 426, 96, 18, "#000", "#3A4046");
  txt(ctx, "XPDR", 545, 435, WHITE, 10);
  txt(ctx, d.f.xpdr ?? "1200", 575, 435, WHITE, 12);
  txt(ctx, d.f.xpdrMode ?? "ALT", 631, 435, GREEN, 11, "right");
  rect(ctx, 540, 444, 96, 18, "#000", "#3A4046");
  txt(ctx, pp ? "UTC" : "LCL", 545, 453, WHITE, 10);
  txt(ctx, d.f.time ?? "12:00:00", 631, 453, WHITE, 12, "right");
}

/* attitude indicator */
function attitude(ctx: Ctx, d: PfdData, L: Lay) {
  const { cx, cy } = L,
    f = d.f,
    ppd = 5;
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.x0, TOP, L.w, BOT - TOP);
  ctx.clip();
  if (f.fail?.att) {
    ctx.fillStyle = "#06090C";
    ctx.fillRect(L.x0, TOP, L.w, BOT - TOP);
    redX(ctx, L.asX + 72, TT + 4, L.altX - L.asX - 92, 176);
    ctx.restore();
    return;
  }
  const roll = f.roll * D2R;
  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  ctx.translate(0, f.pitch * ppd);
  const sky = ctx.createLinearGradient(0, -420, 0, 0);
  sky.addColorStop(0, "#0A2E86");
  sky.addColorStop(1, "#4F8FEA");
  ctx.fillStyle = sky;
  ctx.fillRect(-900, -1400, 1800, 1400);
  const gnd = ctx.createLinearGradient(0, 0, 0, 420);
  gnd.addColorStop(0, "#9A6229");
  gnd.addColorStop(1, "#4D2E0F");
  ctx.fillStyle = gnd;
  ctx.fillRect(-900, 0, 1800, 1400);
  line(ctx, -900, 0, 900, 0, WHITE, 1.5);
  ctx.restore();

  // pitch ladder, clipped to the area between the tapes
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.asX + 72, TT + 2, L.altX - L.asX - 96, 188);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  ctx.translate(0, f.pitch * ppd);
  for (let p = -50; p <= 50; p += 2.5) {
    if (!p) continue;
    const y = -p * ppd,
      major = p % 10 === 0,
      mid = !major && p % 5 === 0,
      hw = major ? 40 : mid ? 20 : 10;
    if (Math.abs(p - f.pitch) > 26) continue;
    line(ctx, -hw, y, hw, y, WHITE, 1.5);
    if (major) {
      txt(ctx, String(Math.abs(p)), -hw - 13, y, WHITE, 13, "center");
      txt(ctx, String(Math.abs(p)), hw + 13, y, WHITE, 13, "center");
    }
  }
  ctx.restore();

  // roll scale (rotates with the horizon) and fixed roll pointer + slip/skid
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.x0, TOP, L.w, BOT - TOP);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  const R = 112;
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, R, -150 * D2R, -30 * D2R);
  ctx.stroke();
  for (const a of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
    const len = Math.abs(a) === 30 || Math.abs(a) === 60 ? 14 : 8,
      r = (a - 90) * D2R;
    if (Math.abs(a) === 45)
      poly(
        ctx,
        [
          Math.cos(r) * R,
          Math.sin(r) * R,
          Math.cos(r - 0.03) * (R + 8),
          Math.sin(r - 0.03) * (R + 8),
          Math.cos(r + 0.03) * (R + 8),
          Math.sin(r + 0.03) * (R + 8),
        ],
        WHITE,
      );
    else line(ctx, Math.cos(r) * R, Math.sin(r) * R, Math.cos(r) * (R + len), Math.sin(r) * (R + len), WHITE, 1.6);
  }
  poly(ctx, [0, -R, -7, -R - 11, 7, -R - 11], WHITE); // roll index zero
  ctx.restore();
  poly(ctx, [cx, cy - R + 1, cx - 8, cy - R + 13, cx + 8, cy - R + 13], WHITE); // roll pointer
  const sk = clamp(f.slip ?? 0, -1, 1) * 16;
  poly(
    ctx,
    [cx - 9 + sk, cy - R + 15, cx + 9 + sk, cy - R + 15, cx + 11 + sk, cy - R + 20, cx - 11 + sk, cy - R + 20],
    WHITE,
  );

  // flight director command bars (magenta) and the single-cue aircraft symbol (yellow). The bars show the commanded
  // attitude relative to the airplane: up for more pitch, banked right (clockwise) for a right-turn command.
  const cmd = d.afcs?.fd ? d.afcs.cmd : null;
  if (cmd) {
    ctx.save();
    ctx.translate(cx, cy - (cmd.pitch - f.pitch) * ppd);
    ctx.rotate((cmd.roll - f.roll) * D2R);
    poly(ctx, [0, -3, -74, 24, -74, 31, 0, 6, 74, 31, 74, 24], MAG, "#000", 1);
    ctx.restore();
  }
  poly(
    ctx,
    [cx, cy, cx - 62, cy + 25, cx - 36, cy + 25, cx, cy + 11, cx + 36, cy + 25, cx + 62, cy + 25],
    YEL,
    "#000",
    1.5,
  );
}

/* airspeed tape */
function airspeed(ctx: Ctx, d: PfdData, L: Lay, t: number) {
  const x = L.asX,
    w = 64,
    ppk = 3.2,
    f = d.f,
    s = d.speeds,
    a = d.afcs;
  rect(ctx, x, TT, w, TB - TT, TAPE);
  // above the tape: MAXSPD (flashing yellow) or the FLC airspeed reference
  if (a?.maxspd) {
    if (blinkOn(t)) {
      rect(ctx, x, TT - 20, w, 18, YEL);
      txt(ctx, "MAXSPD", x + w / 2, TT - 11, "#000", 12, "center");
    }
  } else if (a?.iasRef != null && a.fd) {
    rect(ctx, x, TT - 20, w, 18, "#000", "#4A5056");
    txt(ctx, `${a.iasRef}KT`, x + w / 2, TT - 11, CYAN, 14, "center");
  }
  rect(ctx, x, TB + 2, w, 16, "#000", "#3A4046");
  if (isPP(d)) {
    // Perspective+ ground speed (GPS): left of TAS on the full PFD (PG p. 48), under it in reversion (Fig 3-19)
    const full = L.w >= 600,
      gx = full ? x - 66 : x,
      gy = full ? TB + 2 : TB + 20;
    rect(ctx, gx, gy, w, 16, "#000", "#3A4046");
    txt(ctx, `GS ${Math.round(f.gs ?? f.tas ?? f.ias)}KT`, gx + w / 2, gy + 8, WHITE, 11, "center");
  }
  if (f.fail?.air) {
    redX(ctx, x, TT, w, TB - TT);
    txt(ctx, "TAS ---KT", x + w / 2, TB + 10, WHITE, 11, "center");
    return;
  }
  txt(ctx, `TAS ${Math.round(f.tas ?? f.ias)}KT`, x + w / 2, TB + 10, WHITE, 11, "center");
  const ias = Math.max(f.ias, 20),
    y = (v: number) => YC - (v - ias) * ppk;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, TT, w + 30, TB - TT);
  ctx.clip();
  // colour bands along the right edge
  const bx = x + w - 7,
    band = (a0: number, a1: number, c: string, bw = 7, dx = 0) => {
      const y0 = y(a1),
        y1 = y(a0);
      rect(ctx, bx + dx, y0, bw, y1 - y0, c);
    };
  const low = s.white?.[0] ?? s.green?.[0];
  if (low) {
    const lr = s.lowRed != null && s.lowRed < low ? s.lowRed : low;
    band(20, lr, RED);
    if (lr < low) band(lr, low, BAND.yellow);
  }
  if (s.green) band(s.green[0], s.green[1], BAND.green);
  if (s.yellow) band(s.yellow[0], s.yellow[1], BAND.yellow);
  if (s.white) band(s.white[0], s.white[1], WHITE, 3, -4);
  if (s.red) for (let v = s.red; v < ias + 40; v += 4) (band(v, v + 2, RED), band(v + 2, v + 4, WHITE));
  // ticks and numbers
  for (let v = Math.floor((ias - 32) / 5) * 5; v <= ias + 32; v += 5) {
    if (v < 20) continue;
    const yy = y(v);
    line(ctx, x + w - 17 - (v % 10 ? 0 : 6), yy, x + w - 9, yy, WHITE, 1.5);
    if (v % 10 === 0) txt(ctx, String(v), x + w - 27, yy, WHITE, 15, "right");
  }
  // V-speed references and FLC bug (cyan)
  for (const [k, v] of [
    ["R", s.vr],
    ["X", s.vx],
    ["Y", s.vy],
    ["G", s.vg],
  ] as const) {
    if (v == null || Math.abs(v - ias) > 30) continue;
    line(ctx, x + w - 2, y(v), x + w + 4, y(v), CYAN, 2);
    txt(ctx, k, x + w + 6, y(v), CYAN, 12);
  }
  if (a?.fd && a.iasRef != null) {
    const yy = clamp(y(a.iasRef), TT + 4, TB - 4);
    poly(ctx, [x + w - 1, yy - 6, x + w + 6, yy - 6, x + w + 6, yy + 6, x + w - 1, yy + 6, x + w + 4, yy], CYAN);
  }
  // trend vector
  if (f.iasTrend && Math.abs(f.iasTrend) > 1)
    rect(ctx, x + w - 12, Math.min(YC, YC - f.iasTrend * ppk), 3, Math.abs(f.iasTrend * ppk), MAG);
  ctx.restore();
  // pointer
  const over = s.red != null && f.ias >= s.red;
  poly(
    ctx,
    [
      x + 4,
      YC - 15,
      x + w - 12,
      YC - 15,
      x + w - 12,
      YC - 7,
      x + w - 3,
      YC,
      x + w - 12,
      YC + 7,
      x + w - 12,
      YC + 15,
      x + 4,
      YC + 15,
    ],
    over ? RED : "#000",
    WHITE,
    1.5,
  );
  txt(ctx, f.ias < 20 ? "---" : String(Math.round(f.ias)), x + w - 15, YC + 1, WHITE, 21, "right");
}

/* altimeter */
function altimeter(ctx: Ctx, d: PfdData, L: Lay) {
  const x = L.altX,
    w = 70,
    ppf = 0.32,
    f = d.f;
  rect(ctx, x, TT, w, TB - TT, TAPE);
  // selected altitude box (cyan) above, baro box below
  rect(ctx, x, TT - 20, w, 18, "#000", "#4A5056");
  if (f.selAlt != null) {
    txt(ctx, String(Math.round(f.selAlt)), x + w - 22, TT - 11, CYAN, 15, "right");
    txt(ctx, "FT", x + w - 4, TT - 10, CYAN, 9, "right");
  }
  rect(ctx, x, TB + 2, w, 16, "#000", "#3A4046");
  txt(ctx, `${f.baro.toFixed(2)}IN`, x + w / 2, TB + 10, CYAN, 13, "center");
  // glideslope / glidepath indicator left of the tape
  if (f.gsDev !== undefined) {
    const gx = x - 15,
      gp = f.navSrc === "GPS";
    rect(ctx, gx, YC - 70, 12, 140, TAPE);
    txt(ctx, "G", gx + 6, YC - 78, gp ? MAG : GREEN, 11, "center");
    for (const k of [-2, -1, 1, 2]) {
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(gx + 6, YC - k * 30, 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    line(ctx, gx, YC, gx + 12, YC, WHITE, 1.5);
    if (f.gsDev != null) {
      const yy = YC - clamp(f.gsDev, -2.4, 2.4) * 30;
      poly(ctx, [gx + 6, yy - 7, gx + 12, yy, gx + 6, yy + 7, gx, yy], gp ? MAG : GREEN, "#000", 1);
    }
  }
  if (f.fail?.air) {
    redX(ctx, x, TT, w, TB - TT);
    return;
  }
  const alt = f.alt,
    y = (v: number) => YC - (v - alt) * ppf;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 8, TT, w + 8, TB - TT);
  ctx.clip();
  for (let v = Math.floor((alt - 320) / 20) * 20; v <= alt + 320; v += 20) {
    const yy = y(v),
      big = v % 100 === 0;
    line(ctx, x, yy, x + (big ? 12 : 6), yy, WHITE, 1.5);
    if (big) txt(ctx, String(v), x + 16, yy, WHITE, 14);
  }
  if (Math.abs(f.vs) > 50) rect(ctx, x + 2, Math.min(YC, YC - f.vs * 0.1 * ppf), 3, Math.abs(f.vs * 0.1 * ppf), MAG); // 6 s trend
  if (f.selAlt != null) {
    // selected altitude bug
    const yy = clamp(y(f.selAlt), TT + 6, TB - 6);
    poly(
      ctx,
      [x - 1, yy - 9, x + 8, yy - 9, x + 8, yy + 9, x - 1, yy + 9, x - 1, yy + 4, x + 4, yy, x - 1, yy - 4],
      CYAN,
    );
  }
  ctx.restore();
  // pointer with rolling last two digits (20 ft steps)
  poly(
    ctx,
    [x - 7, YC, x + 2, YC - 7, x + 2, YC - 16, x + w + 2, YC - 16, x + w + 2, YC + 16, x + 2, YC + 16, x + 2, YC + 7],
    "#000",
    WHITE,
    1.5,
  );
  const a20 = Math.round(alt / 20) * 20,
    hi = Math.trunc(a20 / 100),
    lo = Math.abs(a20 % 100);
  txt(ctx, String(hi), x + 42, YC + 1, WHITE, 21, "right");
  txt(ctx, String(lo).padStart(2, "0"), x + 44, YC + 2, WHITE, 15);
}

/* vertical speed indicator */
function vsi(ctx: Ctx, d: PfdData, L: Lay) {
  const x = L.vsiX,
    w = 26,
    k = 88 / 2000,
    f = d.f,
    ref = d.afcs?.fd ? d.afcs.vsRef : null;
  poly(ctx, [x, TT + 8, x + w, TT + 22, x + w, TB - 22, x, TB - 8], TAPE);
  if (ref != null) {
    rect(ctx, x - 4, TT - 20, w + 10, 18, "#000", "#4A5056");
    txt(ctx, String(ref), x + w / 2 + 1, TT - 11, CYAN, 12, "center");
  }
  if (f.fail?.air) {
    redX(ctx, x, TT + 8, w, TB - TT - 16);
    return;
  }
  for (let v = -2000; v <= 2000; v += 500) {
    const yy = YC - v * k,
      big = v % 1000 === 0;
    line(ctx, x, yy, x + (big ? 9 : 5), yy, WHITE, 1.4);
    if (big && v) txt(ctx, String(Math.abs(v / 1000)), x + 15, yy, WHITE, 12, "center");
  }
  if (ref != null) {
    const yy = YC - clamp(ref, -2000, 2000) * k;
    poly(ctx, [x, yy - 5, x + 6, yy - 5, x + 6, yy + 5, x, yy + 5, x + 3, yy], CYAN);
  }
  const yy = YC - clamp(f.vs, -2150, 2150) * k;
  poly(ctx, [x + 2, yy, x + 10, yy - 9, x + 40, yy - 9, x + 40, yy + 9, x + 10, yy + 9], "#000", WHITE, 1.2);
  if (Math.abs(f.vs) >= 100) txt(ctx, String(Math.round(f.vs / 50) * 50), x + 39, yy + 1, WHITE, 11, "right");
}

/* HSI. `pp`: Perspective+ shows the selected heading / course readouts only for ~3 s after setting (POH 7-21, 7-22), so they're left off. */
function hsi(ctx: Ctx, f: FlightData, L: Lay, pp: boolean) {
  const cx = L.cx,
    cy = L.hy,
    r = L.hr;
  const gps = f.navSrc === "GPS",
    cc = gps ? MAG : GREEN;
  // selected heading and course boxes
  if (!pp) {
    rect(ctx, cx - 116, cy - r - 2, 74, 18, "#000", "#3A4046");
    txt(ctx, "HDG", cx - 111, cy - r + 7, WHITE, 11);
    txt(ctx, `${pad3(f.hdgBug)}°`, cx - 46, cy - r + 7, CYAN, 14, "right");
    rect(ctx, cx + 42, cy - r - 2, 74, 18, "#000", "#3A4046");
    txt(ctx, "CRS", cx + 47, cy - r + 7, WHITE, 11);
    txt(ctx, `${pad3(f.crs)}°`, cx + 112, cy - r + 7, cc, 14, "right");
  }
  // rose
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "rgba(18,20,24,0.88)";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5D656C";
  ctx.lineWidth = 1;
  ctx.stroke();
  if (f.fail?.hdg) {
    ctx.restore();
    redX(ctx, cx - r * 0.75, cy - r * 0.75, r * 1.5, r * 1.5);
    headingBox("---");
    return;
  }
  // turn-rate indicator: ticks at half-standard / standard rate (heading in 6 s), magenta trend
  ctx.save();
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, r + 5, -24 * D2R, 24 * D2R);
  ctx.stroke();
  for (const a of [-18, -9, 9, 18])
    line(
      ctx,
      Math.cos(a * D2R) * (r + 5),
      Math.sin(a * D2R) * (r + 5),
      Math.cos(a * D2R) * (r + 11),
      Math.sin(a * D2R) * (r + 11),
      WHITE,
      1.4,
    );
  const tr = clamp((f.turnRate ?? 0) * 6, -24, 24);
  if (Math.abs(tr) > 0.5) {
    ctx.strokeStyle = MAG;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r + 8, Math.min(0, tr * D2R), Math.max(0, tr * D2R));
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.rotate(-f.hdg * D2R);
  for (let a = 0; a < 360; a += 5) {
    const big = a % 10 === 0,
      rr = a * D2R;
    line(
      ctx,
      Math.sin(rr) * r,
      -Math.cos(rr) * r,
      Math.sin(rr) * (r - (big ? 10 : 5)),
      -Math.cos(rr) * (r - (big ? 10 : 5)),
      WHITE,
      1.3,
    );
  }
  for (let a = 0; a < 360; a += 30) {
    ctx.save();
    ctx.rotate(a * D2R);
    const lab = a === 0 ? "N" : a === 90 ? "E" : a === 180 ? "S" : a === 270 ? "W" : String(a / 10);
    txt(ctx, lab, 0, -r + 19, WHITE, a % 90 ? 12 : 14, "center");
    ctx.restore();
  }
  // heading bug
  ctx.save();
  ctx.rotate(f.hdgBug * D2R);
  poly(ctx, [-8, -r - 1, 8, -r - 1, 8, -r + 7, 3, -r + 7, 0, -r + 3, -3, -r + 7, -8, -r + 7], CYAN);
  ctx.restore();
  // course pointer + CDI
  ctx.save();
  ctx.rotate(f.crs * D2R);
  const dot = r * 0.2;
  for (const k of [-2, -1, 1, 2]) {
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(k * dot, 0, 3.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  line(ctx, 0, -r + 26, 0, -r * 0.48, cc, 4);
  poly(ctx, [0, -r + 14, -8, -r + 28, 8, -r + 28], cc);
  line(ctx, 0, r * 0.48, 0, r - 12, cc, 4);
  if (f.cdi != null)
    line(ctx, clamp(f.cdi, -1.25, 1.25) * 2 * dot, -r * 0.42, clamp(f.cdi, -1.25, 1.25) * 2 * dot, r * 0.42, cc, 4);
  ctx.restore(); // course
  ctx.restore(); // card
  ctx.restore(); // centre
  // airplane symbol, lubber line, source label, heading box
  ctx.save();
  ctx.translate(cx, cy);
  poly(
    ctx,
    [
      0, -14, 2, -6, 13, 0, 13, 3, 2, 1, 2, 9, 6, 12, 6, 14, 0, 12, -6, 14, -6, 12, -2, 9, -2, 1, -13, 3, -13, 0, -2,
      -6,
    ],
    WHITE,
  );
  ctx.restore();
  poly(ctx, [cx, cy - r + 9, cx - 5, cy - r + 1, cx + 5, cy - r + 1], WHITE);
  txt(ctx, f.navSrc, cx - 36, cy - 18, cc, 12, "center");
  headingBox(pad3(f.hdg) + "°");
  function headingBox(s: string) {
    rect(ctx, cx - 26, cy - r - 24, 52, 20, "#000", WHITE, 1.5);
    txt(ctx, s, cx, cy - r - 13, WHITE, 16, "center");
  }
}

/* sensor comparator (PG Fig 2-47) and reversionary sensor (PG Fig 2-48) annunciations; places approximate */
function sensorAnn(ctx: Ctx, d: PfdData, L: Lay) {
  /** A box of `s` with its left (or, `right`, its right) edge at `x`; returns its left edge. */
  const box = (s: string, x: number, y: number, bg: string, right = false) => {
    ctx.font = `700 11px ${FONT}`;
    const w = ctx.measureText(s).width + 8,
      left = right ? x - w : x;
    rect(ctx, left, y, w, 14, bg);
    txt(ctx, s, left + 4, y + 7.5, "#000", 11);
    return left;
  };
  // right column: left of the altimeter's vertical deviation scale
  const xr = L.altX - 18;
  let rolX = xr;
  for (const c of d.comparators ?? []) {
    const bg = c.miscompare ? YEL : WHITE;
    if (c.at === "IAS") box(c.text, L.asX + 66, YC + 16, bg);
    else if (c.at === "ALT") box(c.text, xr, YC + 16, bg, true);
    else if (c.at === "VDI") box(c.text, xr, TB - 20, bg, true);
    else if (c.at === "HDG") box(c.text, L.cx + 30, L.hy - L.hr - 21, bg);
    // PIT at the top right, ROL to its left
    else if (c.at === "PIT") rolX = box(c.text, xr, TT + 4, bg, true) - 3;
  }
  for (const c of d.comparators ?? []) if (c.at === "ROL") box(c.text, rolX, TT + 4, c.miscompare ? YEL : WHITE, true);
  const rev = d.reversionary ?? [];
  if (rev.length) {
    // white on blue, top left of the attitude display above the roll scale
    rect(ctx, L.asX + 70, TOP + 25, 86, rev.length * 13 + 4, "#1B2C78");
    rev.forEach((s, i) => txt(ctx, s, L.asX + 74, TOP + 32 + i * 13, WHITE, 11));
  }
}

/* AFCS status bar */
function afcsBar(ctx: Ctx, a: AfcsAnnunc, L: Lay, t: number) {
  const x0 = L.asX,
    y = TOP + 1,
    h = 21,
    cy = y + h / 2,
    on = blinkOn(t);
  const ws = [54, 62, 70, 86, 142, 68],
    xs: number[] = [];
  ws.reduce((acc, w) => (xs.push(acc), acc + w), x0);
  const total = ws.reduce((p, q) => p + q, 0);
  rect(ctx, x0, y, total, h, "#000", "#4A5056");
  for (let i = 1; i < ws.length; i++) if (i !== 2 && i !== 5) line(ctx, xs[i], y + 3, xs[i], y + h - 3, "#4A5056", 1);
  // system status annunciation (PFT, AFCS, PTCH, ROLL, PTRM, ELE/AIL mistrim)
  if (a.sys && (!a.sys.flash || on)) {
    const c = a.sys.level === "w" ? RED : a.sys.level === "c" ? YEL : WHITE;
    rect(ctx, xs[0] + 4, y + 2, ws[0] - 8, h - 4, null, c, 1.5);
    txt(ctx, a.sys.text, xs[0] + ws[0] / 2, cy + 1, c, 13, "center");
  }
  if (a.fd) {
    if (a.latArm) txt(ctx, a.latArm, xs[1] + ws[1] / 2, cy + 1, WHITE, 15, "center");
    if (a.lat && (!a.latFlash || on))
      txt(ctx, a.lat, xs[2] + ws[2] / 2, cy + 1, a.latFlash === "y" ? YEL : GREEN, 15, "center");
    if (a.vert && (!a.vertFlash || on)) {
      const c = a.vertFlash === "y" ? YEL : GREEN;
      if (a.vertRef) {
        txt(ctx, a.vert, xs[4] + 8, cy + 1, c, 15);
        txt(ctx, a.vertRef, xs[4] + ws[4] - 8, cy + 1, c, 14, "right");
      } else txt(ctx, a.vert, xs[4] + ws[4] / 2, cy + 1, c, 15, "center");
    }
    if (a.vertArm) {
      // fitted to its field ("ALTS GP/V")
      ctx.font = `700 15px ${FONT}`;
      const px = Math.max(9, Math.min(15, (15 * (ws[5] - 6)) / ctx.measureText(a.vertArm).width));
      txt(ctx, a.vertArm, xs[5] + ws[5] / 2, cy + 1, WHITE, px, "center");
    }
  }
  // autopilot status in the centre
  const mid = xs[3] + ws[3] / 2,
    items: [string, string][] = [];
  if (a.cws) items.push(["CWS", WHITE]);
  else if (a.ap) items.push(["AP", GREEN]);
  else if (a.apFlash && on) items.push(["AP", a.apFlash === "abnormal" ? RED : YEL]);
  if (a.yd) items.push(["YD", GREEN]);
  items.forEach(([s, c], i) => txt(ctx, s, mid + (i - (items.length - 1) / 2) * 34, cy + 1, c, 15, "center"));
}

/* annunciation / alerts window */
function annWindow(ctx: Ctx, d: PfdData, L: Lay) {
  const order = { w: 0, c: 1, a: 2 };
  // up to 12 annunciations at once, on the PFD or (reversion) the MFD (DA40 CRG 190-00324-07 p. 12-1)
  const list: [CasLevel, string][] = [
    ...(d.pitchTrim ? [["w", d.pitchTrim] as [CasLevel, string]] : []),
    ...[...d.alerts].sort((p, q) => order[p[0]] - order[q[0]]),
  ].slice(0, 12);
  if (!list.length) return;
  // rows that fit above the transponder box (y 426): the reversion window would otherwise run into it and the softkeys
  const fit = (y: number, rh: number) => list.slice(0, Math.floor((426 - y - 6) / rh));
  if (isPP(d)) {
    // Perspective+ CAS window: black, no frame, left-aligned, one narrow font for every row (PG Fig A-2). Full PFD: right of
    // the VSI, top just below the altitude pointer. Reversion: right of the HSI, below the baro box. The widest message sets
    // a common horizontal squeeze (down to 0.75, like Garmin's condensed face), then a common smaller size (down to 8 px).
    const full = L.w >= 600,
      x = full ? L.vsiX + 29 : L.ann.x,
      w = full ? L.x0 + L.w - x - 2 : L.ann.w,
      y = full ? YC + 18 : TB + 22;
    const room = w - 6,
      widest = (px: number) => {
        ctx.font = `700 ${px}px ${FONT}`;
        return Math.max(...list.map(([, s]) => ctx.measureText(s).width));
      };
    let px = 12,
      k = Math.min(1, room / widest(px));
    if (k < 0.75) {
      px = Math.max(8, Math.floor((px * k) / 0.75));
      k = Math.min(1, room / widest(px));
    }
    k = Math.max(k, 0.75);
    const rh = px + 4,
      rows = fit(y, rh);
    rect(ctx, x, y, w, rows.length * rh + 6, "#000");
    rows.forEach(([lv, s], i) => {
      ctx.save();
      ctx.translate(x + 3, y + 3 + i * rh + rh / 2 + 1);
      ctx.scale(k, 1);
      txt(ctx, clip(ctx, s, room / k, px), 0, 0, lv === "w" ? RED : lv === "c" ? YEL : WHITE, px);
      ctx.restore();
    });
    return;
  }
  // full PFD: right of the VSI, 16 px rows; reversion: right of the HSI from just below the baro box, rows shrunk to fit
  const full = L.w >= 600,
    { x, w } = L.ann,
    y = full ? L.ann.y : TB + 22;
  const rh = full ? 16 : Math.max(10, Math.min(16, Math.floor((426 - y - 6) / list.length)));
  const rows = fit(y, rh);
  rect(ctx, x, y, w, rows.length * rh + 6, "#000", WHITE, 1);
  rows.forEach(([lv, s], i) => {
    const c = lv === "w" ? RED : lv === "c" ? YEL : WHITE;
    ctx.font = `700 12px ${FONT}`;
    const px = Math.max(7, Math.min(12, rh - 3, (12 * (w - 8)) / ctx.measureText(s).width)); // shrink to fit
    txt(ctx, s, x + w / 2, y + 3 + i * rh + rh / 2 + 1, c, px, "center");
  });
}

/* top bars: NAV left, COM right (either can be left off), navigation status / data centre */
function topBar(ctx: Ctx, f: FlightData, mfd: boolean, nav = true, com = true) {
  rect(ctx, 0, 0, 640, TOP, "#000");
  line(ctx, 0, TOP - 0.5, 640, TOP - 0.5, "#5A6168", 1);
  const n1 = f.nav1 ?? ["117.95", "108.00"],
    n2 = f.nav2 ?? ["110.50", "113.40"],
    c1 = f.com1 ?? ["118.000", "136.975"],
    c2 = f.com2 ?? ["121.500", "132.450"];
  const navOn = (i: 1 | 2) => f.navSrc === `VOR${i}` || f.navSrc === `LOC${i}`;
  const navRow = (lab: string, [act, sby]: [string, string], yy: number, tune: boolean, on: boolean) => {
    txt(ctx, lab, 4, yy, WHITE, 11);
    if (tune) rect(ctx, 37, yy - 8, 50, 16, null, CYAN, 1.2);
    txt(ctx, sby, 62, yy, WHITE, 14, "center");
    txt(ctx, "↔", 95, yy, CYAN, 12, "center");
    txt(ctx, act, 128, yy, on ? GREEN : WHITE, 14, "center");
  };
  if (nav) {
    navRow("NAV1", n1, 10, true, navOn(1));
    navRow("NAV2", n2, 30, false, navOn(2));
  }
  const comRow = (lab: string, [act, sby]: [string, string], yy: number, tune: boolean, on: boolean) => {
    txt(ctx, act, 498, yy, on ? GREEN : WHITE, 13, "center");
    txt(ctx, "↔", 534, yy, CYAN, 12, "center");
    if (tune) rect(ctx, 545, yy - 8, 56, 16, null, CYAN, 1.2);
    txt(ctx, sby, 573, yy, WHITE, 13, "center");
    txt(ctx, lab, 637, yy, WHITE, 10, "right");
  };
  if (com) {
    comRow("COM1", c1, 10, true, true);
    comRow("COM2", c2, 30, false, false);
  }
  line(ctx, 170, 4, 170, TOP - 4, "#3A4046");
  line(ctx, 466, 4, 466, TOP - 4, "#3A4046");
  if (mfd) {
    const cells: [string, string][] = [
      ["GS", `${Math.round(f.gs ?? f.tas ?? f.ias)}KT`],
      ["DTK", `${pad3(f.crs)}°`],
      ["TRK", `${pad3(f.trk ?? f.hdg)}°`],
      ["ETE", "--:--"],
    ];
    cells.forEach(([k, v], i) => {
      const xx = 182 + i * 72;
      txt(ctx, k, xx, 20, WHITE, 11);
      txt(ctx, v, xx + 64, 20, MAG, 13, "right");
    });
  } else {
    const s = f.navStatus ?? `${f.navSrc}  DTK ${pad3(f.crs)}°  TRK ${pad3(f.trk ?? f.hdg)}°`;
    txt(ctx, s, 318, 20, f.navSrc === "GPS" ? MAG : GREEN, 14, "center");
  }
}

/** Softkey labels along the bottom; keys in `subdued` are greyed out (unavailable). */
function softkeys(ctx: Ctx, keys: string[], subdued?: Set<string>) {
  rect(ctx, 0, BOT, 640, 480 - BOT, "#0B0D0F");
  const w = 640 / keys.length;
  keys.forEach((k, i) => {
    if (i) line(ctx, i * w, BOT + 3, i * w, 478, "#3A4046");
    if (k) txt(ctx, k, i * w + w / 2, BOT + 8, subdued?.has(k) ? "#5E666C" : "#E8ECEE", 10, "center");
  });
}

/* ---------- MFD ---------- */

const EIS_W = 130;

/** Multi-function display: EIS strip + navigation map, or (reversion) PFD + EIS strip. */
export function drawMFD(ctx: Ctx, W: number, H: number, d: MfdData) {
  frame(ctx, W, H, () => {
    const t = d.t ?? now(),
      pp = isPP(d);
    if (d.reversion) {
      pfdBody(ctx, d, layout(EIS_W, 640 - EIS_W));
      topBar(ctx, d.f, false);
    } else {
      navMap(ctx, d);
      topBar(ctx, d.f, true, true, !pp);
    }
    eisStrip(ctx, 0, TOP, EIS_W, BOT - TOP, d, t);
    const mfdKeys = pp ? PP_MFD_KEYS : MFD_KEYS;
    softkeys(
      ctx,
      d.reversion ? [mfdKeys[0], ...(pp ? PP_PFD_KEYS : PFD_KEYS).slice(1)] : mfdKeys,
      pp ? PP_SUBDUED : undefined,
    );
  });
}

function eisStrip(ctx: Ctx, x: number, y: number, w: number, h: number, d: MfdData, t: number) {
  rect(ctx, x, y, w, h, "#05070A");
  line(ctx, x + w - 0.5, y, x + w - 0.5, y + h, "#5A6168");
  let yy = y + 4;
  if (d.eisTitle) {
    txt(ctx, d.eisTitle, x + w / 2, yy + 7, WHITE, 12, "center");
    yy += 16;
  }
  for (const g of d.eis) yy += gauge(ctx, g, x, yy, w, t);
}

const H_OF = { dial: 78, bar: 36, pair: 50, text: 17, text2: 30, head: 18, tanks: 100 } as const;
const H_COMPACT = { dial: 60, bar: 30 } as const;

function gauge(ctx: Ctx, g: Gauge, x: number, y: number, w: number, t: number): number {
  const on = blinkOn(t),
    warn = g.alert === "warning",
    caut = g.alert === "caution";
  const valC = warn ? (on ? WHITE : RED) : caut ? YEL : WHITE;
  const frac = (v: number) => clamp((v - g.min) / (g.max - g.min), 0, 1);
  const fmt = (v: number) => (g.fmt ? g.fmt(v) : String(Math.round(v)));
  const readout = (s: string, xx: number, yy: number, px: number, align: CanvasTextAlign) => {
    if (warn && on) {
      ctx.font = `700 ${px}px ${FONT}`;
      const tw = ctx.measureText(s).width;
      rect(ctx, align === "right" ? xx - tw - 3 : xx - tw / 2 - 3, yy - px / 2 - 1, tw + 6, px + 2, RED);
    }
    txt(ctx, s, xx, yy, valC, px, align);
  };
  switch (g.style) {
    case "head":
      txt(ctx, g.label, x + w / 2, y + 9, GRAY, 11, "center");
      line(ctx, x + 6, y + 9, x + 24, y + 9, "#3A4046");
      line(ctx, x + w - 24, y + 9, x + w - 6, y + 9, "#3A4046");
      return H_OF.head;
    case "text": {
      if (g.value2 !== undefined && g.text == null) {
        // two columns: "M BUS  E BUS" over value / value2
        const labs = g.label.split(/\s{2,}/),
          cols = [x + w * 0.28, x + w * 0.74];
        [g.value, g.value2].forEach((v, i) => {
          txt(ctx, labs[i] ?? "", cols[i], y + 7, GRAY, 10, "center");
          if (v == null) redX(ctx, cols[i] - 18, y + 14, 36, 14);
          else readout(fmt(v), cols[i], y + 21, 13, "center");
        });
        return H_OF.text2;
      }
      txt(ctx, g.label, x + 6, y + 8, WHITE, 11);
      if (g.value === null && g.text == null) redX(ctx, x + w - 46, y + 1, 40, 14);
      else readout(g.text ?? fmt(g.value ?? 0), x + w - 6, y + 8, 12, "right");
      return H_OF.text;
    }
    case "dial": {
      const k = g.compact,
        hh = k ? H_COMPACT.dial : H_OF.dial;
      const cx = x + w / 2,
        cy = y + (k ? 32 : 42),
        r = k ? 26 : 33,
        a0 = 150 * D2R,
        sw = 240 * D2R,
        ang = (v: number) => a0 + frac(v) * sw;
      ctx.lineWidth = 6;
      for (const [b0, b1, c] of g.bands ?? []) {
        ctx.strokeStyle = BAND[c];
        ctx.beginPath();
        ctx.arc(cx, cy, r - 3, ang(b0), ang(b1));
        ctx.stroke();
      }
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 1, a0, a0 + sw);
      ctx.stroke();
      for (let i = 0; i <= 6; i++) {
        const a = a0 + (i / 6) * sw;
        line(
          ctx,
          cx + Math.cos(a) * (r + 1),
          cy + Math.sin(a) * (r + 1),
          cx + Math.cos(a) * (r - 6),
          cy + Math.sin(a) * (r - 6),
          WHITE,
          1.2,
        );
      }
      txt(ctx, g.label, cx, cy + (k ? 9 : 12), WHITE, k ? 10 : 11, "center");
      if (g.value == null) {
        redX(ctx, cx - r, cy - r, 2 * r, 2 * r);
        return hh;
      }
      const a = ang(g.value),
        pc = warn ? RED : caut ? YEL : WHITE;
      poly(
        ctx,
        [
          cx + Math.cos(a) * (r - 1),
          cy + Math.sin(a) * (r - 1),
          cx + Math.cos(a + 1.5) * 4,
          cy + Math.sin(a + 1.5) * 4,
          cx + Math.cos(a - 1.5) * 4,
          cy + Math.sin(a - 1.5) * 4,
        ],
        pc,
        "#000",
        1,
      );
      readout(fmt(g.value), cx, cy + (k ? 20 : 27), k ? 14 : 15, "center");
      return hh;
    }
    case "bar":
    case "pair": {
      const pair = g.style === "pair",
        bx = x + (pair ? 15 : 9),
        bw = w - (pair ? 30 : 18),
        by = y + (pair ? 26 : g.compact ? 21 : 25);
      if (pair) txt(ctx, g.label, x + w / 2, y + 8, WHITE, 11, "center");
      else {
        txt(ctx, g.label + (g.unit ? " " + g.unit : ""), x + 6, y + 8, WHITE, 11);
        if (g.value != null && g.fmt) readout(fmt(g.value), x + w - 6, y + 8, 12, "right");
      }
      rect(ctx, bx, by, bw, 6, "#3B4147");
      for (const [b0, b1, c] of g.bands ?? [])
        rect(ctx, bx + frac(b0) * bw, by, (frac(b1) - frac(b0)) * bw, 6, BAND[c]);
      const ptr = (v: number, up: boolean, lab?: string) => {
        const px = bx + frac(v) * bw,
          pc = warn ? RED : caut ? YEL : WHITE;
        if (up) poly(ctx, [px, by - 1, px - 6, by - 11, px + 6, by - 11], pc, "#000", 1);
        else poly(ctx, [px, by + 7, px - 6, by + 17, px + 6, by + 17], pc, "#000", 1);
        if (lab) txt(ctx, lab, px, up ? by - 7 : by + 13, "#000", 8, "center");
      };
      if (g.value == null) redX(ctx, bx, by - 10, bw, 22);
      else ptr(g.value, true, pair ? "L" : g.ptrLabel);
      if (pair) {
        if (g.value2 === null) redX(ctx, bx, by - 4, bw, 22);
        else if (g.value2 != null) ptr(g.value2, false, "R");
        txt(ctx, fmt(g.min), x + 4, by + 3, GRAY, 9);
        txt(ctx, "F", x + w - 4, by + 3, GRAY, 9, "right");
        return H_OF.pair;
      }
      return g.compact ? H_COMPACT.bar : H_OF.bar;
    }
    case "tanks": {
      // Perspective+ fuel block (PG Fig 3-2): L/R vertical tank bars with a scale between them, fuel flow bar on the right
      const top = y + 12,
        hh = 62,
        bot = top + hh;
      // each pointer takes the colour of the band it sits in (red / yellow), so one low tank doesn't colour the other
      const vbar = (bx: number, gg: Gauge, v: number | null | undefined, ptrLeft: boolean) => {
        const fr = (u: number) => clamp((u - gg.min) / (gg.max - gg.min), 0, 1);
        rect(ctx, bx, top, 6, hh, "#3B4147");
        for (const [b0, b1, c] of gg.bands ?? []) rect(ctx, bx, bot - fr(b1) * hh, 6, (fr(b1) - fr(b0)) * hh, BAND[c]);
        if (v == null) {
          redX(ctx, bx - 7, top, 20, hh);
          return;
        }
        const band = gg.bands?.find(([b0, b1]) => v >= b0 && v <= b1)?.[2];
        const py = bot - fr(v) * hh,
          pc = band === "red" ? RED : band === "yellow" ? YEL : WHITE;
        if (ptrLeft) poly(ctx, [bx - 1, py, bx - 10, py - 5, bx - 10, py + 5], pc, "#000", 1);
        else poly(ctx, [bx + 7, py, bx + 16, py - 5, bx + 16, py + 5], pc, "#000", 1);
      };
      line(ctx, x + 4, y + 1, x + w - 4, y + 1, "#3A4046");
      const lx = x + 18,
        rx = x + 46,
        sc = x + 35;
      vbar(lx, g, g.value, true);
      vbar(rx, g, g.value2, false);
      txt(ctx, "F", sc, top - 5, GRAY, 8, "center");
      for (let v = g.min; v < g.max - 2; v += 5) txt(ctx, String(v), sc, bot - frac(v) * hh, GRAY, 8, "center");
      txt(ctx, "L", lx + 3, bot + 8, WHITE, 10, "center");
      txt(ctx, "R", rx + 3, bot + 8, WHITE, 10, "center");
      txt(ctx, g.label, sc, bot + 20, WHITE, 11, "center");
      const sd = g.side;
      if (sd) {
        const sx = x + w - 26,
          sv = sd.value,
          sc2 = sd.alert === "warning" ? RED : sd.alert === "caution" ? YEL : WHITE;
        vbar(sx, sd, sv, true);
        if (sv != null) txt(ctx, sd.fmt ? sd.fmt(sv) : String(Math.round(sv)), x + w - 6, bot + 8, sc2, 13, "right");
        txt(ctx, sd.label, x + w - 6, bot + 20, WHITE, 10, "right");
      }
      return H_OF.tanks;
    }
  }
}

/* moving map (heading up) */
const WPT = ["KOLAY", "DEMIE", "TRAXX", "PIKKE", "OSHEA", "LUNIX", "MORRA", "VIKKO", "BEENO", "ZAPPA"];
function hash(i: number, j: number) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function navMap(ctx: Ctx, d: MfdData) {
  const f = d.f,
    X0 = EIS_W,
    Y0 = TOP + 18,
    MW = 640 - X0,
    MH = BOT - Y0,
    mx = X0 + MW / 2,
    my = Y0 + MH * 0.68,
    s = 15; // px per nm
  const [px, py] = f.pos ?? [0, 0],
    h = (f.trk ?? f.hdg) * D2R,
    sh = Math.sin(h),
    ch = Math.cos(h);
  const scr = (wx: number, wy: number): [number, number] => {
    const dx = wx - px,
      dy = wy - py;
    return [mx + (dx * ch - dy * sh) * s, my - (dx * sh + dy * ch) * s];
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(X0, Y0, MW, MH);
  ctx.clip();
  ctx.fillStyle = "#17301A";
  ctx.fillRect(X0, Y0, MW, MH);
  // terrain / water blobs on a 4 nm world grid
  const R = 26,
    c = 4;
  for (let i = Math.floor((px - R) / c); i <= Math.ceil((px + R) / c); i++)
    for (let j = Math.floor((py - R) / c); j <= Math.ceil((py + R) / c); j++) {
      const v = hash(i, j),
        [sx, sy] = scr(i * c + hash(j, i) * c, j * c + hash(i + 7, j) * c),
        rad = (1.6 + 2.6 * hash(i + 3, j - 5)) * s;
      const col = v < 0.07 ? "#1E4F9A" : v < 0.45 ? "#24452A" : v < 0.75 ? "#3D5A2C" : v < 0.92 ? "#6B6436" : "#7E5634";
      const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
      gr.addColorStop(0, col);
      gr.addColorStop(1, "rgba(23,48,26,0)");
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(sx, sy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  // airports on a 9 nm grid
  for (let i = Math.floor((px - R) / 9); i <= Math.ceil((px + R) / 9); i++)
    for (let j = Math.floor((py - R) / 9); j <= Math.ceil((py + R) / 9); j++) {
      if (hash(i + 11, j + 13) > 0.3) continue;
      const [sx, sy] = scr(i * 9 + 4, j * 9 + 4);
      ctx.strokeStyle = "#3FA0FF";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.stroke();
      line(ctx, sx - 7, sy, sx + 7, sy, "#3FA0FF", 2);
      txt(
        ctx,
        "K" +
          String.fromCharCode(
            65 + Math.floor(hash(i, j + 1) * 26),
            65 + Math.floor(hash(i + 2, j) * 26),
            65 + Math.floor(hash(i, j + 3) * 26),
          ),
        sx + 9,
        sy - 7,
        WHITE,
        10,
      );
    }
  // active course (magenta) through the airplane's cross-track offset, with waypoints every 12 nm
  const cr = f.crs * D2R,
    ux = Math.sin(cr),
    uy = Math.cos(cr),
    xt = f.xtk ?? 0; // nm right of course
  const ox = px - xt * uy,
    oy = py + xt * ux,
    along = ox * ux + oy * uy,
    bx = ox - ux * along,
    by = oy - uy * along;
  const [ax, ay] = scr(bx + ux * (along - 60), by + uy * (along - 60)),
    [ex, ey] = scr(bx + ux * (along + 60), by + uy * (along + 60));
  line(ctx, ax, ay, ex, ey, MAG, 3.5);
  const n0 = Math.floor(along / 12);
  for (let n = n0 - 2; n <= n0 + 3; n++) {
    const [sx, sy] = scr(bx + ux * n * 12, by + uy * n * 12),
      act = n === n0 + 1;
    poly(
      ctx,
      [sx, sy - 6, sx + 2, sy - 2, sx + 6, sy, sx + 2, sy + 2, sx, sy + 6, sx - 2, sy + 2, sx - 6, sy, sx - 2, sy - 2],
      WHITE,
    );
    txt(ctx, WPT[((n % WPT.length) + WPT.length) % WPT.length], sx + 9, sy + 1, act ? MAG : WHITE, 11);
  }
  // compass ring and range
  const rr = 150;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(mx, my, rr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let a = 0; a < 360; a += 30) {
    const ra = (a - (f.trk ?? f.hdg)) * D2R,
      sx = mx + Math.sin(ra) * rr,
      sy = my - Math.cos(ra) * rr;
    line(ctx, mx + Math.sin(ra) * (rr - 6), my - Math.cos(ra) * (rr - 6), sx, sy, WHITE, 1.2);
    const lab = a === 0 ? "N" : a === 90 ? "E" : a === 180 ? "S" : a === 270 ? "W" : String(a / 10);
    txt(ctx, lab, mx + Math.sin(ra) * (rr + 10), my - Math.cos(ra) * (rr + 10), WHITE, 12, "center");
  }
  rect(ctx, mx + rr * 0.7 - 2, my + rr * 0.7 - 8, 38, 16, "#000");
  txt(ctx, "10NM", mx + rr * 0.7 + 17, my + rr * 0.7, WHITE, 11, "center");
  // ownship
  ctx.save();
  ctx.translate(mx, my);
  ctx.scale(1.3, 1.3);
  poly(
    ctx,
    [
      0, -14, 2, -6, 13, 0, 13, 3, 2, 1, 2, 9, 6, 12, 6, 14, 0, 12, -6, 14, -6, 12, -2, 9, -2, 1, -13, 3, -13, 0, -2,
      -6,
    ],
    WHITE,
    "#000",
    1,
  );
  ctx.restore();
  ctx.restore();
  // page title and map orientation
  rect(ctx, X0, TOP, MW, 18, "#22272C");
  txt(ctx, d.page ?? "MAP - NAVIGATION MAP", X0 + MW / 2, TOP + 9, WHITE, 12, "center");
  rect(ctx, X0 + 4, Y0 + 4, 54, 16, "#000");
  txt(ctx, "TRK UP", X0 + 31, Y0 + 12, WHITE, 11, "center");
}

/* ---------- standby instruments (round, analog) ---------- */

function dialFrame(ctx: Ctx, W: number, H: number): [number, number, number] {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2,
    cy = H / 2,
    r = Math.min(W, H) / 2 - 2;
  const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  g.addColorStop(0, "#4A4F55");
  g.addColorStop(1, "#1A1D20");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0A0B0C";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
  ctx.fill();
  return [cx, cy, r * 0.9];
}
/** Tapered needle from the centre toward angle `a` (clockwise from 12 o'clock). */
const needle = (ctx: Ctx, cx: number, cy: number, a: number, len: number, w: number, c = WHITE) => {
  const dx = Math.sin(a),
    dy = -Math.cos(a),
    px = Math.cos(a),
    py = Math.sin(a),
    tail = len * 0.12;
  poly(
    ctx,
    [
      cx + dx * len,
      cy + dy * len,
      cx - dx * tail + px * w,
      cy - dy * tail + py * w,
      cx - dx * tail - px * w,
      cy - dy * tail - py * w,
    ],
    c,
  );
};

/** Round standby airspeed indicator (kt) with white/green/yellow arcs and red Vne line. */
export function drawStandbyAirspeed(ctx: Ctx, W: number, H: number, ias: number, b: SpeedBands = {}, max = 200) {
  const [cx, cy, r] = dialFrame(ctx, W, H),
    u = r / 100;
  const ang = (v: number) => (15 + (clamp(v, 0, max) / max) * 320) * D2R; // clockwise from 12 o'clock
  const arc = (v0: number, v1: number, c: string, rr: number, lw: number) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = lw * u;
    ctx.beginPath();
    ctx.arc(cx, cy, rr * u, ang(v0) - Math.PI / 2, ang(v1) - Math.PI / 2);
    ctx.stroke();
  };
  if (b.white) arc(b.white[0], b.white[1], WHITE, 80, 5);
  if (b.green) arc(b.green[0], b.green[1], BAND.green, 88, 7);
  if (b.yellow) arc(b.yellow[0], b.yellow[1], BAND.yellow, 88, 7);
  for (let v = 40; v <= max; v += 10) {
    const a = ang(v),
      big = v % 20 === 0;
    line(
      ctx,
      cx + Math.sin(a) * 92 * u,
      cy - Math.cos(a) * 92 * u,
      cx + Math.sin(a) * (big ? 78 : 84) * u,
      cy - Math.cos(a) * (big ? 78 : 84) * u,
      WHITE,
      1.4 * u,
    );
    if (big) txt(ctx, String(v), cx + Math.sin(a) * 64 * u, cy - Math.cos(a) * 64 * u, WHITE, 11 * u, "center");
  }
  if (b.red) {
    const a = ang(b.red);
    line(
      ctx,
      cx + Math.sin(a) * 94 * u,
      cy - Math.cos(a) * 94 * u,
      cx + Math.sin(a) * 74 * u,
      cy - Math.cos(a) * 74 * u,
      RED,
      3 * u,
    );
  }
  txt(ctx, "AIRSPEED", cx, cy - 26 * u, WHITE, 8 * u, "center");
  txt(ctx, "KNOTS", cx, cy + 28 * u, WHITE, 8 * u, "center");
  needle(ctx, cx, cy, ang(Math.max(ias, 0)), 86 * u, 4 * u);
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(cx, cy, 6 * u, 0, Math.PI * 2);
  ctx.fill();
}

/** Round standby altimeter: 100 ft, 1,000 ft and 10,000 ft hands, Kollsman window (inHg). */
export function drawStandbyAltimeter(ctx: Ctx, W: number, H: number, alt: number, baro: number) {
  const [cx, cy, r] = dialFrame(ctx, W, H);
  drawAltimeterDial(ctx, cx, cy, r, alt, baro);
}

/** Three-hand sensitive-altimeter face, reusable inside an aircraft-specific bezel. `r` is the face radius. */
export function drawAltimeterDial(ctx: Ctx, cx: number, cy: number, r: number, alt: number, baro: number) {
  const u = r / 100;
  for (let i = 0; i < 50; i++) {
    const a = (i / 50) * Math.PI * 2,
      big = i % 5 === 0;
    line(
      ctx,
      cx + Math.sin(a) * 92 * u,
      cy - Math.cos(a) * 92 * u,
      cx + Math.sin(a) * (big ? 80 : 86) * u,
      cy - Math.cos(a) * (big ? 80 : 86) * u,
      WHITE,
      (big ? 2 : 1) * u,
    );
    if (big) txt(ctx, String(i / 5), cx + Math.sin(a) * 68 * u, cy - Math.cos(a) * 68 * u, WHITE, 14 * u, "center");
  }
  rect(ctx, cx + 30 * u, cy - 8 * u, 36 * u, 16 * u, "#000", "#777", 1);
  txt(ctx, baro.toFixed(2), cx + 48 * u, cy, WHITE, 9 * u, "center");
  txt(ctx, "ALT", cx, cy - 32 * u, WHITE, 9 * u, "center");
  const a100 = ((alt % 1000) / 1000) * Math.PI * 2,
    a1k = ((alt % 10000) / 10000) * Math.PI * 2,
    a10k = ((alt % 100000) / 100000) * Math.PI * 2;
  needle(ctx, cx, cy, a10k, 92 * u, 1.5 * u, "#BBB");
  needle(ctx, cx, cy, a1k, 52 * u, 6 * u);
  needle(ctx, cx, cy, a100, 84 * u, 3.5 * u);
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(cx, cy, 6 * u, 0, Math.PI * 2);
  ctx.fill();
}

/** Round standby attitude indicator. `flag` shows a red/orange warning flag, e.g. "GYRO" (vacuum) or "OFF" (electric). */
export function drawStandbyAttitude(ctx: Ctx, W: number, H: number, pitch: number, roll: number, flag?: string | null) {
  const [cx, cy, r] = dialFrame(ctx, W, H),
    u = r / 100;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-roll * D2R);
  const ppd = 2.6 * u;
  ctx.translate(0, pitch * ppd);
  ctx.fillStyle = "#2F7AD8";
  ctx.fillRect(-2 * r, -3 * r, 4 * r, 3 * r);
  ctx.fillStyle = "#7A4A1F";
  ctx.fillRect(-2 * r, 0, 4 * r, 3 * r);
  line(ctx, -2 * r, 0, 2 * r, 0, WHITE, 2 * u);
  for (const p of [-20, -10, 10, 20])
    line(
      ctx,
      -(Math.abs(p) === 10 ? 22 : 34) * u,
      -p * ppd,
      (Math.abs(p) === 10 ? 22 : 34) * u,
      -p * ppd,
      WHITE,
      1.5 * u,
    );
  ctx.translate(0, -pitch * ppd);
  for (const a of [-60, -30, -20, -10, 0, 10, 20, 30, 60]) {
    const ra = a * D2R,
      l = a === 0 ? 0 : Math.abs(a) % 30 === 0 ? 14 : 8;
    if (a === 0) poly(ctx, [0, -92 * u, -6 * u, -82 * u, 6 * u, -82 * u], WHITE);
    else
      line(
        ctx,
        Math.sin(ra) * 92 * u,
        -Math.cos(ra) * 92 * u,
        Math.sin(ra) * (92 - l) * u,
        -Math.cos(ra) * (92 - l) * u,
        WHITE,
        2 * u,
      );
  }
  ctx.restore();
  poly(ctx, [cx, cy - 92 * u + 12 * u, cx - 6 * u, cy - 92 * u + 22 * u, cx + 6 * u, cy - 92 * u + 22 * u], "#FF8A00");
  line(ctx, cx - 50 * u, cy, cx - 16 * u, cy, "#FF8A00", 4 * u);
  line(ctx, cx + 16 * u, cy, cx + 50 * u, cy, "#FF8A00", 4 * u);
  ctx.fillStyle = "#FF8A00";
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5 * u, 0, Math.PI * 2);
  ctx.fill();
  if (flag) {
    ctx.save();
    ctx.translate(cx - 44 * u, cy - 40 * u);
    ctx.rotate(-0.5);
    rect(ctx, -22 * u, -10 * u, 44 * u, 20 * u, "#E2401C", "#000", 1);
    txt(ctx, flag, 0, 1, WHITE, 11 * u, "center");
    ctx.restore();
  }
}
