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
  it("keeps the final primary navigation to stable desktop targets", () => {
    expect(css).toMatch(/\.nav-item\s*\{[^}]*min-height:\s*40px/s);
  });

  it("collapses the Profile split layout below the existing breakpoint", () => {
    expect(css).toMatch(
      /@media \(max-width: 980px\)[\s\S]*\.profile-split\s*\{[^}]*grid-template-columns:\s*1fr/s,
    );
  });

  it("gives Settings tabs a bounded non-shifting layout", () => {
    expect(css).toMatch(
      /\.settings-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s,
    );
  });

  it("keeps Advanced settings labels from running into their status text", () => {
    expect(css).toMatch(/\.privacy-line small\s*\{[^}]*display:\s*block/s);
  });

  it("uses a scrollbar-safe shell and vertical Settings tabs at 980px", () => {
    expect(css).toMatch(/\.app-shell\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%/s);
    expect(css).toMatch(
      /@media \(max-width: 980px\)[\s\S]*\.settings-tabs\s*\{[^}]*grid-template-columns:\s*1fr/s,
    );
    expect(css).toMatch(/\.settings-tabs button\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere/s);
  });

  it("keeps form, switch, and Advanced summary targets at least 40px", () => {
    expect(css).toMatch(/select,\s*input,\s*textarea\s*\{[^}]*min-height:\s*40px/s);
    expect(css).toMatch(/input\[type="checkbox"\]\s*\{[^}]*height:\s*40px/s);
    expect(css).toMatch(/\.profiles-page details > summary\s*\{[^}]*min-height:\s*40px/s);
  });
});
