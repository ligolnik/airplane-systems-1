"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Catalogue, SurfaceSpec } from "@/lib/catalogue";
import { seeMat, shellMat, skinMat, solidMat } from "@/lib/materials";
import { V } from "@/lib/math";
import { geoCentreZ, SPOT_COLOR, spotsAt } from "@/lib/spot";
import { sysColor } from "@/lib/systems";
import { useView } from "@/lib/view";
import { Parts, specGeo, type PickInfo } from "./Part";

/** Hover through a see-through surface: when the ray also meets one of the surface's own parts that the current view
 *  can pick (a balance weight or horn seen through it), the surface stands aside so that part gets the tooltip. */
function surfaceRaycast(this: THREE.Mesh, rc: THREE.Raycaster, hits: THREE.Intersection[]) {
  const own: THREE.Intersection[] = [];
  THREE.Mesh.prototype.raycast.call(this, rc, own);
  if (!own.length) return;
  if ((this.material as THREE.Material).userData.seeThrough) {
    const sys = useView.getState().sys,
      inner: THREE.Intersection[] = [];
    for (const o of this.parent?.children ?? []) {
      const p = o.userData.pick as PickInfo | undefined;
      if (o !== this && o instanceof THREE.Mesh && o.visible && p?.sys.includes(sys)) o.raycast(rc, inner);
    }
    if (inner.length) return;
  }
  hits.push(...own);
}

/** A control surface rotating about its hinge line; `angle` gives its deflection (radians) every frame. */
export function ControlSurface({
  spec,
  cat,
  angle,
}: {
  spec: SurfaceSpec;
  cat: Catalogue;
  angle: (key: string) => number;
}) {
  const geo = specGeo(spec);
  const ref = useRef<THREE.Group>(null!);
  const axis = useMemo(() => V(...spec.axis), [spec]);
  const sys = useView((x) => x.sys);
  const xray = useView((x) => x.xray);
  const theme = useView((x) => x.theme);
  const cf = useView((x) => x.ctrlFocus);
  const spotted = useView((x) => spotsAt(x.spot, spec.name, geoCentreZ(geo) + spec.pivot[2]));
  const spotOn = useView((x) => !!x.spot);
  const chanDim = sys === "controls" && cf !== "all" && !spec.chan?.includes(cf);
  // a walk-around spot dims every surface it doesn't name, the shown system's included
  const active = spotted || (!spotOn && sys !== "overview" && spec.sys.includes(sys) && !chanDim);
  const color = sysColor(spec.sys[0], theme);
  // highlighted in its own view; in X-ray the highlight is translucent so the balance weights inside show
  const material = xray
    ? spotted
      ? seeMat(SPOT_COLOR)
      : active
        ? seeMat(color)
        : shellMat
    : spec.skin
      ? skinMat(spec.skin)
      : solidMat;
  useFrame(() => {
    ref.current.quaternion.setFromAxisAngle(axis, angle(spec.key));
  });
  const pick: PickInfo = { name: spec.name, note: spec.note, color, sys: spec.sys };
  return (
    <group ref={ref} position={spec.pivot}>
      <mesh
        geometry={geo}
        material={material}
        renderOrder={xray ? 2 : 0}
        raycast={surfaceRaycast}
        userData={{ pick }}
      />
      <Parts cat={cat} parent={"surf:" + spec.key} />
    </group>
  );
}

export const ControlSurfaces = ({ cat, angle }: { cat: Catalogue; angle: (key: string) => number }) => (
  <>
    {cat.surfaces.map((s) => (
      <ControlSurface key={s.key} spec={s} cat={cat} angle={angle} />
    ))}
  </>
);
