# Provider Configuration Single-Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep each desktop Providers configuration on one responsive row and refresh the README screenshot.

**Architecture:** Retain the existing Providers markup and solve the layout at the shared CSS Grid root. The desktop grid will shrink flexible text columns while fixed status/date/actions remain visible; the existing mobile stack remains unchanged.

**Tech Stack:** React, TypeScript, CSS Grid, Vitest, Playwright

## Global Constraints

- No new dependencies or JavaScript width measurement.
- Preserve all Provider behavior and controls.
- Desktop rows stay single-line above 980px; mobile stacking remains at 980px and below.

---

### Task 1: Lock and fix the desktop row layout

**Files:**
- Modify: `src/App.css.test.ts`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `.provider-config-row`, `.provider-config-actions`, and existing `@media (max-width: 980px)` rules.
- Produces: a five-column single-row desktop layout above 980px.

- [ ] **Step 1: Write the failing CSS contract**

Require the desktop grid to use shrinking identity/model columns and require the
981–1300px rule to avoid `grid-column` row reassignment.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/App.css.test.ts`

Expected: FAIL because the current media rule moves the date and actions.

- [ ] **Step 3: Implement the minimal CSS fix**

Update the desktop column minimums, text overflow, gaps, and button padding.
Delete only the desktop row-reassignment declarations.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- --run src/App.css.test.ts`

Expected: PASS.

### Task 2: Verify rendered layout and refresh documentation

**Files:**
- Replace: `artifacts/providers.png`

**Interfaces:**
- Consumes: local preview at `http://127.0.0.1:4179/`.
- Produces: the current Providers README screenshot.

- [ ] **Step 1: Verify both desktop viewports**

Use Playwright at 1280×1024 and 1180×760. Assert all direct row children share
one vertical center band, the page has no horizontal overflow, and the console
has no errors.

- [ ] **Step 2: Replace the Providers screenshot**

Capture the verified 1280×1024 Providers page to `artifacts/providers.png`.

- [ ] **Step 3: Run repository checks**

Run:

```text
npm test -- --run
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit and push**

Commit the scoped files and push `main` to `origin/main`.
