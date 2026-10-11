/** "Tap to locate" (lib/registry): the camera flies to the instance of a part that carries its label. */
import { Mesh } from "three";
import { describe, expect, it } from "vitest";
import { partObjects, registerPart } from "@/lib/registry";

describe("partObjects", () => {
  it("prefers the first pinned mesh of a name over an earlier unpinned one", () => {
    const [right, left, extra] = [new Mesh(), new Mesh(), new Mesh()];
    const offs = [registerPart("probe A", right, false), registerPart("probe A", left, true)];
    expect(partObjects.get("probe A")).toBe(left);
    offs.push(registerPart("probe A", extra, true));
    expect(partObjects.get("probe A")).toBe(left);
    offs[1]();
    expect(partObjects.get("probe A")).toBe(extra);
    offs[2]();
    expect(partObjects.get("probe A")).toBe(right);
    offs[0]();
    expect(partObjects.has("probe A")).toBe(false);
  });

  it("keeps the first mounted mesh when no instance is pinned", () => {
    const [a, b] = [new Mesh(), new Mesh()];
    const offs = [registerPart("probe B", a, false), registerPart("probe B", b, false)];
    expect(partObjects.get("probe B")).toBe(a);
    offs.forEach((off) => off());
    expect(partObjects.has("probe B")).toBe(false);
  });
});
