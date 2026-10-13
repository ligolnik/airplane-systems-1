"use client";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { sysOf, useAircraft } from "@/aircraft";
import type { AircraftDef } from "@/aircraft/types";
import { outlineMat, shellUniforms } from "@/lib/materials";
import { V, clamp, ease } from "@/lib/math";
import { view } from "@/lib/registry";
import { palette } from "@/lib/systems";
import { nextFrame, setBuild, useBuild } from "@/lib/build";
import { advanceSimulation } from "@/lib/simulationClock";
import { prepareGeometry } from "@/lib/mesh/prebuilt";
import { CAMERA_FOV, cameraFitDistance as fitDist } from "@/lib/camera";
import { useView } from "@/lib/view";
import type { PickInfo } from "./Part";
import { PinDeclutter, pinPolicy } from "./PinDeclutter";

/**
 * Camera views are framed for the desktop viewport (about 0.9 wide per unit height). On narrower or portrait
 * viewports, back the camera off along its line of sight so the same system stays in frame.
 */
/** How far (m, squared) the camera or its target must go from where a press found them to count as moved. */
const MOVED = 1e-6;

/** Animates the camera to the latest requested view; any user drag cancels the flight. */
function CameraRig() {
  const cam = useView((x) => x.cam);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const applied = useRef<[typeof cam, typeof controls, typeof camera] | null>(null);
  const flight = useRef<{
    fp: THREE.Vector3;
    ft: THREE.Vector3;
    tp: THREE.Vector3;
    tt: THREE.Vector3;
    t0: number;
  } | null>(null);
  /** Camera and target at the user's last press (re-noted after a viewport fit), until the camera moves or is moved. */
  const press = useRef<{ p: THREE.Vector3; t: THREE.Vector3 } | null>(null);

  const fit = fitDist(size.width / size.height);
  const previousFit = useRef(1);
  // Fit the starting view and preserve the user's orbit/zoom when the viewport changes shape.
  useEffect(() => {
    if (!controls) return;
    const ratio = fit / previousFit.current;
    previousFit.current = fit;
    camera.position
      .sub(controls.target)
      .multiplyScalar(ratio)
      .clampLength(controls.minDistance, controls.maxDistance)
      .add(controls.target);
    const f = flight.current;
    if (f) {
      f.fp.sub(f.ft).multiplyScalar(ratio).add(f.ft);
      f.tp.sub(f.tt).multiplyScalar(ratio).add(f.tt);
    }
    // the fit's own motion isn't the user's; a press still held is measured from here on
    const held = press.current;
    if (held) {
      held.p.copy(camera.position);
      held.t.copy(controls.target);
    }
  }, [controls, camera, fit]);

  // Apply requests before OrbitControls updates, so their own motion cannot count as a drag.
  const applyRequest = () => {
    if (useView.getState().cam !== cam) return;
    const prev = applied.current;
    applied.current = cam && controls ? prev : null;
    if (!cam || !controls || previousFit.current !== fit) return;
    if (prev && prev[0] === cam && prev[1] === controls && prev[2] === camera) return;
    // A saved restore must wait for the canvas to measure the stage, before any orbit-limit clamp.
    if (cam.restore) {
      const rect = controls.domElement?.parentElement?.getBoundingClientRect();
      const walking = controls.domElement?.closest(".app.walking");
      if (walking || (rect && (rect.width !== size.width || rect.height !== size.height))) {
        flight.current = null;
        press.current = null;
        return;
      }
    }
    applied.current = [cam, controls, camera];
    press.current = null;
    // drop any momentum left from a drag (damping would keep turning the camera after the jump or flight);
    // an update with damping off zeroes it, then the camera is put back where it was
    const p0 = camera.position.clone(),
      t0 = controls.target.clone();
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = true;
    camera.position.copy(p0);
    controls.target.copy(t0);
    const tt = V(...cam.t),
      tp = V(...cam.p)
        .sub(tt)
        .multiplyScalar(cam.exact ? 1 : fitDist(size.width / size.height))
        .add(tt);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      flight.current = null;
      camera.position.copy(tp);
      controls.target.copy(tt);
      return;
    }
    flight.current = { fp: camera.position.clone(), ft: controls.target.clone(), tp, tt, t0: performance.now() };
  };
  useFrame(applyRequest, -2);

  useEffect(() => {
    view.camera = camera;
    view.target = controls?.target ?? null;
  }, [camera, controls]);

  useEffect(() => {
    if (!controls) return;
    // a press stops a flight; it counts as a camera move only once the camera moves (a tap just shows a part's note)
    const start = () => {
      applied.current = [useView.getState().cam, controls, camera];
      flight.current = null;
      press.current = { p: camera.position.clone(), t: controls.target.clone() };
    };
    const change = () => {
      const was = press.current;
      if (!was) return;
      if (camera.position.distanceToSquared(was.p) < MOVED && controls.target.distanceToSquared(was.t) < MOVED) return;
      press.current = null;
      view.moves++;
    };
    controls.addEventListener("start", start);
    controls.addEventListener("change", change);
    return () => {
      controls.removeEventListener("start", start);
      controls.removeEventListener("change", change);
    };
  }, [controls, camera]);

  useFrame(() => {
    const f = flight.current;
    if (!f || !controls) return;
    const u = clamp((performance.now() - f.t0) / 1000, 0, 1),
      e = ease(u);
    camera.position.lerpVectors(f.fp, f.tp, e);
    controls.target.lerpVectors(f.ft, f.tt, e);
    if (u >= 1) flight.current = null;
  });
  return null;
}

