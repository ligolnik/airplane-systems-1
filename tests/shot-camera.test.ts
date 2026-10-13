import { CAMERA_PRESETS } from "../lib/camera";
import { describe, expect, it } from "vitest";
import { parseShotCameras, shotFilename, shotQuery } from "../scripts/shot-camera.mjs";

describe("shot camera arguments", () => {
  it("accepts every app preset in the CLI", () => {
    expect(parseShotCameras(["--cam", CAMERA_PRESETS.join(",")]).cameras).toEqual([...CAMERA_PRESETS]);
  });
  it("preserves default arguments and filenames", () => {
    expect(parseShotCameras(["c172s/fuel"])).toEqual({ args: ["c172s/fuel"], cameras: [null] });
    expect(shotFilename("c172s/fuel", false, null)).toBe("c172s-fuel.png");
    expect(shotQuery("lights=land,ice", null)).toBe("lights=land,ice");
  });
  it("expands and deduplicates presets while preserving other options", () => {
    const argv = ["--cam", "top,side,top", "sr22t/electrical", "--phone"];
    expect(parseShotCameras(argv)).toEqual({ args: ["sr22t/electrical", "--phone"], cameras: ["top", "side"] });
    expect(argv).toEqual(["--cam", "top,side,top", "sr22t/electrical", "--phone"]);
    expect(shotFilename("sr22t/electrical", true, "top")).toBe("sr22t-electrical-phone-top.png");
  });
  it.each([[], ["--phone"], ["rear"], ["top,"], ["TOP"], ["top", "--cam", "side"]])(
    "rejects invalid --cam %j",
    (...tail) => {
      expect(() => parseShotCameras(["--cam", ...tail])).toThrow("--cam");
    },
  );
  it("merges query options and gives --cam precedence", () => {
    const query = new URLSearchParams(shotQuery("fiki=0&cam=front&lights=land%2Cice", "below"));
    expect(query.get("cam")).toBe("below");
    expect(query.get("fiki")).toBe("0");
    expect(query.get("lights")).toBe("land,ice");
  });
});
