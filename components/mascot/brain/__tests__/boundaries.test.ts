import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

describe("module boundaries", () => {
  it("brain/ never imports three.js", () => {
    const dir = join(__dirname, "..");
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, f).not.toMatch(/from\s+["'](three|@react-three\/[^"']+)["']/);
    }
  });
});
