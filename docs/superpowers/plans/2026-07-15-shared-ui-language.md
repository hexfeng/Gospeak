# Shared UI Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Providers, Dictionary, and Settings with General through three shared presentation components and a stable responsive Providers grid.

**Architecture:** Add one small `ui.tsx` module containing native `PageHeader`, `Card`, and `Button` wrappers. Pages retain all application state and callbacks; the wrappers provide repeated markup and CSS classes only. Update the existing stylesheet in place and reuse the current General values rather than introducing tokens or dependencies.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS, Lucide React.

## Global Constraints

- General is the visual source of truth.
- Do not change General, Profiles, navigation, Settings information architecture, Provider data, persistence, retry, priority, fallback, or release behavior.
- Add no dependency, theme engine, component registry, or speculative variant.
- Preserve native button, section, ARIA, ref, focus, disabled, dialog, pagination, filtering, and error behavior.
- Keep the main lists free of internal vertical scrolling.

---

### Task 1: Shared presentation components

**Files:**
- Create: `src/components/ui.tsx`
- Create: `src/components/ui.test.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Produces: `PageHeader({ titleId, title, description, action? })`.
- Produces: `Card(props: React.ComponentPropsWithoutRef<"section">)`.
- Produces: `Button(props: React.ComponentPropsWithoutRef<"button"> & { variant?: "primary" | "secondary" | "danger" })` with a forwarded `HTMLButtonElement` ref.

- [ ] **Step 1: Write failing shared-component tests**

Create `src/components/ui.test.tsx` with tests that render a `PageHeader`, verify the title/description/action slot, verify `Card` forwards `aria-labelledby` and custom classes, and verify `Button` forwards `disabled`, `type`, click handling, custom classes, variants, and refs.

```tsx
const ref = createRef<HTMLButtonElement>();
render(<Button ref={ref} variant="primary" type="button">Save</Button>);
expect(screen.getByRole("button", { name: "Save" })).toHaveClass("ui-button-primary");
expect(ref.current).toBe(screen.getByRole("button", { name: "Save" }));
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/components/ui.test.tsx`

Expected: FAIL because `./ui` does not exist.

- [ ] **Step 3: Implement the minimal native wrappers**

Create `src/components/ui.tsx` using native elements and class-name concatenation only:

```tsx
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

export function PageHeader(props: { titleId: string; title: string; description: string; action?: ReactNode }) {
  return <header className="ui-page-header"><div><h1 id={props.titleId}>{props.title}</h1><p>{props.description}</p></div>{props.action}</header>;
}

export function Card({ className, ...props }: ComponentPropsWithoutRef<"section">) {
  return <section className={["ui-card", className].filter(Boolean).join(" ")} {...props} />;
}

export const Button = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<"button"> & { variant?: "primary" | "secondary" | "danger" }>(
  function Button({ className, variant = "secondary", ...props }, ref) {
    return <button className={["ui-button", `ui-button-${variant}`, className].filter(Boolean).join(" ")} ref={ref} {...props} />;
  },
);
```

Add `.ui-page-header`, `.ui-card`, and `.ui-button` styles to `src/App.css` using the existing General title scale, 14px description, 16px card radius, 40px button height, visible focus, and `white-space: nowrap`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- --run src/components/ui.test.tsx`

Expected: the shared-component test file passes.

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/ui.tsx src/components/ui.test.tsx src/App.css
git commit -m "feat: add shared ui primitives"
```

### Task 2: Providers grid and shared visual language

**Files:**
- Modify: `src/components/ProvidersPage.tsx`
- Modify: `src/components/ProvidersPage.test.tsx`
- Modify: `src/App.css`
- Modify: `src/App.css.test.ts`

**Interfaces:**
- Consumes: `PageHeader`, `Card`, and `Button` from `src/components/ui.tsx`.
- Preserves: every current `ProvidersPageProps` callback and the existing dialog state/focus behavior.

- [ ] **Step 1: Write failing structure and CSS regression checks**

Extend the Providers test to assert the page uses the shared header/card/button classes while retaining the existing accessible names. Extend `App.css.test.ts` to require a grid configuration row and non-wrapping shared buttons.

```ts
expect(screen.getByRole("button", { name: "Add configuration" })).toHaveClass("ui-button-primary");
expect(screen.getByRole("region", { name: "Configurations" })).toHaveClass("ui-card");
expect(css).toMatch(/\.provider-config-row\s*\{[^}]*display:\s*grid/s);
expect(css).toMatch(/\.ui-button\s*\{[^}]*white-space:\s*nowrap/s);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --run src/components/ProvidersPage.test.tsx src/App.css.test.ts`

Expected: FAIL because Providers still uses plain markup and the row is flex.

- [ ] **Step 3: Replace presentation markup without changing logic**

Use `PageHeader` for the page title, `Card` for the pipeline and configurations regions, and `Button` for Add, Use, Edit, Delete, pagination, Save, Remove key, and Cancel. Assign primary to Add/Save, danger to Delete, and secondary to the remaining actions.

Keep the current callbacks and accessible names verbatim. Do not change `configurationStatus`, `shortEndpoint`, focus return, or mutation code.

- [ ] **Step 4: Implement the stable responsive row grid**

Change only the relevant Providers CSS:

```css
.provider-config-row {
  display: grid;
  grid-template-columns: minmax(210px, 1.35fr) minmax(140px, 1fr) max-content minmax(96px, auto) max-content;
  align-items: center;
}
```

At medium width, let actions span a full grid row if required. At the existing narrow breakpoint, switch the row to one column and keep `.provider-config-actions` as a wrapping flex group. Button labels must not wrap.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- --run src/components/ProvidersPage.test.tsx src/App.css.test.ts`

