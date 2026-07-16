# General Reference Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faithfully restyle only the right-side General page to match the supplied reference while preserving all existing data and interactions.

**Architecture:** Keep the existing `GeneralPage` props, usage aggregation, chart calculation, and navigation callbacks. Make one small markup change that combines the title/shortcut and readiness content into a single desktop split card, then replace only General-specific CSS with the reference geometry and existing responsive/interaction behavior.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS, Lucide React, Playwright or the Codex in-app Browser.

## Global Constraints

- Do not change the sidebar or any non-General page.
- Add no dependency, backend behavior, route, data field, filter, or chart behavior.
- Keep the current hotkey, usage totals, provider readiness, active Profile, seven-day chart, and navigation callbacks.
- Render metrics as four columns, then two-by-two, then one column.
- Preserve bottom-card hover lift, focus ring, ready/not-ready feedback, reduced motion, and whole-card click behavior.
- Match the supplied reference image at desktop and prevent horizontal overflow at narrower widths.

---

### Task 1: Combined readiness-card structure

**Files:**
- Modify: `src/components/GeneralPage.test.tsx`
- Modify: `src/components/GeneralPage.tsx`

**Interfaces:**
- Consumes: existing `GeneralPageProps`, `Hotkey`, provider readiness, and `Mic`.
- Produces: `.general-hero`, `.general-header`, `.general-hero-divider`, and `.general-readiness` within one readiness card.

- [ ] **Step 1: Write the failing structure test**

Add these assertions to the first `GeneralPage` test:

```tsx
expect(container.querySelector(".general-hero > .general-header")).toBeInTheDocument();
expect(container.querySelector(".general-hero-divider")).toBeInTheDocument();
expect(container.querySelector(".general-readiness")).toBeInTheDocument();
expect(container.querySelector(".general-hero-wave")).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm test -- --run src/components/GeneralPage.test.tsx
```

Expected: FAIL because the header is outside `.general-hero`, the divider and readiness wrapper do not exist, and `.general-hero-wave` still renders.

- [ ] **Step 3: Implement the minimum markup change**

Replace the separate header and hero with:

```tsx
<section className="general-hero" aria-label="Dictation readiness">
  <header className="general-header">
    <h1 id="general-title">Gospeak</h1>
    <p>
      {hotkeyReady ? (
        <>
          Press <Hotkey binding={config.hotkey.binding} /> to start dictating.
        </>
      ) : (
        "Set a shortcut to start dictating."
      )}
    </p>
  </header>

  <span className="general-hero-divider" aria-hidden="true" />

  <div className="general-readiness">
    <span className="general-hero-icon" aria-hidden="true">
      <Mic size={34} strokeWidth={1.9} />
    </span>
    <div className="general-hero-copy">
      <h2>Ready to dictate</h2>
      <p>Gospeak is ready when you are.</p>
      <span className="general-hero-pill">
        <span aria-hidden="true" />
        All systems normal
      </span>
    </div>
  </div>
</section>
```

Keep `aria-labelledby="general-title"` on the page section. Remove only `.general-hero-wave`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm test -- --run src/components/GeneralPage.test.tsx
```

Expected: all General component tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/GeneralPage.tsx src/components/GeneralPage.test.tsx
git commit -m "refactor: align general readiness structure"
```

### Task 2: Reference styling and responsive metrics

**Files:**
- Modify: `src/App.css.test.ts`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: Task 1 class structure and existing General classes.
- Produces: desktop split readiness card, combined metric container, reference activity panel, responsive four/two/one metrics, and preserved status-card states.

- [ ] **Step 1: Replace the General CSS contracts with failing reference contracts**

Assert the combined layout and responsive behavior:

```ts
expect(css).toMatch(
  /\.general-hero\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 1px minmax\(390px, 0\.94fr\)/s,
);
expect(css).toMatch(/\.general-hero-divider\s*\{[^}]*width:\s*1px/s);
expect(css).toMatch(
  /\.general-readiness\s*\{[^}]*grid-template-columns:\s*96px minmax\(0, 1fr\)/s,
);
expect(css).toMatch(
  /\.general-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)[^}]*gap:\s*0[^}]*border:\s*1px solid #e4e9f1/s,
);
expect(css).toMatch(
  /\.general-metric \+ \.general-metric\s*\{[^}]*border-left:\s*1px solid #edf0f5/s,
);
expect(css).toMatch(
  /@media \(max-width: 1100px\)[\s\S]*\.general-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s,
);
expect(css).toMatch(
  /@media \(max-width: 560px\)[\s\S]*\.general-metrics\s*\{[^}]*grid-template-columns:\s*1fr/s,
);
expect(css).toMatch(
  /\.general-status-card:hover:not\(:disabled\)\s*\{[^}]*transform:\s*translateY\(-2px\)/s,
);
expect(css).toMatch(
  /\.general-status-card:focus-visible\s*\{[^}]*outline:\s*3px solid #2563eb/s,
);
```

