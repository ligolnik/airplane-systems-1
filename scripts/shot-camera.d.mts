import type { CameraPreset } from "../lib/camera";

export function parseShotCameras(argv: string[]): { args: string[]; cameras: (CameraPreset | null)[] };
export function shotQuery(query: string, camera: CameraPreset | null): string;
export function shotFilename(view: string, phone: boolean, camera: CameraPreset | null): string;
