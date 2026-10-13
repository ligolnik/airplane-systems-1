import { afterEach, describe, expect, it } from "vitest";
import { applyCameraPreset, aircraft, FLEET, selectAircraft, sysOf } from "@/aircraft";
import { airplaneBounds, CAMERA_PRESETS, parseCameraPreset, viewPresetCamera } from "@/lib/camera";
import { useView } from "@/lib/view";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from "three";
import { useSR22T } from "@/aircraft/sr22t/store";

const initialView = useView.getState();
const initialStore = useSR22T.getState();
afterEach(() => {
  useView.setState(initialView);
  useSR22T.setState(initialStore);
});
describe("URL preset focus selection", () => {
  it("keeps the upstream boot camera when the URL has no cam parameter", () => {
    selectAircraft("sr22t", "electrical");
    const requested = useView.getState().cam;
    const preset = parseCameraPreset(new URLSearchParams("").get("cam"));
    if (preset) applyCameraPreset(preset);
    expect(useView.getState().cam).toBe(requested);
    const [p, t] = sysOf(aircraft("sr22t"), "electrical").cam;
    expect(requested).toMatchObject({ p, t });
    expect(requested?.preset).toBeUndefined();
  });
  it.each(["engine", "overview"] as const)("uses the %s view's camera", (sys) => {
    useView.setState({ ac: "sr22t", sys });
    applyCameraPreset("top");
    const [p, t] = sysOf(aircraft("sr22t"), sys).cam;
    expect(useView.getState().cam).toMatchObject({ p, t, preset: "top" });
  });
  it("retains the airplane's active focus override", () => {
    useView.setState({ ac: "sr22t", sys: "caps" });
    useSR22T.getState().update((s) => {
      s.capsOn = true;
    });
    const [p, t] = aircraft("sr22t").resetCam!()!;
    applyCameraPreset("side");
    expect(useView.getState().cam).toMatchObject({ p, t, preset: "side" });
  });
});

describe("fleet overview presets while the model mounts", () => {
  it.each(FLEET.flatMap((def) => CAMERA_PRESETS.map((preset) => [def.id, preset] as const)))(
    "%s %s keeps a finite camera before mounting and fits the mounted model",
    (ac, preset) => {
      useView.setState({ ac, sys: "overview" });
      applyCameraPreset(preset);
      const request = useView.getState().cam!;
      const model = new Group();
      const empty = airplaneBounds(model);
      expect(empty.isEmpty()).toBe(true);
      // One-shot aircraft also mount later than their camera rig.
      const waiting = viewPresetCamera(preset, request.p, request.t, empty, 38, 820 / 900);
      expect(waiting).toEqual([request.p, request.t]);
      expect(waiting.flat().every(Number.isFinite)).toBe(true);

      const geometry = new BoxGeometry(8, 4, 12);
      const material = new MeshBasicMaterial();
      try {
        const physical = new Mesh(geometry, material);
        physical.userData.cameraBounds = true;
        model.add(physical);
        const bounds = airplaneBounds(model);
        for (const aspect of [820 / 900, 390 / 400]) {
          const [p, t] = viewPresetCamera(preset, request.p, request.t, bounds, 38, aspect);
          expect([...p, ...t].every(Number.isFinite)).toBe(true);
          expect(t).toEqual(request.t);
          const camera = new PerspectiveCamera(38, aspect, 0.05, 400);
          camera.position.set(...p);
          camera.lookAt(new Vector3(...t));
          camera.updateMatrixWorld();
          expect(camera.quaternion.toArray().every(Number.isFinite)).toBe(true);
          for (const x of [-4, 4])
            for (const y of [-2, 2])
              for (const z of [-6, 6]) {
                const corner = new Vector3(x, y, z).project(camera);
                expect(Math.abs(corner.x)).toBeLessThanOrEqual(0.800001);
                expect(Math.abs(corner.y)).toBeLessThanOrEqual(0.800001);
              }
        }
      } finally {
        geometry.dispose();
        material.dispose();
      }
    },
  );
});
