"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { V } from "@/lib/math";
import { sysColor } from "@/lib/systems";
import { useView } from "@/lib/view";
import { Pin } from "./Part";

export interface TankSpec {
  key: string;
  /** Closed volume of the tank (airplane coordinates). */
  geo: () => THREE.BufferGeometry;
  /** Fill fraction 0..1, read every frame. */
  level: () => number;
  name: string;
  note: string;
  color?: string;
}

/** Fuel tanks: a faint shell plus a fuel volume whose level is a clipping plane. Shown strongly in Overview and Fuel. */
export function Tanks({ tanks }: { tanks: TankSpec[] }) {
  const sys = useView((x) => x.sys);
  const labels = useView((x) => x.labels);
  const theme = useView((x) => x.theme);
  const spot = useView((x) => !!x.spot);
  const items = useMemo(
    () =>
      tanks.map((t) => {
        const geo = t.geo();
        geo.computeBoundingBox();
        geo.computeBoundingSphere();
        const plane = new THREE.Plane(V(0, -1, 0), 0);
        const c = t.color ?? "#2F7FE6";
        return {
          t,
          geo,
          plane,
          ymin: geo.boundingBox!.min.y,
          ymax: geo.boundingBox!.max.y,
          fuelMesh: null as THREE.Mesh | null,
          shell: new THREE.MeshStandardMaterial({
            color: c,
            transparent: true,
            opacity: 0.12,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
          fuel: new THREE.MeshStandardMaterial({
            color: c,
            transparent: true,
            opacity: 0.62,
            clippingPlanes: [plane],
            side: THREE.DoubleSide,
            depthWrite: false,
            emissive: new THREE.Color("#0B3A80"),
          }),
        };
      }),
    [tanks],
  );
  useEffect(
    () => () =>
      items.forEach((it) => {
        it.geo.dispose();
        it.shell.dispose();
        it.fuel.dispose();
      }),
    [items],
  );
  useFrame(() => {
    for (const it of items) {
      const q = Math.max(0, Math.min(1, it.t.level()));
      it.plane.constant = it.ymin + (it.ymax - it.ymin) * Math.pow(q, 0.8) + (q > 0 ? 0.004 : -0.1);
      if (it.fuelMesh) it.fuelMesh.visible = q > 0;
    }
  });
  // a walk-around spot dims the tanks with everything else it doesn't name
  const act = !spot && (sys === "overview" || sys === "fuel");
  return (
    <>
      {items.map((it) => {
        it.shell.opacity = act ? 0.14 : 0.05;
        it.fuel.opacity = act ? 0.62 : 0.12;
        return (
          <group key={it.t.key}>
            <mesh
              geometry={it.geo}
              material={it.shell}
              userData={{ pick: { name: it.t.name, note: it.t.note, color: it.t.color ?? "#2F7FE6", sys: ["fuel"] } }}
            >
              {labels && sys === "fuel" && (
                <Pin at={it.geo.boundingSphere!.center} label={it.t.name} color={sysColor("fuel", theme)} />
              )}
            </mesh>
            <mesh
              ref={(m) => {
                it.fuelMesh = m;
              }}
              geometry={it.geo}
              material={it.fuel}
              raycast={() => null}
            />
          </group>
        );
      })}
    </>
  );
}
