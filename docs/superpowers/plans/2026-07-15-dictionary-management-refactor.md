# Dictionary Management Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the compact Dictionary cards with the approved searchable, filterable, paged management table and persist one fixed type per term.

**Architecture:** Add the fixed type to the existing dictionary SQLite row and import/export record, then keep search, filters, sorting, and 50-row paging as pure frontend derivation over the already-loaded global terms. Reuse the existing dialog and callbacks; add no grid, table, or tag dependency.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Tauri 2, Rust, rusqlite.

## Global Constraints

- Types are `person`, `organization`, `brand-product`, `technical-term`, `acronym`, and `other`.
- Type and tags organize the page only; every enabled term remains global.
- Search covers spoken phrase, written phrase, aliases, and tags.
- Page size is exactly 50 and default ordering is spoken phrase ascending.
- No custom types, domain routing, bulk actions, CSV import, or new dependency.

---

### Task 1: Persist Dictionary Type

**Files:**
- Modify: `src/domain/config.ts`
- Modify: `src/domain/config.test.ts`
- Modify: `src/lib/tauri.ts`
- Modify: `src-tauri/src/storage.rs`
- Test: Rust storage tests in `src-tauri/src/storage.rs`

**Interfaces:**
- Produces: `DictionaryTermType`, `DICTIONARY_TERM_TYPES`, `DictionaryTerm.type`, `DictionaryRecord.term_type`.

- [ ] **Step 1: Write failing frontend and Rust tests**

```ts
it("preserves Dictionary type in exported configuration", () => {
  const payload = buildExportPayload({
    config: DEFAULT_APP_CONFIG,
    dictionaryTerms: [{ ...term, type: "technical-term" }],
  });
  expect(payload.data.dictionaryTerms[0].type).toBe("technical-term");
});
```

```rust
#[test]
fn migrates_existing_dictionary_rows_to_other_and_round_trips_type() {
    let connection = legacy_dictionary_connection();
    migrate(&connection).unwrap();
    assert_eq!(list_dictionary_terms(&connection).unwrap()[0].term_type, "other");
}
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/domain/config.test.ts`
Run: `cargo test dictionary_rows_to_other --manifest-path src-tauri/Cargo.toml`
Expected: FAIL because the type field and column do not exist.

- [ ] **Step 3: Add the fixed frontend type**

```ts
export type DictionaryTermType =
  | "person"
  | "organization"
  | "brand-product"
  | "technical-term"
  | "acronym"
  | "other";

export const DICTIONARY_TERM_TYPES = [
  ["person", "Person"],
  ["organization", "Organization"],
  ["brand-product", "Brand or product"],
  ["technical-term", "Technical term"],
  ["acronym", "Acronym"],
  ["other", "Other"],
] as const;
```

Add `type` to `DictionaryTerm`, `term_type` to the Tauri record, and default missing imported/browser-preview values to `other`.

- [ ] **Step 4: Add the SQLite migration**

Add `term_type TEXT NOT NULL DEFAULT 'other'` through the existing column-upgrade helper. Include it in insert/update/select mapping and `dictionary_from_export`; validate imported values against the six allowed values and default a missing legacy value to `other`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- src/domain/config.test.ts`
Run: `cargo test dictionary --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/domain/config.ts src/domain/config.test.ts src/lib/tauri.ts src-tauri/src/storage.rs
git commit -m "feat: persist dictionary term types"
```

### Task 2: Dictionary Query And Paging Logic

**Files:**
- Create: `src/domain/dictionaryView.ts`
- Create: `src/domain/dictionaryView.test.ts`

**Interfaces:**
- Produces: `DictionaryFilters`, `filterDictionaryTerms`, `dictionaryTags`, `pageDictionaryTerms`, `DICTIONARY_PAGE_SIZE`.

- [ ] **Step 1: Write failing pure-function tests**

```ts
it("combines search, type, tag, and status filters", () => {
  const result = filterDictionaryTerms(terms, {
    query: "agent",
    type: "technical-term",
    tag: "work",
    status: "enabled",
  });
  expect(result.map((term) => term.id)).toEqual(["dict_agent_security"]);
});

