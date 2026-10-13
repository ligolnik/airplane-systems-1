import { Box3, Mesh, Vector3, type Object3D } from "three";
import { D2R, toVec3, V, type Vec3 } from "./math";

/** Shared scene framing policy. Fit narrower viewports along the existing line of sight. */
export const CAMERA_FOV = 38;
export const CAMERA_FIT_ASPECT = 0.9;
export const cameraFitDistance = (aspect: number) => Math.max(1, CAMERA_FIT_ASPECT / aspect);

/** Share of the half-width and half-height a fitted view fills: a 10% border on each edge. */
export const FRAME_FILL = 0.8;

export const CAMERA_PRESETS = ["top", "side", "front", "below", "iso"] as const;
export type CameraPreset = (typeof CAMERA_PRESETS)[number];

const directions: Record<CameraPreset, Vec3> = {
  // Stay off the vertical pole; the aft offset puts the nose up in the plan view.
  top: [-0.001, 1, 0],
  side: [0, 0, 1],
  front: [1, 0, 0],
  below: [0.001, -1, 0],
  iso: [1, 0.65, 1],
};

/** Missing or invalid presets retain the system's existing camera. */
export function parseCameraPreset(value: string | null): CameraPreset | null {
  if (value === null) return null;
  if (CAMERA_PRESETS.includes(value as CameraPreset)) return value as CameraPreset;
  console.warn(`Unknown camera preset "${value}"; use ${CAMERA_PRESETS.join(", ")}. Using the default view.`);
  return null;
}

/** Bound catalogue parts and surfaces; exclude decorative effects and uninitialized animated-link placeholders. */
export function airplaneBounds(model: Object3D): Box3 {
  const bounds = new Box3();
  model.updateWorldMatrix(true, true);
  model.traverse((object) => {
    if (!(object instanceof Mesh) || !object.userData.cameraBounds) return;
    const geometry = object.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (geometry.boundingBox) bounds.union(geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  return bounds;
}

/** Fit every bounding-box corner inside the perspective frustum, leaving a 10% border on each edge. */
export function presetCamera(
  preset: CameraPreset,
  bounds: Box3,
  fov: number,
  aspect: number,
  focus?: Vec3,
): [Vec3, Vec3] {
  const direction = V(...directions[preset]).normalize();
  const right = new Vector3().crossVectors(V(0, 1, 0), direction).normalize();
  const up = new Vector3().crossVectors(direction, right);
  const target = focus ? V(...focus) : bounds.getCenter(new Vector3());
  const tanVertical = Math.tan((fov * D2R) / 2) * FRAME_FILL;
  const tanHorizontal = tanVertical * aspect;
  let distance = 0;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = V(x, y, z).sub(target);
        // A corner closer to the camera needs extra distance, not just its projected width/height.
        const depth = corner.dot(direction);
        distance = Math.max(
          distance,
          depth + Math.abs(corner.dot(right)) / tanHorizontal,
          depth + Math.abs(corner.dot(up)) / tanVertical,
        );
      }
  return [toVec3(target.clone().addScaledVector(direction, distance)), toVec3(target)];
}

/**
 * System cameras encode framing as position/target, not a catalogue bounding box.
 * Their implied focus sphere has radius distance × sin(CAMERA_FOV / 2) × FRAME_FILL (the existing FOV and margin).
 * Rotating that sphere changes only direction; fit it to the limiting viewport angle.
 * Overview still fits physical bounds, retaining its requested target.
 */
export function viewPresetCamera(
  preset: CameraPreset,
  position: Vec3,
  target: Vec3,
  overviewBounds: Box3 | null,
  fov: number,
  aspect: number,
): [Vec3, Vec3] {
  // A deferred model has no physical bounds yet; never send a non-finite pose to the renderer.
  if (overviewBounds?.isEmpty()) return [position, target];
  if (overviewBounds) return presetCamera(preset, overviewBounds, fov, aspect, target);
  const radius = V(...position).distanceTo(V(...target)) * Math.sin((CAMERA_FOV * D2R) / 2) * FRAME_FILL;
  const halfAngle = Math.min((fov * D2R) / 2, Math.atan((Math.tan((fov * D2R) / 2) * aspect) / CAMERA_FIT_ASPECT));
  const distance = radius / (Math.sin(halfAngle) * FRAME_FILL);
  return [toVec3(V(...target).addScaledVector(V(...directions[preset]).normalize(), distance)), target];
}
