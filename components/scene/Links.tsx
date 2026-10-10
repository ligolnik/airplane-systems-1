"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mats } from "@/lib/materials";
import { V } from "@/lib/math";
import { sysColor, type Chan, type SysId } from "@/lib/systems";
import { useView } from "@/lib/view";
import type { PickInfo } from "./Part";

/** A rod whose two end points move every frame (push-pull tubes, drop links, pedal links…). */
export interface LinkSpec {
  name: string;
  note: string;
  r: number;
  chan?: Chan;
  sys: SysId[];
  color?: string;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Renders `links`; `points()` returns the current [a, b] end points per key in airplane coordinates. */
export function Links({
  links,
  points,
}: {
  links: Record<string, LinkSpec>;
  points: () => Record<string, [THREE.Vector3, THREE.Vector3]>;
}) {
  const sys = useView((x) => x.sys);
  const xray = useView((x) => x.xray);
  const cf = useView((x) => x.ctrlFocus);
  const theme = useView((x) => x.theme);
  const spot = useView((x) => !!x.spot);
  const meshes = useRef<Record<string, THREE.Mesh | null>>({});
  const geo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 8), []);
  useEffect(() => () => geo.dispose(), [geo]);
  const tmp = useMemo(() => ({ mid: new THREE.Vector3(), dir: new THREE.Vector3() }), []);

  useFrame(() => {
    const L = points();
    for (const [k, [a, b]] of Object.entries(L)) {
      const m = meshes.current[k];
      if (!m) continue;
      tmp.dir.subVectors(b, a);
      const len = tmp.dir.length();
      m.position.copy(tmp.mid.addVectors(a, b).multiplyScalar(0.5));
      m.quaternion.setFromUnitVectors(UP, tmp.dir.normalize());
      const r = links[k].r;
      m.scale.set(r, len, r);
    }
  });

  return (
    <>
      {Object.entries(links).map(([k, l]) => {
        const dim = sys === "controls" && cf !== "all" && l.chan && cf !== l.chan;
        // a walk-around spot dims every linkage, with everything else it doesn't name
        const act = !spot && (sys === "overview" || l.sys.includes(sys)) && !dim;
        const c = l.color ?? "#8C959C";
        const pick: PickInfo = { name: l.name, note: l.note, color: sysColor(l.sys[0], theme), sys: l.sys };
        return (
          <mesh
            key={k}
            ref={(m) => {
              meshes.current[k] = m;
            }}
            geometry={geo}
            position={V(0, -10, 0)}
            material={act || !xray ? mats(c).on : mats(c).dim}
            userData={{ pick }}
          />
        );
      })}
    </>
  );
}
