"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Pin } from "@/components/scene/Part";
import { SPOT_COLOR } from "@/lib/spot";
import { useView } from "@/lib/view";
import { emphasisPoints, sightLine, stepCentroid, type Step } from "./walk";
import { useWalk, walkNow } from "./walk-store";

/** Halo colour for emphasized parts: a bright accent beside the orange spot. */
export const EMPHASIS_COLOR = "#FFE14D";
/** Halo radius, m, and pulse rate, Hz. */
const HALO_R = 0.018, // approximate: display size, not a source value
  PULSE_HZ = 1.2; // approximate: display rate, not a source value
/** Arrowhead at the far end of a line of sight, m. */
const ARROW_LEN = 0.12, // approximate: display size, not a source value
  ARROW_R = 0.03; // approximate: display size, not a source value

/**
 * Walk-around: a label pin on the current item's parts, so small ones (drains, static ports) are easy to find; the line
 * of sight for an item checked from somewhere else; pulsing halos on an emphasized item's parts.
 */
export function WalkMarker() {
  const walking = useView((x) => x.walking),
    phase = useWalk((x) => x.phase),
    at = useWalk((x) => x.at);
  const step = walking && phase === "walk" ? walkNow().steps[at] : undefined;
  const c = useMemo(() => (step ? stepCentroid(step) : null), [step]);
  if (!step || !c) return null;
  return (
    <>
      <Pin at={c} label={`${step.item.id} ${step.item.text}`} color={SPOT_COLOR} />
      <Sight step={step} />
      <Halos step={step} />
    </>
  );
}

/** A dashed line with an arrowhead, drawn through the skin, from where the pilot stands to what they look at. */
function Sight({ step }: { step: Step }) {
  const obj = useMemo(() => {
    const line = sightLine(step);
    if (!line) return null;
    const [a, b] = line;
    const dir = b.clone().sub(a).normalize();
    const l = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([a, b.clone().addScaledVector(dir, -ARROW_LEN)]),
      // approximate: dash and gap lengths are a display choice
      new THREE.LineDashedMaterial({ color: SPOT_COLOR, dashSize: 0.08, gapSize: 0.05, depthTest: false }),
    );
    l.computeLineDistances();
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(ARROW_R, ARROW_LEN, 12)
        .translate(0, -ARROW_LEN / 2, 0)
        .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir))
        .translate(b.x, b.y, b.z),
      new THREE.MeshBasicMaterial({ color: SPOT_COLOR, depthTest: false }),
    );
    l.renderOrder = head.renderOrder = 10;
    return new THREE.Group().add(l, head);
  }, [step]);
  useEffect(
    () => () =>
      obj?.children.forEach((o) => {
        const m = o as THREE.Mesh;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }),
    [obj],
  );
  return obj ? <primitive object={obj} /> : null;
}

/** Pulsing halos on every instance of an emphasized item's parts, drawn through the skin. */
function Halos({ step }: { step: Step }) {
  const pts = useMemo(() => emphasisPoints(step), [step]);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({ color: EMPHASIS_COLOR, transparent: true, depthTest: false, depthWrite: false }),
    [],
  );
  const geo = useMemo(() => new THREE.SphereGeometry(HALO_R, 16, 12), []);
  useEffect(
    () => () => {
      mat.dispose();
      geo.dispose();
    },
    [mat, geo],
  );
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    // approximate: the pulse's opacity and size range are a display choice
    const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * PULSE_HZ * 2 * Math.PI);
    mat.opacity = 0.35 + 0.5 * k;
    group.current?.children.forEach((o) => o.scale.setScalar(1 + 0.6 * k));
  });
  if (!pts.length) return null;
  return (
    <group ref={group}>
      {pts.map((p, i) => (
        <mesh key={i} position={p} geometry={geo} material={mat} renderOrder={11} />
      ))}
    </group>
  );
}
