import { afterEach, describe, expect, it, vi } from "vitest";
import { CAMERA_PRESETS, parseCameraPreset, presetCamera, airplaneBounds, viewPresetCamera } from "../lib/camera";
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from "three";

afterEach(() => vi.restoreAllMocks());
describe("initial camera presets", () => {
  it("leaves absent parameters on the default view without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseCameraPreset(new URLSearchParams("").get("cam"))).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
  it.each(CAMERA_PRESETS)("accepts %s from the query", (preset) => {
    expect(parseCameraPreset(new URLSearchParams(`cam=${preset}`).get("cam"))).toBe(preset);
  });
  it.each(["", "TOP", "rear", "top,side"])("warns and uses the default for %s", (value) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseCameraPreset(value)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Using the default view"));
  });
  for (const aspect of [820 / 900, 390 / 400, 0.5]) {
    it.each(CAMERA_PRESETS)(`fits all corners with margin at aspect ${aspect}: %s`, (preset) => {
      const bounds = new Box3(new Vector3(-4, -2, -6), new Vector3(3, 2, 6));
      const [p, t] = presetCamera(preset, bounds, 38, aspect);
      const camera = new PerspectiveCamera(38, aspect, 0.05, 400);
      camera.position.set(...p);
      camera.lookAt(new Vector3(...t));
      camera.updateMatrixWorld();
      expect(t).toEqual([-0.5, 0, 0]);
      for (const x of [-4, 3])
        for (const y of [-2, 2])
          for (const z of [-6, 6]) {
            const projected = new Vector3(x, y, z).project(camera);
            expect(Math.abs(projected.x)).toBeLessThanOrEqual(0.800001);
            expect(Math.abs(projected.y)).toBeLessThanOrEqual(0.800001);
            expect(projected.z).toBeGreaterThan(-1);
            expect(projected.z).toBeLessThan(1);
          }
      if (preset === "top") {
        const nose = new Vector3(3, 0, 0).project(camera);
        expect(nose.y).toBeGreaterThan(0);
      }
    });
  }
  it("bounds transformed physical parts while excluding light beams and annotations", () => {
    const model = new Group();
    model.position.set(2, 3, 4);
    const geometry = new BoxGeometry(8, 2, 12);
    const material = new MeshBasicMaterial();
    try {
      const physical = new Mesh(geometry, material);
      physical.userData.cameraBounds = true;
      model.add(physical);
      const beam = new Mesh(geometry, material);
      beam.position.set(100, -50, 0);
      // Animated links are pickable but parked off-screen before their first frame.
      beam.userData.pick = { name: "Link placeholder" };
      model.add(beam);
      expect(airplaneBounds(model)).toEqual(new Box3(new Vector3(-2, 2, -2), new Vector3(6, 4, 10)));
    } finally {
      geometry.dispose();
      material.dispose();
    }
  });
  it("backs off for a wider airplane or narrower FOV", () => {
    const bounds = new Box3(new Vector3(-4, -2, -6), new Vector3(3, 2, 6));
    const distance = (box: Box3, fov: number) => {
      const [p, t] = presetCamera("front", box, fov, 820 / 900);
      return new Vector3(...p).distanceTo(new Vector3(...t));
    };
    expect(distance(new Box3(new Vector3(-4, -2, -8), new Vector3(3, 2, 8)), 38)).toBeGreaterThan(distance(bounds, 38));
    expect(distance(bounds, 30)).toBeGreaterThan(distance(bounds, 38));
  });
});

describe("system preset framing", () => {
  it.each(CAMERA_PRESETS)("keeps the engine target and default scale for %s", (preset) => {
    const position: [number, number, number] = [5.5, 1.6, 2.3];
    const target: [number, number, number] = [3.1, -0.25, 0];
    const [p, t] = viewPresetCamera(preset, position, target, null, 38, 820 / 900);
    expect(t).toEqual(target);
    expect(new Vector3(...p).distanceTo(new Vector3(...t))).toBeCloseTo(
      new Vector3(...position).distanceTo(new Vector3(...target)),
    );
  });
  it("keeps a requested focus target instead of recentering the overview box", () => {
    const bounds = new Box3(new Vector3(-4, -2, -6), new Vector3(3, 2, 6));
    const target: [number, number, number] = [0.5, -0.2, 0];
    const [p, t] = viewPresetCamera("front", [7.5, 4.2, 9.5], target, bounds, 38, 820 / 900);
    expect(t).toEqual(target);
    const camera = new PerspectiveCamera(38, 820 / 900, 0.05, 400);
    camera.position.set(...p);
    camera.lookAt(new Vector3(...t));
    camera.updateMatrixWorld();
    for (const z of [-6, 6]) expect(Math.abs(new Vector3(3, 0, z).project(camera).x)).toBeLessThanOrEqual(0.800001);
  });
});