function SimClock({ tick }: { tick: (dt: number) => void }) {
  useFrame((_, dt) => advanceSimulation(dt, tick));
  return null;
}

/** Keeps shared shader/line materials in step with theme and x-ray mode. */
function MaterialSync() {
  const theme = useView((x) => x.theme);
  const xray = useView((x) => x.xray);
  useEffect(() => {
    shellUniforms.uColor.value.set(palette(theme).shell);
    shellUniforms.uOpacity.value = theme === "dark" ? 0.55 : 0.6;
    outlineMat.color.set(xray ? palette(theme).shell : "#10171C");
    outlineMat.opacity = xray ? 0.75 : 0.9;
  }, [theme, xray]);
  return null;
}

/* ---------- hover (and tap): prefer a real part over the ghost shell in front of it ---------- */
function usePicker() {
  const setHover = useView((x) => x.setHover);
  return (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.buttons) {
      setHover(null);
      return;
    }
    const { sys, xray } = useView.getState();
    const cands = e.intersections.filter((h) => {
      const p = h.object.userData?.pick as PickInfo | undefined;
      return p && h.object.visible && (sys === "overview" || p.shell || p.sys.includes(sys));
    });
    // only the X-ray ghost skin can be seen through; the solid skin hides what is behind it
    const hit = xray ? (cands.find((h) => !(h.object.userData.pick as PickInfo).shell) ?? cands[0]) : cands[0];
    if (!hit) {
      setHover(null);
      return;
    }
    const p = hit.object.userData.pick as PickInfo;
    setHover({ name: p.name, note: p.note, color: p.color, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
  };
}

/**
 * The loader's end for an airplane built in one go: "airframe" before its deferred model mounts, "ready" with the first frame
 * whose model group has content (the model may mount a frame or more after the scene, e.g. after starting its shader
 * compile).
 */
function BuildMarks({ modelRef }: { modelRef: React.RefObject<THREE.Group | null> }) {
  // in the commit, so no frame can come between it and the mount
  useLayoutEffect(() => setBuild("airframe"), []);
  useFrame(() => {
    if (useBuild.getState().stage !== "ready" && modelRef.current?.children.length) setBuild("ready");
  });
  return null;
}

/** One airplane: the root group (rotation pivot) around the picking group with the model inside. */
function AircraftScene({ def, gridRef }: { def: AircraftDef; gridRef: React.RefObject<THREE.GridHelper | null> }) {
  const rootRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const onMove = usePicker();
  const setHover = useView((x) => x.setHover);
  const { Model, Overlay } = def;
  // A one-shot model can block in render while it builds geometry. Commit the loader and give the browser a paint
  // before mounting it. AircraftScene is keyed by id, so an obsolete deferred mount is cancelled on a switch.
  const [mountModel, setMountModel] = useState(!!def.progressive);
  useEffect(() => {
    if (def.progressive) return;
    let current = true;
    void nextFrame().then(async () => {
      if (!current) return;
      if (def.labels) await prepareGeometry(def.labels.cat);
      if (current) setMountModel(true);
    });
    return () => {
      current = false;
    };
  }, [def]);
  const pins = useMemo(() => (def.labels ? pinPolicy(def.labels.cat, def.labels.inside) : {}), [def]);
  return (
    <>
      <group ref={rootRef} position={[def.pivotX, 0, 0]}>
        {/* Touch has no hover: a tap (a click that is not the end of a drag) shows the note the same way.
            Switching airplane remounts the model. Parts, shells and control surfaces reuse cached geometry and shared
            materials (passed as props, which R3F never disposes); R3F disposes JSX-created geometry and materials, and
            Flows, Screens, Tanks, LightFX, Links and WindowOutlines free what they build. */}
        <group
          ref={modelRef}
          position={[-def.pivotX, 0, 0]}
          onPointerMove={onMove}
          onClick={(e) => {
            if (e.delta <= 4) onMove(e);
          }}
          onPointerOut={() => setHover(null)}
        >
          {mountModel && <Model />}
        </group>
      </group>
      {mountModel && Overlay && <Overlay rootRef={rootRef} modelRef={modelRef} gridRef={gridRef} />}
      {!def.progressive && <BuildMarks modelRef={modelRef} />}
      <PinDeclutter {...pins} />
    </>
  );
}

export default function Scene() {
  const def = useAircraft();
  const theme = useView((x) => x.theme);
  const spin = useView((x) => x.spin);
  const pal = palette(theme);
  const gridRef = useRef<THREE.GridHelper>(null);
  // initial camera only: later moves are camera flights, so the controls' target prop must stay stable
  const [[startPos, startTarget]] = useState(() => sysOf(def, useView.getState().sys).cam);

  useEffect(() => {
    const g = gridRef.current;
    if (!g) return;
    (g.material as THREE.LineBasicMaterial).color.set(pal.grid);
  }, [pal.grid]);

  return (
    <Canvas
      flat
      dpr={[1, 2]}
      camera={{ fov: CAMERA_FOV, near: 0.05, far: 400, position: startPos }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
      }}
      onPointerMissed={() => useView.getState().setHover(null)}
      aria-label={`3D model of the ${def.name} and its systems`}
    >
      <color attach="background" args={[pal.scene]} />
      {/* pre-r155 light intensities × π for physically-based lighting */}
      <hemisphereLight args={["#ffffff", "#445566", 0.85 * Math.PI]} />
      <directionalLight position={[6, 10, 5]} intensity={0.9 * Math.PI} />
      <directionalLight position={[-6, 3, -6]} intensity={0.35 * Math.PI} />
      <gridHelper
        ref={gridRef}
        args={[40, 40, "#ffffff", "#ffffff"]}
        position-y={def.groundY}
        onUpdate={(g) => {
          const m = g.material as THREE.LineBasicMaterial;
          m.transparent = true;
          m.opacity = 0.5;
          m.color.set(pal.grid);
        }}
      />
      <MaterialSync />
      <AircraftScene key={def.id} def={def} gridRef={gridRef} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={0.4}
        maxDistance={70}
        autoRotate={spin}
        autoRotateSpeed={0.6}
        target={startTarget}
      />
      <CameraRig />
      <SimClock tick={def.tick} />
    </Canvas>
  );
}
