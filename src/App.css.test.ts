/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src", "App.css"), "utf8");
const tauriConfig = JSON.parse(
  readFileSync(join(process.cwd(), "src-tauri", "tauri.conf.json"), "utf8"),
);

describe("Gospeak responsive layout CSS", () => {
  it("defines the smallest desktop viewport the fixed dashboard supports", () => {
    const mainWindow = tauriConfig.app.windows.find(
      (window: { label: string }) => window.label === "main",
    );

    expect(mainWindow).toMatchObject({
      width: 1180,
      height: 760,
      minWidth: 1024,
      minHeight: 640,
    });
  });

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

  it("uses the approved responsive Profile card and rule table layout", () => {
    expect(css).toMatch(/\.profile-card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s);
    expect(css).toMatch(/\.profile-card\[aria-pressed="true"\]\s*\{[^}]*border-color:\s*#3b82f6/s);
    expect(css).toMatch(/\.profile-rule-table\s*\{[^}]*width:\s*100%/s);
    expect(css).toMatch(/@media \(max-width: 1100px\)[\s\S]*\.profile-card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
    expect(css).toMatch(/@media \(max-width: 560px\)[\s\S]*\.profile-card-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
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
      /\.general-hero\s*\{[^}]*grid-template-columns:\s*minmax\(0, 0\.94fr\) 1px minmax\(390px, 1fr\)/s,
    );
    expect(css).toMatch(/\.general-hero-divider\s*\{[^}]*width:\s*1px/s);
    expect(css).toMatch(
      /\.general-readiness\s*\{[^}]*grid-template-columns:\s*96px minmax\(0, 1fr\)/s,
    );
    expect(css).toMatch(
      /\.general-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)[^}]*gap:\s*0;[^}]*border:\s*1px solid #e4e9f1/s,
    );
    expect(css).toMatch(
      /\.general-metric \+ \.general-metric\s*\{[^}]*border-left:\s*1px solid #edf0f5/s,
    );
    expect(css).toMatch(
      /\.activity-panel\s*\{[^}]*border-radius:\s*16px/s,
    );
    expect(css).toMatch(
      /\.workspace-general,\s*\.workspace-providers\s*\{[^}]*overflow:\s*hidden;/s,
    );
    expect(css).toMatch(
      /\.app-shell \.general-status-card\s*\{[^}]*min-height:\s*clamp\(116px, 18vh, 190px\)/s,
    );
    expect(css).toMatch(/\.workspace-general\s*\{[^}]*padding-top:\s*clamp\(/s);
    expect(css).toMatch(/\.general-page\s*\{[^}]*height:\s*100%;/s);
    expect(css).toMatch(
      /\.general-page\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto/s,
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
      /@media \(max-width: 1100px\)[\s\S]*\.general-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 560px\)[\s\S]*\.general-metrics\s*\{[^}]*grid-template-columns:\s*1fr/s,
    );
    expect(css).toMatch(
      /@media \(max-height: 980px\) and \(min-width: 981px\)[\s\S]*\.activity-chart svg\s*\{[^}]*min-height:\s*0/s,
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
    expect(css).toMatch(/\.ui-card\s*\{[^}]*border:\s*1px solid #e4e9f1;/s);
    expect(css).toMatch(/\.settings-section\s*\{[^}]*display:\s*grid/s);
    expect(css).toMatch(/\.dictionary-row,\s*\.activity-row\s*\{[^}]*border:\s*1px solid #e4e9f1;/s);
  });

  it("keeps Providers on the shared shell and page typography scale", () => {
    expect(css).not.toMatch(/\.app-shell:has\(\.workspace-providers\)/);
    expect(css).toMatch(/\.workspace-providers\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.providers-page\s*\{[^}]*height:\s*100%;/s);
    expect(css).toMatch(/\.providers-page > \.ui-page-header\s*\{[^}]*margin-bottom:\s*clamp\(/s);
    expect(css).toMatch(/\.pipeline-summary\s*\{[^}]*min-height:\s*clamp\(90px, 15vh, 158px\)/s);
    expect(css).toMatch(/\.pipeline-step\s*\{[^}]*background:\s*transparent/s);
    expect(css).toMatch(/\.pipeline-arrow\s*\{[^}]*width:\s*48px/s);
    expect(css).toMatch(/\.provider-icon-tile\s*\{[^}]*width:\s*54px/s);
    expect(css).toMatch(/\.provider-configurations > header\s*\{[^}]*min-height:\s*clamp\(56px, 9\.5vh, 104px\)/s);
    expect(css).toMatch(/\.provider-config-row\s*\{[^}]*display:\s*grid/s);
    expect(css).toMatch(
      /\.provider-config-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1\.35fr\) minmax\(0, 0\.75fr\) max-content max-content max-content/s,
    );
    expect(css).toMatch(/\.provider-config-row\s*\{[^}]*min-height:\s*clamp\(60px, 9\.2vh, 92px\)/s);
    expect(css).toMatch(/\.provider-pagination \.ui-button\s*\{[^}]*min-height:\s*34px/s);
    expect(css).toMatch(
      /\.provider-config-model,\s*\.provider-config-row > small,\s*\.provider-config-row > \.configuration-status,\s*\.provider-config-actions\s*\{[^}]*align-self:\s*center/s,
    );
    expect(css).toMatch(
      /\.provider-config-title strong,\s*\.provider-config-model,\s*\.provider-config-row > small\s*\{[^}]*text-overflow:\s*ellipsis/s,
    );
    expect(css).toMatch(/\.ui-button\s*\{[^}]*white-space:\s*nowrap/s);
    expect(css).not.toMatch(
      /@media \(max-width: 1300px\) and \(min-width: 981px\)[\s\S]*?\.provider-config-(?:row|actions)[^{]*\{[^}]*grid-column:/s,
    );
  });
});
