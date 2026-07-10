import { describe, expect, it } from "vitest";

describe("Settings CSS contract", () => {
  it("wraps settings tabs when the available width is narrow", async () => {
    // @ts-expect-error The repo intentionally does not include Node typings.
    const { readFile } = await import("node:fs/promises");
    const cwd = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const appCss = await readFile(`${cwd}/src/App.css`, "utf8");
    expect(appCss).toMatch(
      /\.settings-tabs\s*\{[^}]*flex-wrap:\s*wrap\s*;/s,
    );
  });
});
