"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FlowSpec } from "@/lib/catalogue";
import { curveOf } from "@/lib/geometry";
import { dotTex, mats } from "@/lib/materials";
import { sysColor } from "@/lib/systems";
import { useView } from "@/lib/view";
import type { PickInfo } from "./Part";

const noRaycast = () => {};
const chanDim = (f: FlowSpec, sysNow: string, focus: string) =>
  sysNow === "controls" && focus !== "all" && !f.chan?.includes(focus as never);

/**
 * All pipes/wires/ducts/cables of one airplane; one frame loop moves every particle.
 * `rates()` gives a speed multiplier per flow key (0 = stopped, negative = reversed);
 * `color(key, out)` may set a live particle colour and return true (e.g. cabin air following the temperature knob).
 */
export function Flows({
  flows,
  rates,
  color,
}: {
  flows: FlowSpec[];
  rates: () => Record<string, number>;
  color?: (key: string, out: THREE.Color) => boolean;
}) {
  const sys = useView((x) => x.sys);
  const xray = useView((x) => x.xray);
  const theme = useView((x) => x.theme);
  const cf = useView((x) => x.ctrlFocus);
  const spot = useView((x) => !!x.spot);

  const items = useMemo(
    () =>
      flows.map((f) => {
        const curve = curveOf(f.pts, f.tension ?? 0.3);
        const len = curve.getLength();
        const n = f.count ?? Math.max(6, Math.round(len * 9));
        const off = Float32Array.from({ length: n }, () => Math.random());
        const tube =
          f.tube === false
            ? null
            : new THREE.TubeGeometry(curve, Math.max(24, Math.round(len * 28)), f.r ?? 0.012, 6, false);
        const pgeo = new THREE.BufferGeometry();
        pgeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
        const pts = new THREE.Points(
          pgeo,
          new THREE.PointsMaterial({
            map: dotTex(),
            size: f.size ?? 0.08,
            transparent: true,
            depthWrite: false,
            sizeAttenuation: true,
          }),
        );
        pts.raycast = noRaycast;
        pts.visible = false;
        return { f, curve, len, n, off, tube, pts, t: 0 };
      }),
    [flows],
  );
  // free the GPU buffers when the airplane is switched away (the shared dot texture stays)
  useEffect(
    () => () =>
      items.forEach((it) => {
        it.tube?.dispose();
        it.pts.geometry.dispose();
        (it.pts.material as THREE.Material).dispose();
      }),
    [items],
  );

  const tmp = useRef(new THREE.Vector3());
  const live = useRef(new THREE.Color());
  useFrame((_, dt) => {
    const v = useView.getState();
    const R = rates();
    for (const it of items) {
      const rate = R[it.f.key] ?? 0;
      const vis =
        rate !== 0 &&
        !v.spot &&
        (v.sys === "overview" || it.f.sys.includes(v.sys)) &&
        !chanDim(it.f, v.sys, v.ctrlFocus);
      it.pts.visible = vis;
      if (!vis) continue;
      const mat = it.pts.material as THREE.PointsMaterial;
      if (color?.(it.f.key, live.current)) mat.color.copy(live.current);
      else mat.color.set(it.f.pcolor ?? it.f.color ?? sysColor(it.f.sys[0], v.theme));
      it.t += (dt * 0.9 * rate) / Math.max(it.len, 0.5);
      const a = it.pts.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < it.n; i++) {
        let u = (it.off[i] + it.t) % 1;
        if (u < 0) u += 1;
        it.curve.getPointAt(u, tmp.current);
        a.setXYZ(i, tmp.current.x, tmp.current.y, tmp.current.z);
      }
      a.needsUpdate = true;
    }
  });

  return (
    <>
      {items.map((it) => {
        const c = it.f.color ?? sysColor(it.f.sys[0], theme);
        // a walk-around spot dims every flow, with everything else it doesn't name
        const act = !spot && (sys === "overview" || it.f.sys.includes(sys)) && !chanDim(it.f, sys, cf);
        const pick: PickInfo | undefined = it.f.name
          ? { name: it.f.name, note: it.f.note ?? "", color: c, sys: it.f.sys }
          : undefined;
        return (
          <group key={it.f.key}>
            {it.tube && (
              <mesh geometry={it.tube} material={act || !xray ? mats(c).on : mats(c).dim} userData={{ pick }} />
            )}
            <primitive object={it.pts} />
          </group>
        );
      })}
    </>
  );
}