it("sorts by spoken phrase and returns exactly fifty rows", () => {
  const result = pageDictionaryTerms(unsortedTerms(51), 1);
  expect(result.items).toHaveLength(50);
  expect(result.items[0].spoken.localeCompare(result.items[1].spoken)).toBeLessThanOrEqual(0);
  expect(result.pageCount).toBe(2);
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `npm test -- src/domain/dictionaryView.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement one-pass filtering and stable paging**

```ts
export const DICTIONARY_PAGE_SIZE = 50;

export function filterDictionaryTerms(
  terms: DictionaryTerm[],
  filters: DictionaryFilters,
): DictionaryTerm[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return terms
    .filter((term) => matchesFilters(term, filters, query))
    .toSorted((left, right) => left.spoken.localeCompare(right.spoken));
}
```

Use a `Set` for unique sorted tags. Clamp page numbers so deletes and filter changes cannot show an empty out-of-range page.

- [ ] **Step 4: Run test and verify GREEN**

Run: `npm test -- src/domain/dictionaryView.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/dictionaryView.ts src/domain/dictionaryView.test.ts
git commit -m "feat: add dictionary filtering and paging"
```

### Task 3: Dictionary Management Table

**Files:**
- Modify: `src/components/DictionaryPage.tsx`
- Modify: `src/components/DictionaryPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: type constants and view helpers.
- Preserves existing save/delete/toggle callbacks.

- [ ] **Step 1: Replace card expectations with failing table tests**

```tsx
it("renders counts, filters, and the approved table columns", () => {
  renderDictionary();
  expect(screen.getByText("2 terms · 2 enabled")).toBeInTheDocument();
  for (const heading of ["Spoken phrase", "Written phrase", "Type", "Tags", "Status", "Updated", "Actions"]) {
    expect(screen.getByRole("columnheader", { name: heading })).toBeInTheDocument();
  }
});

it("resets to page one when a filter changes", async () => {
  renderDictionary({ terms: termsForTwoPages() });
  await user.click(screen.getByRole("button", { name: "Next page" }));
  await user.selectOptions(screen.getByLabelText("Dictionary type"), "technical-term");
  expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run component test and verify RED**

Run: `npm test -- src/components/DictionaryPage.test.tsx`
Expected: FAIL on missing filters/table/type field.

- [ ] **Step 3: Implement the table and toolbar**

Use a semantic table on desktop with the exact approved columns. Put aliases under spoken phrase, render one type badge, render two tag chips plus a keyboard-focusable `+N` disclosure with the full tag list, use an inline enabled checkbox/switch, show date only, provide direct Edit plus Duplicate/Delete overflow, and show pagination only above 50 results.

Use controlled search/type/tag/status filters and reset page to one in each filter event handler. The empty dictionary offers `Add first term`; filtered-empty results show `Clear filters` and do not offer an add action.

- [ ] **Step 4: Update the dialog**

Add required type select, retain aliases/tags inputs, normalize duplicate tags case-insensitively while preserving the first entered spelling, clear spoken phrase on Duplicate, and keep all current duplicate-save, retry, and focus-return behavior.

- [ ] **Step 5: Update App record mapping**

Map `term.type <-> record.term_type` in load/save/import paths and preserve `other` for legacy values.

- [ ] **Step 6: Run component and integration tests and verify GREEN**

Run: `npm test -- src/components/DictionaryPage.test.tsx src/App.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/components/DictionaryPage.tsx src/components/DictionaryPage.test.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: rebuild dictionary as management table"
```

### Task 4: Dictionary Responsive Styling And Verification

**Files:**
- Modify: `src/App.css`
- Modify: `src/App.css.test.ts`
- Modify only files required by verification failures.

- [ ] **Step 1: Write a failing CSS contract test**

```ts
it("keeps the Dictionary table and narrow cards in the stylesheet", () => {
  expect(css).toContain(".dictionary-table");
  expect(css).toContain(".dictionary-mobile-row");
  expect(css).toContain("@media (max-width: 760px)");
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `npm test -- src/App.css.test.ts`
Expected: FAIL because the new selectors do not exist.

- [ ] **Step 3: Add minimal responsive styles**

Reuse existing page heading, white surface, border, radius, typography, button, focus, and dialog rules. Desktop uses a dense table without nested cards. At the existing narrow breakpoint, hide the table header and render each row as a compact grid/card prioritizing spoken phrase, written phrase, type, and status. Updated date and tags become secondary lines. Prevent horizontal overflow at 390px.

- [ ] **Step 4: Run the full automated set**

Run: `npm test`
Expected: all frontend tests pass.

Run: `npm run lint`
Expected: exit 0.

Run: `npm run build`
Expected: exit 0.

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all Rust tests pass; native paste smoke remains ignored.

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
Expected: exit 0.

Run: `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`
Expected: exit 0.

- [ ] **Step 5: Run browser QA**

Use the in-app browser at 1280x720, 900px, and 390px. Verify normal, empty, filtered-empty, disabled, 51-row pagination, add/edit/duplicate/delete, save-error, toggle-error, keyboard focus, tag disclosure, no overflow, and zero console errors. Capture and inspect the implementation screenshot with `view_image`; compare against the approved text design and current Gospeak visual system because the user opted out of generated concepts.

- [ ] **Step 6: Commit verification fixes**

```powershell
git add src/App.css src/App.css.test.ts src/components/DictionaryPage.tsx src/components/DictionaryPage.test.tsx
git commit -m "fix: finish dictionary management QA"
```

