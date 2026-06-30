# App-Aware Routing And Cost Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add App-aware Profile routing and model cost visibility without changing the accepted P0 dictation provider pipeline.

**Architecture:** Add a small Rust app-context/routing boundary, persist App Rules in SQLite, expose the rules through Tauri commands, and let the React UI resolve the Profile before calling `run_audio_file_dictation`. Keep provider execution unchanged. Add cost estimate helpers in the frontend domain layer and render them in Providers.

**Tech Stack:** Tauri 2, Rust, SQLite through `rusqlite`, Windows API through the existing `windows` crate, React 19, TypeScript, Vitest, Cargo tests.

---

### Task 1: Rust App Context And Routing Resolver

**Files:**
- Create: `src-tauri/src/app_context.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Write failing resolver tests**

Add unit tests in `src-tauri/src/app_context.rs` for:

```rust
#[test]
fn routes_to_highest_priority_matching_rule() {
    let rules = vec![
        AppProfileRule::new_for_test("rule_normal", "chrome.exe", None, "normal", 1, true),
        AppProfileRule::new_for_test("rule_prompt", "chrome.exe", Some("ChatGPT"), "prompt", 10, true),
    ];
    let context = ForegroundAppContext {
        app_id: Some("chrome.exe".to_string()),
        window_title: Some("ChatGPT - Chrome".to_string()),
    };

    let resolved = resolve_profile_for_app_context(&rules, &context, "email");

    assert_eq!(resolved.profile_id, "prompt");
    assert_eq!(resolved.source, ProfileResolutionSource::AppRule);
    assert_eq!(resolved.matched_rule_id.as_deref(), Some("rule_prompt"));
}
```

Also cover disabled rules, app-only fallback, no foreground context, and fallback to active profile.

- [ ] **Step 2: Run Rust tests and verify failure**

Run:

```powershell
cd src-tauri
cargo test app_context --lib
```

Expected: fails because `app_context` module and resolver types do not exist.

- [ ] **Step 3: Implement resolver and Windows foreground detection**

Create `app_context.rs` with:

- `ForegroundAppContext { app_id: Option<String>, window_title: Option<String> }`
- `AppProfileRule { id, app_id, window_title_pattern, profile_id, priority, enabled, updated_at, deleted_at }`
- `ProfileResolutionSource`
- `ResolvedProfile`
- `resolve_profile_for_app_context`
- `current_foreground_app_context`

Windows detection should use `GetForegroundWindow`, `GetWindowTextW`, `GetWindowThreadProcessId`, and `QueryFullProcessImageNameW`; non-Windows should return empty context.

- [ ] **Step 4: Export Tauri command**

Expose `current_foreground_app_context` as `get_foreground_app_context` from `lib.rs`.

- [ ] **Step 5: Run tests**

Run:

```powershell
cd src-tauri
cargo test app_context --lib
cargo fmt -- --check
```

Expected: tests pass and formatting is clean.

### Task 2: SQLite App Rules CRUD And Import/Export

**Files:**
- Modify: `src-tauri/src/storage.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing storage tests**

Add tests in `storage.rs` for:

- `migrate` creates `app_profile_rules`.
- `upsert_app_profile_rule` then `list_app_profile_rules` returns enabled and disabled rules ordered by priority descending then app id.
- Soft-deleted rules are hidden.
- Config import/export payload validation accepts `appRules`.

- [ ] **Step 2: Run storage tests and verify failure**

Run:

```powershell
cd src-tauri
cargo test storage --lib
```

Expected: fails because App Rule storage functions do not exist.

- [ ] **Step 3: Implement storage**

Add `AppProfileRuleRecord` to `storage.rs`, table migration, `upsert_app_profile_rule`, and `list_app_profile_rules`. Extend config import validation to require or default `appRules` to an array, and persist imported rules transactionally.

- [ ] **Step 4: Expose Tauri commands**

Add `list_app_profile_rules` and `upsert_app_profile_rule` commands in `lib.rs`.

- [ ] **Step 5: Run tests**

Run:

```powershell
cd src-tauri
cargo test storage --lib
```

Expected: storage tests pass.

### Task 3: Frontend App Rules Domain And UI

**Files:**
- Modify: `src/domain/config.ts`
- Modify: `src/domain/config.test.ts`
- Modify: `src/lib/tauri.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Write failing frontend tests**

Add tests that:

- `buildExportPayload` includes `appRules` but still excludes API keys and transcript history.
- App Rules navigation renders a rule form.
- Saving an App Rule calls `upsertAppProfileRule`.
- Dictation uses the matching app rule Profile when App-aware routing is enabled.
- Disabling App-aware routing uses the manual Active Profile.

- [ ] **Step 2: Run frontend tests and verify failure**

Run:

```powershell
npm test -- src/domain/config.test.ts src/App.test.tsx
```

Expected: fails because App Rules types/UI and Tauri wrappers do not exist.

- [ ] **Step 3: Implement domain and Tauri wrappers**

Add `AppProfileRule`, `ForegroundAppContext`, routing preferences, `resolveProfileForContext`, `listAppProfileRules`, `upsertAppProfileRule`, and `getForegroundAppContext`.

- [ ] **Step 4: Implement UI**

Add `App Rules` nav item and section. Load stored rules on startup. Persist `appRouting.enabled` as a preference. Before dictation pipeline request, call `getForegroundAppContext`, resolve the Profile, and send the resolved `profile_id`.

- [ ] **Step 5: Run tests**

Run:

```powershell
npm test -- src/domain/config.test.ts src/App.test.tsx
```

Expected: tests pass.

### Task 4: Provider Cost Table

**Files:**
- Modify: `src/domain/config.ts`
- Modify: `src/domain/config.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Write failing cost tests**

Add tests for:

- Groq per-minute STT estimates for `whisper-large-v3-turbo` and `whisper-large-v3`.
- OpenAI per-1K token estimates for `gpt-5-nano` and `gpt-5-mini`.
- Providers page renders `Pricing snapshot: 2026-06-30`.

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test -- src/domain/config.test.ts src/App.test.tsx
```

Expected: fails because cost helpers/table do not exist.

- [ ] **Step 3: Implement cost helpers and table**

Add static pricing metadata with official-source labels and render a compact model table on the Providers page. Show STT per-minute estimates and rewrite per-1K input/output token estimates.

- [ ] **Step 4: Run tests**

Run:

```powershell
npm test -- src/domain/config.test.ts src/App.test.tsx
```

Expected: tests pass.

### Task 5: Final Verification And Docs

**Files:**
- Modify: `docs/P0_STATUS_PLAN.md`
- Modify: `docs/P0_ACCEPTANCE_MATRIX.md`

- [ ] **Step 1: Update docs**

Update Post-P0 status to mark App-aware routing and cost table as implemented locally, and add manual acceptance rows for Windows App-aware routing.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm test
npm run lint
npm run build
cd src-tauri
cargo test
cargo fmt -- --check
cargo clippy --all-targets --all-features -- -D warnings
```

Expected: all pass.

- [ ] **Step 3: Commit**

Run:

```powershell
git add docs src src-tauri package.json package-lock.json
git commit -m "feat: add app-aware routing and model cost table"
```
