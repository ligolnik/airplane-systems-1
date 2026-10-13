import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

describe("shot script entry point", () => {
  it("validates arguments when invoked directly or through a symlink", () => {
    const root = resolve(import.meta.dirname, "..");
    mkdirSync(join(root, ".shots"), { recursive: true });
    const scratch = mkdtempSync(join(root, ".shots", "entry-test-"));
    try {
      const link = join(scratch, "linked-worktree");
      symlinkSync(root, link, "dir");
      for (const script of [join(root, "scripts/shot.mjs"), join(link, "scripts/shot.mjs")]) {
        const result = spawnSync(process.execPath, [script, "--cam", "bogus"], { encoding: "utf8" });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("--cam requires a comma-separated list");
      }
    } finally {
      rmSync(scratch, { recursive: true });
    }
  });
});