- [ ] **Step 2: Run the CSS test and verify RED**

Run:

```powershell
npm test -- --run src/App.css.test.ts
```

Expected: FAIL because the readiness card is not split, the metrics are separate cards with gaps, and the new internal-divider contract is absent.

- [ ] **Step 3: Implement the minimum General-only CSS**

Use these core desktop rules:

```css
.general-page {
  height: 100%;
  display: grid;
  grid-template-rows: auto auto minmax(260px, 1fr) auto;
  gap: clamp(18px, 2.2vh, 26px);
  padding: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.general-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 1px minmax(390px, 0.94fr);
  align-items: center;
  min-height: clamp(204px, 24vh, 230px);
  padding: 38px 42px;
  border: 1px solid #e4e9f1;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 12px 34px rgb(15 23 42 / 4%);
}

.general-hero-divider {
  width: 1px;
  height: 120px;
  background: #edf0f5;
}

.general-readiness {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  align-items: center;
  gap: 28px;
  padding-left: 36px;
}

.general-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  overflow: hidden;
  border: 1px solid #e4e9f1;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 12px 34px rgb(15 23 42 / 4%);
}

.general-metric {
  min-height: 116px;
  padding: 24px 28px;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.general-metric + .general-metric {
  border-left: 1px solid #edf0f5;
}
```

Match the reference with a larger neutral microphone tile, compact typography,
a taller activity panel, thin dashed gridlines, black chart line, and three equal
bottom cards. Keep the existing status-card transition, hover backgrounds,
`translateY(-2px)`, focus ring, ready/not-ready classes, and reduced-motion rule.

At `max-width: 1100px`, use two metric columns and replace the internal dividers
with row/column boundaries. At `max-width: 980px`, stack the readiness card and
status cards. At `max-width: 560px`, use one metric column and vertical dividers.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npm test -- --run src/App.css.test.ts src/components/GeneralPage.test.tsx
```

Expected: both test files pass.

- [ ] **Step 5: Commit**

```powershell
git add -- src/App.css src/App.css.test.ts
git commit -m "style: match general reference layout"
```

### Task 3: Rendered fidelity and build verification

**Files:**
- Modify: `design-qa.md`
- Modify only if QA exposes an in-scope issue: files from Tasks 1-2.

**Interfaces:**
- Consumes: source image `C:\Users\PC\.codex\codex-remote-attachments\019f6c1b-25fb-7be3-8cd9-635f6373b814\70AFE77B-EA93-43D3-8FE9-CB5A39CECFC8\1-Photo-1.jpg`.
- Produces: desktop and responsive screenshots plus `design-qa.md` with `final result: passed`.

- [ ] **Step 1: Start the app and capture the desktop state**

Run the existing Vite app on an available local port. Open General at the
reference `1280x1024` viewport and capture the whole app.

- [ ] **Step 2: Compare source and implementation together**

Create one temporary side-by-side comparison outside committed source. Inspect:

- right workspace padding and total content width;
- readiness-card title, shortcut, divider, microphone tile, copy, and badge;
- combined metric container and internal dividers;
- chart height, axes, gridlines, and date labels;
- bottom-card sizing, icon/text alignment, divider, value, and chevron;
- typography, border color, radius, shadow, and absence of clipping.

- [ ] **Step 3: Fix P0-P2 mismatches using a RED→GREEN contract**

For each reproducible mismatch, first add or tighten the smallest component/CSS
contract, run it to verify failure, make the minimum fix, re-run it, and capture
the same viewport again. Do not add new behavior or loop on P3 polish.

- [ ] **Step 4: Prove responsive and interaction behavior**

Capture a width where the metrics are visibly `2×2`, then a narrow width where
they are one column. Verify `scrollWidth === clientWidth`. Hover one bottom card
and confirm its transform/background/shadow change. Keyboard-focus the same card
and confirm the visible focus ring. Click ASR, Rewrite, and Active Profile cards
and confirm the existing navigation still works. Check browser errors/warnings.

- [ ] **Step 5: Update the QA report**

Write the source path, implementation screenshot paths, viewports, states,
side-by-side evidence, comparison history, required fidelity surfaces,
interaction checks, console result, and:

```text
final result: passed
```

- [ ] **Step 6: Run final verification**

```powershell
npm test -- --run
npm run lint
npm run build
git diff --check
git status --short
```

Expected: all tests pass, lint/build/diff check exit `0`, and only intentional
General/QA changes remain.

- [ ] **Step 7: Commit**

```powershell
git add -- design-qa.md src
git commit -m "test: verify general reference clone"
```
