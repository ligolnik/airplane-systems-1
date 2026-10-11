/**
 * Declarative part catalogue shared by every airplane.
 * Geometry is built lazily (browser only). Positions are in airplane coordinates unless the
 * part has a `parent`, in which case they are relative to that moving group.
 */
import type * as THREE from "three";
import { loft, type Ring } from "./geometry";
import { sidePaintUV, type PaintBox } from "./livery";
import { V, toVec3, type Vec3 } from "./math";
import type { Chan, SysId } from "./systems";

/**
 * Study-group ids an airplane registers by declaration merging (the SR22T's come from `ENGINE_GROUPS` in
 * aircraft/sr22t/engine-groups.ts), so a mistyped `groups` tag is a type error.
 */
export interface StudyGroups {}
export type StudyGroup = keyof StudyGroups & string;

/** Rejects a `groups` tag outside `allowed` at registration, for specs the types don't reach (casts, JSON). */
export function checkGroups(id: string, groups: readonly string[] | undefined, allowed: readonly string[]) {
  const bad = groups?.find((group) => !allowed.includes(group));
  if (bad !== undefined)
    throw new Error(`${id}: unknown group "${bad}" in its groups tag; use ${allowed.join(", ")}, or [] for core`);
}

/** Per-frame hook for parts that animate or change material with the sim (t = clock seconds). */
export type PartAnim = (mesh: THREE.Mesh, t: number) => void;

export interface PartSpec {
  id: string;
  geo: () => THREE.BufferGeometry;
  sys: SysId[];
  name?: string;
  note?: string;
  /** Gets a label pin in its systems' views (first part of each name only). */
  pin?: boolean;
  /** Show the label pin only in these system views (it still appears in every pinned system's "tap to locate" list). */
  pinIn?: SysId[];
  /** Intentionally outside the skin (gear, antennas, probes…). */
  ext?: boolean;
  color?: string;
  /** Physical finish in solid mode, keeping the study colour for x-ray. */
  solidColor?: string;
  pos?: Vec3;
  rot?: Vec3;
  scale?: Vec3;
  /** Moving group this part rides on (e.g. "surf:elevR", "blade:0"); the airplane's Model renders it. */
  parent?: string;
  anim?: PartAnim;
  /** Animation owns replacement geometry; release it on unmount and retain the shared catalogue geometry. */
  dynamicGeo?: boolean;
  /** Optional equipment: while this returns false the part is left out of `partsFor` and `pinned` (scene, pins, lists). */
  fitted?: () => boolean;
  /** Optional study-group memberships (e.g. the SR22T engine groups); `[]` is core. */
  groups?: StudyGroup[];
  /** Translucent plate (bulkheads, firewalls). */
  plate?: boolean;
  /**
   * Cover over other modelled parts (wheel pants, heater shrouds, rear windows, pedestals): in X-ray it ghosts like the skin —
   * rim-lit in the overview, tinted with its first system's colour in its own systems' views — and picks like the skin, so what
   * it covers stays visible and hoverable. Solid when X-ray is off.
   */
  fairing?: boolean;
  /** Flight-control channel(s) this part belongs to (for the channel focus view). */
  chan?: Chan[];
}

export interface ShellSpec {
  id: string;
  geo: () => THREE.BufferGeometry;
  name: string;
  note: string;
  /** Painter for the solid-mode skin texture (needs UVs on the geometry). */
  skin?: () => THREE.Texture;
  finish?: "polished" | "red";
}

/** Control surface hinged at `pivot` about `axis`; its geometry is already hinge-relative. */
export interface SurfaceSpec {
  key: string;
  geo: () => THREE.BufferGeometry;
  pivot: Vec3;
  axis: Vec3;
  sys: SysId[];
  name: string;
  note: string;
  chan?: Chan[];
  /** Paint stays attached to the moving geometry in solid mode. */
  skin?: () => THREE.Texture;
}

