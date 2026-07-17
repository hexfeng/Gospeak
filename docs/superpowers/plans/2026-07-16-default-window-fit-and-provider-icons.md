# Default Window Fit and Provider Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make General and Providers fit one supported app window without scrolling, while displaying aligned, branded Provider rows in pages of at most five.

**Architecture:** Keep the current React markup and five-item pagination. Add a desktop minimum-size contract in Tauri, local provider assets and one provider-to-asset mapping, then use height-aware CSS density to fit the existing cards and rows.

**Tech Stack:** React 19, TypeScript, CSS, Vitest/Testing Library, Tauri 2

## Global Constraints

- Default main window is `1180 x 760`; minimum supported main window is `1024 x 640`.
- General and Providers have no horizontal or vertical workspace scroll at supported sizes.
- Provider pages contain at most five configurations and reuse the existing Previous/Next controls.
- Do not add dependencies or change unrelated pages.

---

### Task 1: Lock the window and pagination contracts

**Files:**
- Modify: `src/App.css.test.ts`
- Modify: `src/components/ProvidersPage.test.tsx`
- Modify: `src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: existing `PAGE_SIZE = 5` pagination in `ProvidersPage`
- Produces: `1024 x 640` minimum window and regression coverage for layout/icon requirements

- [ ] **Step 1: Write failing CSS and component tests**

Add assertions for hidden workspace overflow, compact Provider geometry, and an image for each supported Provider ID. Keep the existing five-row and Next/Previous assertions.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/App.css.test.ts src/components/ProvidersPage.test.tsx`

Expected: FAIL because overflow is currently auto, rows are 110px, and several provider IDs have no image.

- [ ] **Step 3: Add the minimum Tauri size**

Set `minWidth` to `1024` and `minHeight` to `640` on the main window only.

### Task 2: Implement local logos and aligned compact rows

**Files:**
- Create: `src/assets/providers/qwen.svg`
- Create: `src/assets/providers/doubao.png`
- Create: `src/assets/providers/deepseek.svg`
- Modify: `src/components/ProvidersPage.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: Provider IDs from `STT_PROVIDER_OPTIONS` and `REWRITE_PROVIDER_OPTIONS`
- Produces: `providerIcon(providerId)` returning a local asset for every supported ID

- [ ] **Step 1: Add local provider assets and the complete mapping**

Map `groq`, both Qwen IDs, `doubao`, both OpenAI IDs, and `deepseek` to imported local assets.

- [ ] **Step 2: Reduce row geometry and align each direct grid item**

Use a viewport-height clamp for row/header/pipeline heights, smaller icon/action geometry, and `align-self: center` for model, status, date, and actions.

- [ ] **Step 3: Run focused tests**

Run: `npm test -- --run src/App.css.test.ts src/components/ProvidersPage.test.tsx`

Expected: PASS.

### Task 3: Fit General and Providers to the supported viewport

**Files:**
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `.workspace`, `.general-page`, `.providers-page` and existing responsive metric breakpoints
- Produces: a fixed-height right workspace whose cards shrink within `1024 x 640` without document overflow

- [ ] **Step 1: Hide workspace overflow for General and Providers**

Keep other page scrolling unchanged and scope the no-scroll behavior to these two modules.

- [ ] **Step 2: Add height-aware density**

Reduce workspace padding, General gaps/card minimums, Providers header/pipeline/card-row geometry, and pagination height at short desktop viewports while preserving the existing wide layout and hover effects.

- [ ] **Step 3: Run focused and full frontend checks**

Run: `npm test -- --run src/App.css.test.ts src/components/ProvidersPage.test.tsx`

Expected: PASS.

Run: `npm test`

Expected: PASS with zero failed tests.

### Task 4: Visual QA and build verification

**Files:**
- Verify only; no planned source files

**Interfaces:**
- Consumes: built Vite preview and Tauri configuration
- Produces: runtime evidence for no overflow and correct paging/logos

- [ ] **Step 1: Build and inspect both supported viewports**

Run: `npm run build`, then use the in-app browser at `1024 x 640` and `1180 x 760` on General and Providers. Check `scrollWidth === clientWidth` and `scrollHeight === clientHeight` for the right workspace.

- [ ] **Step 2: Verify five and six configurations**

Confirm five rows fit on page one, six configurations expose Previous/Next, and the second page shows the sixth row with its logo.

- [ ] **Step 3: Run release-grade checks**

Run: `npm run lint`

Expected: exit code 0.

Run: `npm run tauri -- build --debug`

Expected: exit code 0 and debug installers produced.

- [ ] **Step 4: Adversarial review**

Inspect the diff and explicitly attack: unsupported tiny windows, General `2 x 2` metric height, five-row Provider fit, pagination footer height, long model/date truncation, missing provider mappings, and preserved hover/focus effects. Fix every reproduced issue before completion.
