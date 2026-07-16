# Providers Reference Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the supplied `1390x1132` Providers reference in the current Gospeak app without changing Provider behavior or other pages.

**Architecture:** Keep `ProvidersPage` state and callbacks intact. Add two local brand-icon assets, minimal Provider-only markup for the split pipeline and identity tiles, and scoped CSS that matches the reference at desktop while retaining the existing responsive fallbacks.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS, Lucide React, local SVG assets.

## Global Constraints

- Change only Providers presentation and Provider-specific assets.
- Keep the existing five-items-per-page mixed list and all callbacks.
- Add no runtime dependency or backend behavior.
- Keep native controls, accessible names, regions, focus return, disabled states, and dialogs.
- Match the `1390x1132` reference at desktop and keep no horizontal overflow at `900` and `390`.

---

### Task 1: Provider icon and markup structure

**Files:**
- Create: `src/assets/providers/groq.svg`
- Create: `src/assets/providers/openai.svg`
- Modify: `src/components/ProvidersPage.test.tsx`
- Modify: `src/components/ProvidersPage.tsx`

**Interfaces:**
- Consumes: existing `ProviderConfiguration`, `providerLabel`, `Button`, and current callbacks.
- Produces: `providerIcon(providerId: string): string | null`, `.provider-icon-tile`, `.provider-config-copy`, `.provider-config-title`, and `.pipeline-arrow`.

- [ ] **Step 1: Write failing structure tests**

Add assertions to the existing row/action test:

```tsx
expect(within(rows()[0]).getByRole("img", { name: "Groq Whisper" })).toBeInTheDocument();
expect(within(rows()[1]).getByRole("img", { name: "OpenAI" })).toBeInTheDocument();
expect(within(row).getByRole("button", { name: "Edit" })).toHaveClass("provider-edit-button");
expect(within(row).getByRole("button", { name: "Delete" })).toHaveClass("provider-delete-button");
```

Add a pipeline assertion:

```tsx
expect(within(pipeline).getByTestId("pipeline-arrow")).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm test -- --run src/components/ProvidersPage.test.tsx
```

Expected: FAIL because provider images, action classes, and the arrow wrapper do not exist.

- [ ] **Step 3: Add local icon assets**

Add the Lobe Icons Groq and OpenAI SVG paths as local files. Set Groq fill to `#7c5cff` and OpenAI fill to `#111111`. Do not add an npm package or runtime CDN URL.

- [ ] **Step 4: Add the minimal Provider-only markup**

Update imports:

```tsx
import { ArrowRight, Pencil, Plus, Trash2 } from "lucide-react";
import groqIcon from "../assets/providers/groq.svg";
import openaiIcon from "../assets/providers/openai.svg";
```

Wrap the pipeline arrow:

```tsx
<span className="pipeline-arrow" data-testid="pipeline-arrow">
  <ArrowRight aria-hidden="true" size={20} />
</span>
```

Use the icon and two-line identity block:

```tsx
const icon = providerIcon(configuration.providerId);

<div className="provider-config-identity">
  {icon ? (
    <span className="provider-icon-tile">
      <img alt={providerLabel(configuration.providerId)} src={icon} />
    </span>
  ) : null}
  <div className="provider-config-copy">
    <div className="provider-config-title">
      <strong>{configuration.name}</strong>
      <span className="provider-kind-label">
        {configuration.kind === "stt" ? "ASR" : "Rewrite"}
      </span>
    </div>
    <small>{providerLabel(configuration.providerId)}</small>
    {endpoint ? <small>{endpoint}</small> : null}
  </div>
</div>
```

Add icons and classes to the action buttons:

```tsx
<Button className="provider-edit-button" ...>
  <Pencil aria-hidden="true" size={14} /> Edit
</Button>
<Button className="provider-delete-button" ... variant="danger">
  <Trash2 aria-hidden="true" size={14} /> Delete
</Button>
```

Add the helper:

```tsx
function providerIcon(providerId: string) {
  if (providerId === "groq") return groqIcon;
  if (providerId === "openai") return openaiIcon;
  return null;
}
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```powershell
npm test -- --run src/components/ProvidersPage.test.tsx
```

Expected: all Providers tests pass.

- [ ] **Step 6: Commit**

```powershell
git add -- src/assets/providers src/components/ProvidersPage.tsx src/components/ProvidersPage.test.tsx
git commit -m "feat: add provider identity artwork"
```

### Task 2: Reference geometry and styling

**Files:**
- Modify: `src/App.css.test.ts`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: classes created in Task 1 and current app-shell breakpoints.
- Produces: desktop reference geometry for `.workspace-providers`, `.providers-page`, `.pipeline-summary`, `.provider-configurations`, and `.provider-config-row`.

- [ ] **Step 1: Write failing CSS contracts**

Extend the Providers CSS test:

```ts
expect(css).toMatch(/\.workspace-providers\s*\{[^}]*padding:\s*58px 36px 28px 45px/s);
expect(css).toMatch(/\.pipeline-summary\s*\{[^}]*min-height:\s*158px/s);
expect(css).toMatch(/\.pipeline-arrow\s*\{[^}]*width:\s*48px/s);
expect(css).toMatch(/\.provider-icon-tile\s*\{[^}]*width:\s*54px/s);
expect(css).toMatch(/\.provider-config-row\s*\{[^}]*min-height:\s*110px/s);
expect(css).toMatch(/\.provider-configurations > header\s*\{[^}]*min-height:\s*104px/s);
```

- [ ] **Step 2: Run the CSS test and verify RED**

Run:

```powershell
npm test -- --run src/App.css.test.ts
```

Expected: FAIL because the reference dimensions are not present.

- [ ] **Step 3: Implement scoped desktop geometry**

Add Provider-only workspace/header rules:

```css
.workspace-providers {
  padding: 58px 36px 28px 45px;
}