/** Pipe / wire / duct / cable with moving particles. */
export interface FlowSpec {
  key: string;
  pts: (Vec3 | THREE.Vector3)[];
  sys: SysId[];
  name?: string;
  note?: string;
  color?: string;
  /** Particle colour (defaults to `color`, then the system colour). */
  pcolor?: string;
  r?: number;
  /** false = particles only, no pipe. */
  tube?: boolean;
  count?: number;
  size?: number;
  tension?: number;
  ext?: boolean;
  chan?: Chan[];
  /** Optional study-group memberships, as on `PartSpec`. */
  groups?: StudyGroup[];
}

/** Channel from a surface/cable key prefix: elev…/el… → elevator, ail… → aileron, rud… → rudder. */
export const chanOfKey = (k: string): Chan[] | undefined =>
  k.startsWith("elev") || k.startsWith("el")
    ? ["elevator"]
    : k.startsWith("ail")
      ? ["aileron"]
      : k.startsWith("rud")
        ? ["rudder"]
        : undefined;

type PartOpts = Omit<PartSpec, "id" | "geo" | "sys">;

/** Fitted, visible parts of a cached list; preserve the list when no filtering is needed. */
const visibleOnly = (l: PartSpec[], hidden?: (spec: PartSpec) => boolean) =>
  hidden || l.some((p) => p.fitted) ? l.filter((p) => (!p.fitted || p.fitted()) && !hidden?.(p)) : l;

/**
 * Per-view label lists, by part name, for views that would otherwise pile labels up. In quiet/narrow lists, names that
 * match no pinned part of the view are reported in development. Priority names are checked by airplane tests.
 */
export interface LabelLists {
  /** Pins that win overlaps in a view, in listed order, before the normal home-system/catalogue ranking. */
  priority?: Partial<Record<SysId, string[]>>;
  /** Pinned parts that stay in a view's "tap to locate" list but carry no label pin there. */
  quiet?: Partial<Record<SysId, string[]>>;
  /** Phone layout (lib/view `narrowLayout`): the only parts labelled in a view; the list keeps them all. */
  narrow?: Partial<Record<SysId, string[]>>;
}

/** Collects one airplane's parts, shells and control surfaces. Methods are bound, so they can be destructured. */
export class Catalogue {
  readonly parts: PartSpec[] = [];
  readonly shells: ShellSpec[] = [];
  readonly surfaces: SurfaceSpec[] = [];
  private n = 0;
  private byParent = new Map<string, PartSpec[]>();
  private pins = new Map<SysId, PartSpec[]>();
  private pinIds = new Map<string, Set<string>>();

  /** `paintSkin`: the airplane's painter for the solid-mode skin of shells added with `skin` true; `groupIds`: the
   * study-group ids `part()` accepts in a `groups` tag (others throw). */
  constructor(
    readonly prefix: string,
    readonly labels: LabelLists = {},
    private readonly paintSkin?: () => THREE.Texture,
    private readonly hidden?: (spec: PartSpec) => boolean,
    private readonly groupIds?: readonly string[],
  ) {}

  uid = (s: string) => `${this.prefix}/${s}-${this.n++}`;

  part = (geo: () => THREE.BufferGeometry, sys: SysId[], o: PartOpts = {}) => {
    if (this.groupIds) checkGroups(`${this.prefix}/${o.name || "part"}-${this.n}`, o.groups, this.groupIds);
    const spec: PartSpec = { id: this.uid(o.name || "part"), geo, sys, ...o };
    this.parts.push(spec);
    this.byParent.clear();
    this.pins.clear();
    this.pinIds.clear();
    return spec;
  };

  /** A skin shell; `skin` true paints it with the catalogue's `paintSkin` in solid mode (or pass a painter). */
  shell = (
    geo: () => THREE.BufferGeometry,
    name: string,
    note: string,
    skin: boolean | (() => THREE.Texture) = false,
  ) => {
    const spec: ShellSpec = {
      id: this.uid(name),
      geo,
      name,
      note,
      skin: skin === true ? this.paintSkin : skin || undefined,
    };
    this.shells.push(spec);
    return spec;
  };