Expected: Providers behavior and CSS checks pass.

- [ ] **Step 6: Commit**

```powershell
git add -- src/components/ProvidersPage.tsx src/components/ProvidersPage.test.tsx src/App.css src/App.css.test.ts
git commit -m "fix: align providers typography and layout"
```

### Task 3: Dictionary and Settings shared visual language

**Files:**
- Modify: `src/components/DictionaryPage.tsx`
- Modify: `src/components/DictionaryPage.test.tsx`
- Modify: `src/components/SettingsPage.tsx`
- Modify: `src/components/SettingsPage.test.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `PageHeader`, `Card`, and `Button` from `src/components/ui.tsx`.
- Preserves: all existing Dictionary and Settings props, callbacks, filtering, pagination, dialogs, and errors.

- [ ] **Step 1: Write failing page-structure tests**

Add focused assertions for the shared header, Card surfaces, and button variants without changing behavior assertions.

```ts
expect(screen.getByRole("button", { name: "Add term" })).toHaveClass("ui-button-primary");
expect(screen.getByRole("region", { name: "Dictionary entries" })).toHaveClass("ui-card");
expect(screen.getByRole("button", { name: "Export configuration" })).toHaveClass("ui-button-secondary");
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --run src/components/DictionaryPage.test.tsx src/components/SettingsPage.test.tsx`

Expected: FAIL because the pages do not yet use the shared classes.

- [ ] **Step 3: Integrate Dictionary**

Use `PageHeader` for the title/action, wrap the toolbar/table/pagination in one `Card` labelled `Dictionary entries`, and use `Button` for visible page/dialog actions. Keep the table, search inputs, filters, toggle, details menu, focus restoration, and pagination logic unchanged.

- [ ] **Step 4: Integrate Settings**

Use `PageHeader` for the title, make `SettingsSection` return `Card`, and use secondary `Button` components for export/import. Do not add tabs or alter section order.

- [ ] **Step 5: Align page-specific CSS**

Remove duplicated card surface properties now supplied by `.ui-card`. Keep Dictionary table overflow horizontal only when needed, retain 40px controls, and align section headings/helper text to the shared 17px/12px hierarchy.

- [ ] **Step 6: Run focused and full frontend checks**

Run:

```powershell
npm test -- --run src/components/DictionaryPage.test.tsx src/components/SettingsPage.test.tsx
npm test -- --run
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```powershell
git add -- src/components/DictionaryPage.tsx src/components/DictionaryPage.test.tsx src/components/SettingsPage.tsx src/components/SettingsPage.test.tsx src/App.css
git commit -m "feat: unify settings and dictionary ui"
```

### Task 4: Rendered design QA and final verification

**Files:**
- Create: `design-qa.md`
- Modify only if QA reproduces a scoped visual regression: files from Tasks 1–3.

**Interfaces:**
- Consumes: the supplied Providers screenshot and the rendered General page as visual references.
- Produces: a `design-qa.md` report with `final result: passed` or an explicit blocked status.

- [ ] **Step 1: Start the existing Vite app**

Run the existing `npm run dev` command on an available local port. Do not install a new server or dependency.

- [ ] **Step 2: Capture General and the three changed pages**

Use the Codex Desktop in-app Browser when available. Capture General, Providers, Dictionary, and Settings at approximately 1280px, 900px, and 390px. Exercise Providers pagination/Add dialog, Dictionary search/Add dialog, and Settings controls. Check the console.

- [ ] **Step 3: Compare and fix P0–P2 visual issues**

Compare the supplied Providers screenshot, General, and changed-page captures together. Verify title/description hierarchy, 16px surfaces, 40px controls, stable Providers rows, unwrapped action labels, focus visibility, and no horizontal page overflow. Record findings in `design-qa.md`; fix only reproducible in-scope problems.

- [ ] **Step 4: Run final verification**

Run:

```powershell
npm test -- --run
npm run lint
npm run build
git diff --check
git status --short
```

Expected: tests, lint, build, and diff check exit 0; only intentional design QA artifacts or no uncommitted files remain.

- [ ] **Step 5: Commit QA fixes if any**

```powershell
git add -- design-qa.md src
git commit -m "test: verify shared ui language"
```
