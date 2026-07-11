# General Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace General with a focused Gospeak dashboard showing all-time usage and three actionable configuration states.

**Architecture:** Extend the existing privacy-safe `usage_events` record with one integer character count populated by both Tauri dictation paths. Aggregate all-time values in `src/domain/usage.ts`, then render them through a simplified `GeneralPage` using existing navigation callbacks and focused CSS classes.

**Tech Stack:** Rust, rusqlite, Tauri 2, React 19, TypeScript, Vitest, Testing Library, CSS, in-app Browser.

## Global Constraints

- Store only a non-negative character count; never persist transcript or output text.
- Existing usage rows migrate to `output_character_count = 0` without estimation.
- Count non-whitespace Unicode scalar values from final output text.
- Keep the sidebar, Profiles, Dictionary, Settings, recorder overlay, providers, and database ownership unchanged.
- Add no dependency or frontend state-management abstraction.
- Preserve the 980px breakpoint and 40px minimum interaction target.

---

### Task 1: Persist Privacy-Safe Output Character Counts

**Files:**
- Modify: `src-tauri/src/storage.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `PipelineResult.text` and `StreamingPipelineResult.text`.
- Produces: `UsageEventRecord.output_character_count: u64`.

- [ ] **Step 1: Add failing migration and round-trip tests**

Extend the usage fixture with `output_character_count: 23`, then add:

```rust
#[test]
fn usage_events_round_trip_output_character_count() {
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    let columns = table_columns(&connection, "usage_events");
    assert!(columns.contains(&"output_character_count".to_string()));

    let event = UsageEventRecord {
        id: "usage_count".to_string(),
        stt_provider: "groq".to_string(),
        stt_model: "whisper-large-v3-turbo".to_string(),
        llm_provider: "openai".to_string(),
        llm_model: "gpt-5-nano".to_string(),
        profile_id: "normal".to_string(),
        audio_seconds: Some(1.0),
        stt_latency_ms: 10,
        rewrite_latency_ms: Some(5),
        rewrite_fallback_used: false,
        stt_estimated_cost: Some(0.001),
        rewrite_estimated_cost: Some(0.002),
        estimated_cost: Some(0.003),
        output_character_count: 23,
        created_at: "2026-07-10T00:00:00Z".to_string(),
    };
    insert_usage_event(&connection, &event).unwrap();
    assert_eq!(list_usage_events(&connection).unwrap()[0].output_character_count, 23);
}