  surface = (spec: SurfaceSpec) => {
    this.surfaces.push({ chan: chanOfKey(spec.key), ...spec });
    return spec;
  };

  /**
   * Control surface lofted through `secs` (airplane coordinates) and hinged on the line from `a` to `b`: the geometry is
   * moved to be hinge-relative and the axis points from `a` to `b`.
   */
  loftSurface = (
    key: string,
    secs: () => Ring[],
    a: THREE.Vector3,
    b: THREE.Vector3,
    sys: SysId[],
    name: string,
    note: string,
    paint?: { box: PaintBox; skin: () => THREE.Texture },
  ) =>
    this.surface({
      key,
      pivot: toVec3(a),
      axis: toVec3(b.clone().sub(a).normalize()),
      sys,
      name,
      note,
      skin: paint?.skin,
      geo: () => {
        const raw = loft(secs());
        const g = paint ? sidePaintUV(raw, paint.box) : raw;
        g.translate(-a.x, -a.y, -a.z);
        return g;
      },
    });

  surfacePivot = (key: string) => this.surfaces.find((s) => s.key === key)!.pivot;

  /** A part riding on control surface `key`, placed at `world` (airplane coordinates); its channel follows the key. */
  onSurface = (
    key: string,
    world: THREE.Vector3 | Vec3,
    geo: () => THREE.BufferGeometry,
    o: Omit<PartSpec, "id" | "geo" | "sys"> & { sys?: SysId[] },
  ) => {
    const pv = this.surfacePivot(key),
      w = Array.isArray(world) ? V(...world) : world;
    return this.part(geo, o.sys || ["controls"], {
      chan: chanOfKey(key),
      ...o,
      parent: "surf:" + key,
      pos: [w.x - pv[0], w.y - pv[1], w.z - pv[2]],
    });
  };

  /** Parts riding on a moving group (or the fixed airframe when parent is undefined). */
  partsFor = (parent?: string) => {
    const k = parent ?? "";
    let l = this.byParent.get(k);
    if (!l) {
      l = this.parts.filter((p) => (p.parent ?? "") === k);
      this.byParent.set(k, l);
    }
    return visibleOnly(l, this.hidden);
  };

  /** Unique pinned, named parts for a system (labels and "tap to locate" lists). */
  pinned = (sys: SysId) => visibleOnly(this.allPinned(sys), this.hidden);

  /** `pinned` with unfitted equipment included, so cached label ids survive an equipment change. */
  private allPinned(sys: SysId) {
    let l = this.pins.get(sys);
    if (!l) {
      const seen = new Set<string>();
      l = this.parts.filter(
        (p) => p.pin && p.name && p.sys.includes(sys) && !seen.has(p.name) && (seen.add(p.name), true),
      );
      this.pins.set(sys, l);
    }
    return l;
  }

  /** Does this part carry the label pin in the given system view? (`pin`, `pinIn`, then the airplane's label lists.) */
  isPinned = (spec: PartSpec, sys: SysId, narrow = false) => {
    const nar = !!this.labels.narrow && narrow,
      key = nar ? sys + ":narrow" : sys;
    let s = this.pinIds.get(key);
    if (!s) {
      const pinned = this.allPinned(sys),
        quiet = this.labels.quiet?.[sys] ?? [],
        only = nar ? (this.labels.narrow?.[sys] ?? []) : null;
      if (process.env.NODE_ENV !== "production") {
        const names = new Set(pinned.map((p) => p.name));
        for (const n of [...quiet, ...(only ?? [])])
          if (!names.has(n))
            console.warn(
              `${this.prefix}: label list for "${sys}" names "${n}", which is not a pinned part of that view`,
            );
      }
      s = new Set(
        pinned
          .filter(
            (p) => (!p.pinIn || p.pinIn.includes(sys)) && (only ? only.includes(p.name!) : !quiet.includes(p.name!)),
          )
          .map((p) => p.id),
      );
      this.pinIds.set(key, s);
    }
    return s.has(spec.id);
  };
}
