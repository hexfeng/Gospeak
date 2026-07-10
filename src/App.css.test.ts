/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src", "App.css"), "utf8");

describe("Gospeak responsive layout CSS", () => {
  it("allows form controls to shrink inside desktop installer windows", () => {
    expect(css).toMatch(/label\s*{[^}]*min-width:\s*0;/s);
    expect(css).toMatch(/select,\s*input,\s*textarea\s*{[^}]*min-width:\s*0;/s);
  });

  it("uses auto-fitting panel form grids instead of fixed overflowing columns", () => {
    expect(css).toMatch(/\.content-grid\s*{[^}]*auto-fit/s);
    expect(css).toMatch(/\.compact-form\s*{[^}]*auto-fit/s);
    expect(css).toMatch(/\.dictionary-form\s*{[^}]*auto-fit/s);
  });
});

describe("Settings CSS contract", () => {
  it("wraps settings tabs when the available width is narrow", () => {
    expect(css).toMatch(
      /\.settings-tabs\s*{[^}]*flex-wrap:\s*wrap\s*;/s,
    );
  });
});