.providers-page > .ui-page-header {
  margin-bottom: 39px;
}

.providers-page > .ui-page-header h1 {
  font-size: 36px;
}

.providers-page > .ui-page-header p {
  margin-top: 16px;
  font-size: 16px;
}
```

Match the pipeline:

```css
.pipeline-summary {
  position: relative;
  grid-template-columns: minmax(0, 46.3%) minmax(0, 53.7%);
  gap: 0;
  min-height: 158px;
  margin-bottom: 41px;
  padding: 0;
  box-shadow: none;
}

.pipeline-summary > .pipeline-step {
  height: 100%;
  padding: 34px 26px;
}

.pipeline-summary > .pipeline-step:last-child {
  padding-left: 116px;
  border-left: 1px solid #e4e9f1;
}

.pipeline-arrow {
  position: absolute;
  z-index: 1;
  left: 46.3%;
  top: 50%;
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  transform: translate(-50%, -50%);
  border: 1px solid #e4e9f1;
  border-radius: 999px;
  background: #ffffff;
}
```

Match the configuration card and rows:

```css
.provider-configurations {
  gap: 0;
  padding: 0 26px;
  box-shadow: none;
}

.provider-configurations > header {
  min-height: 104px;
  border-bottom: 1px solid #edf0f5;
}

.provider-configurations > header .ui-button-primary {
  min-height: 52px;
  padding: 0 20px;
}

.provider-config-row {
  grid-template-columns: minmax(250px, 1.45fr) minmax(155px, 0.9fr) max-content minmax(130px, auto) max-content;
  min-height: 110px;
  gap: 16px;
  padding: 0;
}

.provider-icon-tile {
  width: 54px;
  height: 54px;
  display: grid;
  flex: 0 0 54px;
  place-items: center;
  border: 1px solid #e4e9f1;
  border-radius: 12px;
  background: #ffffff;
}

.provider-icon-tile img {
  width: 32px;
  height: 32px;
}
```

Keep existing medium/mobile overrides, restoring normal workspace padding below `980px`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npm test -- --run src/App.css.test.ts src/components/ProvidersPage.test.tsx
```

Expected: both files pass.

- [ ] **Step 5: Commit**

```powershell
git add -- src/App.css src/App.css.test.ts
git commit -m "style: match providers reference layout"
```

### Task 3: Rendered fidelity and final verification

**Files:**
- Modify: `design-qa.md`
- Modify only if QA exposes an in-scope issue: files from Tasks 1-2.

**Interfaces:**
- Consumes: source image `C:\Users\PC\.codex\attachments\ab8d57f5-48c6-4f20-9317-b0f16d73842f\image-1.png`.
- Produces: same-size implementation capture and `design-qa.md` with `final result: passed`.

- [ ] **Step 1: Run the app and capture the exact target state**

Use the existing Vite server at `http://127.0.0.1:4174/`. In the Codex in-app Browser, open Providers, set viewport to `1390x1132`, and capture the page with the two default configurations and missing-key states.

- [ ] **Step 2: Compare source and implementation together**

Create one temporary side-by-side comparison outside the repository. Check:

- sidebar width and navigation alignment;
- workspace padding and title baseline;
- pipeline position, height, split, arrow, and status pills;
- configuration card position, header, button size, row height, icon tiles, columns, and actions;
- typography, borders, radii, colors, and no clipping.

- [ ] **Step 3: Fix P0-P2 mismatches with TDD**

For each reproducible issue, first add or tighten the smallest CSS/structure contract, verify it fails, make the minimal fix, and re-capture `1390x1132`. Do not loop on P3 pixel polish.

- [ ] **Step 4: Check responsive and interactive behavior**

Verify Providers at `900x900` and `390x844`, with `scrollWidth === clientWidth`. Open and close Add configuration, open Edit, and confirm focus returns to the opener. Check browser warning/error logs.

- [ ] **Step 5: Update the QA report**

Append evidence, fixed findings, remaining P3 notes, and:

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

Expected: `125+` tests pass, lint/build/diff check exit `0`, and only intentional QA changes remain before commit.

- [ ] **Step 7: Commit**

```powershell
git add -- design-qa.md src
git commit -m "test: verify providers reference clone"
```