#[test]
fn counts_non_whitespace_unicode_characters() {
    assert_eq!(output_character_count("Hello 世界\n"), 7);
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
cargo test usage_events_round_trip_output_character_count
cargo test counts_non_whitespace_unicode_characters
```

Expected: compilation or assertion failure because the field, migration, and helper do not exist.

- [ ] **Step 3: Add the field and migration**

Add to the Rust record:

```rust
pub output_character_count: u64,
```

Add to table creation and the upgrade path:

```sql
output_character_count INTEGER NOT NULL DEFAULT 0,
```

```rust
ensure_column(
    connection,
    "usage_events",
    "output_character_count",
    "INTEGER NOT NULL DEFAULT 0",
)?;
```

Include it in insert/select SQL and convert with `i64::try_from` / `u64::try_from`
like existing latency values.

- [ ] **Step 4: Populate standard and streaming events**

Add one private helper:

```rust
fn output_character_count(text: &str) -> u64 {
    u64::try_from(text.chars().filter(|character| !character.is_whitespace()).count())
        .unwrap_or(u64::MAX)
}
```

Before each usage record literal:

```rust
let output_character_count = output_character_count(&result.text);
```

Assign that value in both standard and streaming records. Update all Rust fixture
literals explicitly; never add output text to storage or logs.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
cargo test
cargo fmt -- --check
cargo clippy --all-targets --all-features -- -D warnings
git add src-tauri/src/storage.rs src-tauri/src/lib.rs
git commit -m "feat: track privacy-safe output counts"
```

Expected: all Rust checks pass and the task commit is clean.

---

### Task 2: Aggregate All-Time General Metrics

**Files:**
- Modify: `src/lib/tauri.ts`
- Modify: `src/domain/usage.ts`
- Modify: `src/domain/usage.test.ts`

**Interfaces:**
- Consumes: `UsageEventRecord[]` with an optional count for old frontend fixtures.
- Produces: `totalAudioSeconds`, `totalCharacterCount`, and `totalCost`.

- [ ] **Step 1: Write a failing all-time test**

Add `output_character_count: 20` to the base fixture and test rows across months:

```ts
it("aggregates all-time General metrics", () => {
  const events = [
    event("current", "2026-07-10T09:00:00.000Z", {
      audio_seconds: 30,
      output_character_count: 20,
      stt_estimated_cost: 0.001,
      rewrite_estimated_cost: 0.002,
    }),
    event("old", "2025-01-10T09:00:00.000Z", {
      audio_seconds: 90,
      output_character_count: 80,
      stt_estimated_cost: 0.004,
      rewrite_estimated_cost: null,
    }),
  ];

  expect(summarizeUsage(events)).toMatchObject({
    totalAudioSeconds: 120,
    totalCharacterCount: 100,
    totalCost: 0.007,
  });
});
```

Also assert empty input returns zero for all three fields.

- [ ] **Step 2: Run the focused test and verify failure**

```powershell
npm test -- src/domain/usage.test.ts
```

Expected: FAIL because the all-time fields do not exist.

- [ ] **Step 3: Extend the TypeScript record and one-pass summary**

Add to `UsageEventRecord`:

```ts
output_character_count?: number | null;
```

Add to `UsageSummary`:

```ts
totalAudioSeconds: number;
totalCharacterCount: number;
totalCost: number;
```

Initialize them to zero and aggregate inside the existing loop:

```ts
totalAudioSeconds += event.audio_seconds ?? 0;
totalCharacterCount += event.output_character_count ?? 0;
totalCost +=
  (event.stt_estimated_cost ?? 0) +
  (event.rewrite_estimated_cost ?? 0);
```

Keep existing daily/monthly fields for unrelated consumers.

- [ ] **Step 4: Verify and commit**

```powershell
npm test -- src/domain/usage.test.ts
git add src/lib/tauri.ts src/domain/usage.ts src/domain/usage.test.ts
git commit -m "feat: aggregate all-time General usage"
```

Expected: all usage-domain tests pass.

---

### Task 3: Replace General With The Focused Dashboard

**Files:**
- Modify: `src/components/GeneralPage.tsx`
- Modify: `src/components/GeneralPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `config`, `keyPresence`, `profiles`, `usageEvents`, `onOpenProfiles`, and `onOpenSettings`.
- Produces: three actionable status cards; removes General-only dictation and diagnostics props.

- [ ] **Step 1: Replace component tests with the approved contract**

Ready-state assertions:

```ts
expect(screen.getByRole("heading", { name: "Gospeak" })).toBeInTheDocument();
expect(screen.getByText(/Press Alt\+Space to start dictating\./)).toBeInTheDocument();
expect(screen.getByText("Total dictation time")).toBeInTheDocument();
expect(screen.getByText("Total characters")).toBeInTheDocument();
expect(screen.getByText("Usage mode")).toBeInTheDocument();
expect(screen.getByText("Total cost")).toBeInTheDocument();
expect(screen.getByText("Cloud")).toBeInTheDocument();
expect(screen.queryByText("Recent activity")).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: /Start Dictation/i })).not.toBeInTheDocument();
```

Click ASR and Rewrite and assert `onOpenSettings("providers")`; click Active
Profile and assert `onOpenProfiles()`. A second test supplies missing keys/Profile
and expects three `Not Set` values and not-ready classes. A third tests missing
hotkey copy.

- [ ] **Step 2: Run focused tests and verify failure**

```powershell
npm test -- src/components/GeneralPage.test.tsx src/App.test.tsx
```

Expected: FAIL against the old multi-section General.

- [ ] **Step 3: Implement the new markup**

Keep two formatting helpers local:

```ts
function formatDuration(seconds: number): string {
  const value = Math.max(0, Math.round(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = value % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}
```

Page skeleton:

```tsx
<section className="module-panel general-page" aria-labelledby="general-title">
  <header className="general-header">
    <h1 id="general-title">Gospeak</h1>
    <p>{hotkeyReady ? <>Press <kbd>{config.hotkey.binding}</kbd> to start dictating.</> : "Set a shortcut to start dictating."}</p>
  </header>
  <section className="general-metrics" aria-label="All-time usage">
    <Metric label="Total dictation time" value={formatDuration(usage.totalAudioSeconds)} />
    <Metric label="Total characters" value={usage.totalCharacterCount.toLocaleString()} />
    <Metric label="Usage mode" value={readiness.stt.ready ? "Cloud" : "Not Set"} />
    <Metric label="Total cost" value={formatCost(usage.totalCost)} />
  </section>
  <section className="general-status-grid" aria-label="Configuration status">
    <StatusCard
      label="ASR"
      value={readiness.stt.ready ? config.providers.stt.model : "Not Set"}
      ready={readiness.stt.ready}
      onClick={() => onOpenSettings("providers")}
    />
    <StatusCard
      label="Rewrite"
      value={readiness.rewrite.ready ? config.providers.rewrite.model : "Not Set"}
      ready={readiness.rewrite.ready}
      onClick={() => onOpenSettings("providers")}
    />
    <StatusCard
      label="Active Profile"
      value={activeProfileReady ? activeProfile?.name ?? "Not Set" : "Not Set"}
      ready={activeProfileReady}
      onClick={onOpenProfiles}
    />
  </section>
</section>
```

`StatusCard` receives `label`, `value`, `ready`, `onClick`; its class is
`general-status-card is-ready` or `general-status-card is-not-ready`.

Remove `isDictationBusy`, `dictationLabel`, `diagnostics`, `onStartDictation`, and
unused imports from `GeneralPageProps` and the App call site. Keep App's dictation
and diagnostics behavior for other surfaces.

- [ ] **Step 4: Verify and commit**

```powershell
npm test -- src/components/GeneralPage.test.tsx src/App.test.tsx
git add src/components/GeneralPage.tsx src/components/GeneralPage.test.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: focus General on usage and setup"
```

Expected: focused tests pass and navigation callbacks remain exact.

---

### Task 4: Style And Visually Verify General

**Files:**
- Modify: `src/App.css`
- Modify: `src/App.css.test.ts`
- Replace: `artifacts/gospeak-home.png`
- Create: `design-qa.md`

**Interfaces:**
- Consumes: `.general-header`, `.general-metrics`, `.general-metric`, `.general-status-grid`, `.general-status-card`, `.is-ready`, `.is-not-ready`.
- Produces: stable responsive layout and accepted visual evidence.

- [ ] **Step 1: Write failing CSS contracts**

```ts
expect(css).toMatch(/\.general-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s);
expect(css).toMatch(/\.general-status-card\.is-ready\s*\{[^}]*border-color:/s);
expect(css).toMatch(/\.general-status-card\.is-not-ready\s*\{[^}]*border-color:/s);
expect(css).toMatch(/\.general-status-card:hover[^{]*\{[^}]*transform:\s*translateY\(-2px\)/s);
expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.general-status-card/s);
expect(css).toMatch(/@media \(max-width: 980px\)[\s\S]*\.general-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
```

- [ ] **Step 2: Run CSS tests and verify failure**

```powershell
npm test -- src/App.css.test.ts
```

Expected: new General contracts fail.

- [ ] **Step 3: Add focused General styles**

Remove obsolete General-only rules only after confirming no other component uses
them. Add:

```css
.general-page { padding: 28px; }
.general-header { margin-bottom: 28px; }

.general-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--border);
  border-radius: 14px;
  background: #fff;
}

.general-metric { min-width: 0; padding: 22px; }

.general-status-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.general-status-card {
  min-height: 112px;
  padding: 18px;
  border: 1px solid;
  border-radius: 12px;
  background: #fff;
  text-align: left;
  transition: box-shadow 160ms ease, transform 160ms ease;
}

.general-status-card.is-ready { border-color: #8fc9aa; }
.general-status-card.is-not-ready { border-color: #e3aaa5; }
.general-status-card:hover { transform: translateY(-2px); }
```

Use separators inside the single metric card, not nested cards. At 980px use two
metric columns and one status column; at 560px use one metric column. Add visible
focus, soft hover shadow, and reduced-motion overrides.

- [ ] **Step 4: Run automated verification**

```powershell
npm test
npm run lint
npm run build
git diff --check
```

Expected: all tests pass; lint/build exit 0; diff check is empty.

- [ ] **Step 5: Run in-app Browser design QA**

Open `http://127.0.0.1:5174/` and compare with the supplied SayIt reference while
preserving Gospeak's sidebar and tokens. Verify:

1. Ready and missing-setup states at 1280x720.
2. 900px two-column metrics and 390px one-column metrics.
3. ASR/Rewrite navigate to Providers and Active Profile to Profiles.
4. Hover/focus states, no overflow/clipping, and no console errors.

Capture the accepted 1280x720 ready state to `artifacts/gospeak-home.png`.

- [ ] **Step 6: Record the blocking design QA result**

Create `design-qa.md` listing reference, viewport checks, resolved P0/P1/P2
mismatches, and this exact final line:

```markdown
final result: passed
```

Do not hand off while blocked or while a P0/P1/P2 mismatch remains.

- [ ] **Step 7: Build desktop bundles and commit**

```powershell
npm run tauri -- build --debug
git add src/App.css src/App.css.test.ts artifacts/gospeak-home.png design-qa.md
git commit -m "style: refine General dashboard"
```

Expected: NSIS and MSI debug bundles are produced and the visual task is committed.

## Final Verification

```powershell
npm test
npm run lint
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
npm run tauri -- build --debug
git diff --check
git status --short
```

Expected: every check passes; the worktree is clean; final review has no Critical
or Important findings; `design-qa.md` ends with `final result: passed`.
