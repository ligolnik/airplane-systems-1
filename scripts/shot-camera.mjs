/** Consume --cam without mutating the caller's arguments; reject mistakes before starting a browser. */
export function parseShotCameras(argv) {
  const args = [...argv];
  const index = args.indexOf("--cam");
  if (index < 0) return { args, cameras: [null] };
  const value = args[index + 1];
  const presets = ["top", "side", "front", "below", "iso"];
  if (!value || value.split(",").some((cam) => !presets.includes(cam)))
    throw new Error(`--cam requires a comma-separated list of ${presets.join(", ")}`);
  args.splice(index, 2);
  if (args.includes("--cam")) throw new Error("Use one --cam option with comma-separated presets");
  return { args, cameras: [...new Set(value.split(","))] };
}

export function shotQuery(query, camera) {
  if (!camera) return query;
  const params = new URLSearchParams(query);
  if (camera) params.set("cam", camera);
  return params.toString();
}

export function shotFilename(view, phone, camera) {
  return view.replace("/", "-") + (phone ? "-phone" : "") + (camera ? `-${camera}` : "") + ".png";
}
