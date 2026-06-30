import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("Tauri capabilities", () => {
  it("allows the recorder overlay to show and hide itself", () => {
    const capability = JSON.parse(
      readFileSync(
        join(process.cwd(), "src-tauri", "capabilities", "default.json"),
        "utf8",
      ),
    ) as { permissions: string[] };

    expect(capability.permissions).toEqual(
      expect.arrayContaining([
        "core:window:allow-show",
        "core:window:allow-hide",
      ]),
    );
  });
});
