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
    expect(css).toMatch(/\.nav-item\s*\{[^}]*min-height:\s*56px/s);
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
    expect(css).toMatch(/\.app-shell\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none/s);
    expect(css).toMatch(/\.app-shell\s*\{[^}]*border-radius:\s*0/s);
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

describe("General dashboard CSS contract", () => {
  it("renders shortcut keys as separate framed keys with an unframed separator", () => {
    expect(css).toMatch(/\.hotkey-combo,\s*\.hotkey-part\s*\{[^}]*display:\s*inline-flex/s);
    expect(css).toMatch(/\.hotkey-separator\s*\{[^}]*color:\s*var\(--text-muted\)/s);
    expect(css).toMatch(/\.general-header kbd\s*\{[^}]*border:\s*1px solid #d7dce5/s);
  });

  it("uses the approved responsive metric and setup-status layout", () => {
    expect(css).toMatch(
      /\.general-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s,
    );
    expect(css).toMatch(
      /\.general-metric\s*\{[^}]*grid-template-columns:\s*42px minmax\(0, 1fr\)/s,
    );
    expect(css).toMatch(
      /\.general-hero\s*\{[^}]*grid-template-columns:\s*68px minmax\(0, 1fr\)/s,
    );
    expect(css).toMatch(
      /\.activity-panel\s*\{[^}]*border-radius:\s*16px/s,
    );
    expect(css).toMatch(
      /\.workspace-general\s*\{[^}]*overflow:\s*hidden/s,
    );
    expect(css).toMatch(
      /\.general-status-card\s*\{[^}]*min-height:\s*clamp\(124px, 14\.5vh, 144px\)/s,
    );
    expect(css).toMatch(/\.general-status-card\s*\{[^}]*border:\s*1px solid #e4e9f1/s);
    expect(css).toMatch(/\.general-status-card\.is-ready\s*\{[^}]*border-color:/s);
    expect(css).toMatch(/\.general-status-card\.is-not-ready\s*\{[^}]*border-color:/s);
    expect(css).toMatch(
      /\.general-status-card:hover[^{]*\{[^}]*transform:\s*translateY\(-2px\)/s,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.general-status-card/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 980px\)[\s\S]*\.general-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 560px\)[\s\S]*\.general-metrics\s*\{[^}]*grid-template-columns:\s*1fr/s,
    );
    expect(css).toMatch(
      /@media \(max-height: 980px\) and \(min-width: 981px\)[\s\S]*\.activity-chart svg\s*\{[^}]*min-height:\s*132px/s,
    );
    expect(css).toMatch(
      /@media \(max-height: 980px\) and \(min-width: 981px\)[\s\S]*\.general-status-card\s*\{[^}]*min-height:\s*136px/s,
    );
  });

  it("uses accessible status, focus, and page-surface treatments", () => {
    expect(css).toMatch(
      /\.general-status-card\.is-ready\s*\{[^}]*border-color:\s*#e4e9f1;/s,
    );
    expect(css).toMatch(
      /\.general-status-card\.is-not-ready\s*\{[^}]*border-color:\s*#e4e9f1;/s,
    );
    expect(css).toMatch(
      /\.general-status-card:focus-visible\s*\{[^}]*outline:\s*3px solid #2563eb;/s,
    );
    expect(css).toMatch(/\.general-page\s*\{[^}]*background:\s*transparent;/s);
    expect(css).toMatch(/\.general-page\s*\{[^}]*border-radius:\s*0;/s);
    expect(css).toMatch(/\.general-page\s*\{[^}]*box-shadow:\s*none;/s);
    expect(css).toMatch(/\.general-status-card\.is-ready:hover:not\(:disabled\)\s*\{[^}]*background:\s*#f5fbf7;/s);
    expect(css).toMatch(/\.general-status-card\.is-not-ready:hover:not\(:disabled\)\s*\{[^}]*background:\s*#fff7f6;/s);
  });
});

describe("Secondary page CSS contract", () => {
  it("aligns Profiles, Dictionary, and Settings with the General page surface style", () => {
    expect(css).toMatch(/\.dictionary-page\s*\{[^}]*background:\s*transparent;/s);
    expect(css).toMatch(/\.profiles-page,\s*\.providers-page,\s*\.settings-page\s*\{[^}]*background:\s*transparent;/s);
    expect(css).toMatch(/\.profile-split > aside\s*\{[^}]*border:\s*1px solid #e4e9f1;/s);
    expect(css).toMatch(/\.ui-card\s*\{[^}]*border:\s*1px solid #e4e9f1;/s);
    expect(css).toMatch(/\.settings-section\s*\{[^}]*display:\s*grid/s);
    expect(css).toMatch(/\.dictionary-row,\s*\.activity-row\s*\{[^}]*border:\s*1px solid #e4e9f1;/s);
  });

  it("keeps Providers on the shared shell and page typography scale", () => {
    expect(css).not.toMatch(/\.app-shell:has\(\.workspace-providers\)/);
    expect(css).not.toMatch(/\.workspace-providers\s*\{/);
    expect(css).not.toMatch(/\.providers-page > \.ui-page-header\s*\{/);
    expect(css).not.toMatch(/\.providers-page > \.ui-page-header h1\s*\{/);
    expect(css).not.toMatch(/\.providers-page > \.ui-page-header p\s*\{/);
    expect(css).toMatch(/\.pipeline-summary\s*\{[^}]*min-height:\s*158px/s);
    expect(css).toMatch(/\.pipeline-step\s*\{[^}]*background:\s*transparent/s);
    expect(css).toMatch(/\.pipeline-arrow\s*\{[^}]*width:\s*48px/s);
    expect(css).toMatch(/\.provider-icon-tile\s*\{[^}]*width:\s*54px/s);
    expect(css).toMatch(/\.provider-configurations > header\s*\{[^}]*min-height:\s*104px/s);
    expect(css).toMatch(/\.provider-config-row\s*\{[^}]*display:\s*grid/s);
    expect(css).toMatch(
      /\.provider-config-row\s*\{[^}]*grid-template-columns:\s*minmax\(250px, 1\.45fr\) minmax\(155px, 0\.9fr\)/s,
    );
    expect(css).toMatch(/\.provider-config-row\s*\{[^}]*min-height:\s*110px/s);
    expect(css).toMatch(/\.ui-button\s*\{[^}]*white-space:\s*nowrap/s);
    expect(css).toMatch(
      /@media \(max-width: 1300px\) and \(min-width: 981px\)[\s\S]*\.provider-config-actions\s*\{[^}]*grid-column:\s*2 \/ -1/s,
    );
  });
});
