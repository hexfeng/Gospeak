# Providers And Settings Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class Providers page with named ASR/Rewrite configurations and reduce Settings to one low-frequency configuration page.

**Architecture:** Reuse the existing `providers` JSON preference rather than adding a new database table. Store named configuration metadata and active IDs in that preference, store each secret in keyring under its configuration ID, and pass active configuration IDs through existing pipeline requests so runtime routing remains explicit.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Tauri 2, Rust, rusqlite preferences, keyring 4.

## Global Constraints

- Primary navigation order is General, Providers, Profiles, Dictionary, Settings.
- Providers uses ASR and Rewrite tabs grouped by Provider.
- Configuration status is local completeness only; never claim connectivity.
- Each named configuration owns its own credential and secrets never enter SQLite or export JSON.
- Do not add connectivity tests, automatic retry, Provider priority, or cross-Provider fallback.
- Reuse existing dependencies and visual tokens; add no package.

---

### Task 1: Named Provider Configuration Domain

**Files:**
- Create: `src/domain/providerConfigurations.ts`
- Create: `src/domain/providerConfigurations.test.ts`
- Modify: `src/domain/config.ts`
- Test: `src/domain/config.test.ts`

**Interfaces:**
- Produces: `ProviderConfiguration`, `ProviderConfigurationState`, `ProviderConfigurationStatus`, `migrateProviderConfigurations`, `addLegacyCredentialConfigurations`, `activeProviderPair`, `configurationStatus`, `upsertProviderConfiguration`, `deleteProviderConfiguration`, `activateProviderConfiguration`.
- Consumes: existing Provider option arrays and URL validation rules.

- [ ] **Step 1: Write failing domain tests**

```ts
it("migrates the legacy active pair into named configurations", () => {
  const state = migrateProviderConfigurations(DEFAULT_APP_CONFIG.providers);
  expect(state.configurations.map((item) => item.kind)).toEqual(["stt", "rewrite"]);
  expect(activeProviderPair(state).stt.providerId).toBe("groq");
});

it("uses deterministic readiness precedence", () => {
  const config = qwenApiConfiguration({ baseUrl: "http://example.com", keyConfigured: false });
  expect(configurationStatus(config, {})).toBe("invalid-endpoint");
});

it("rejects a case-insensitive duplicate name inside one Provider", () => {
  expect(() => upsertProviderConfiguration(state, { ...candidate, name: " work " }))
    .toThrow("Configuration name already exists");
});

it("creates inactive configurations for legacy keys not in the active pair", () => {
  const migrated = addLegacyCredentialConfigurations(state, {
    doubao: true,
    openai: true,
  });
  expect(migrated.configurations).toEqual(expect.arrayContaining([
    expect.objectContaining({ providerId: "doubao", kind: "stt" }),
    expect.objectContaining({ providerId: "openai-realtime", kind: "stt" }),
    expect.objectContaining({ providerId: "openai", kind: "rewrite" }),
  ]));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/domain/providerConfigurations.test.ts src/domain/config.test.ts`
Expected: FAIL because the new module and state fields do not exist.

- [ ] **Step 3: Implement the minimum domain model**

```ts
export type ProviderConfiguration = {
  id: string;
  name: string;
  kind: "stt" | "rewrite";
  providerId: SttProviderId | RewriteProviderId;
  model: string;
  baseUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProviderConfigurationState = {
  configurations: ProviderConfiguration[];
  activeAsrConfigId: string;
  activeRewriteConfigId: string;
};

export type ProviderConfigurationStatus =
  | "configured"
  | "missing-key"
  | "missing-endpoint"
  | "invalid-endpoint"
  | "incomplete";
```

Add pure helpers that trim names, compare names case-insensitively within the same Provider, preserve stable IDs, validate supported model membership, apply endpoint rules, and derive the legacy `stt`/`rewrite` runtime pair from active IDs. Extend the stored `providers` preference with `configurations`, `activeAsrConfigId`, and `activeRewriteConfigId`; normalize legacy `{stt,rewrite}` values into this state on read. `addLegacyCredentialConfigurations` adds inactive default-model configurations for Groq, Qwen API, Doubao, and DeepSeek legacy key presence; an OpenAI legacy key adds any missing OpenAI Realtime ASR and OpenAI Rewrite configurations.

- [ ] **Step 4: Run domain tests and verify GREEN**

Run: `npm test -- src/domain/providerConfigurations.test.ts src/domain/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/providerConfigurations.ts src/domain/providerConfigurations.test.ts src/domain/config.ts src/domain/config.test.ts
git commit -m "feat: add named provider configuration domain"
```

### Task 2: Configuration-Scoped Credentials And Runtime Requests

**Files:**
- Modify: `src-tauri/src/provider.rs`
- Modify: `src-tauri/src/streaming.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/tauri.ts`
- Test: Rust unit tests in `src-tauri/src/provider.rs` and `src-tauri/src/streaming.rs`

**Interfaces:**
- Produces Tauri commands: `check_provider_configuration_keys`, `save_provider_configuration_key`, `remove_provider_configuration_key`, `migrate_provider_configuration_keys`.
- Extends requests with `stt_config_id` and `rewrite_config_id`.

- [ ] **Step 1: Write failing Rust tests**

```rust
#[test]
fn configuration_key_account_is_stable_and_secret_free() {
    assert_eq!(configuration_key_account("cfg-work"), "config:cfg-work");
    assert!(!configuration_key_account("cfg-work").contains("sk-"));
}

#[test]
fn request_uses_distinct_stt_and_rewrite_configuration_ids() {
    let request = audio_request_with_ids("cfg-asr", "cfg-rewrite");
    assert_eq!(request.stt_config_id, "cfg-asr");
    assert_eq!(request.rewrite_config_id, "cfg-rewrite");
}
```

- [ ] **Step 2: Run focused Rust tests and verify RED**

Run: `cargo test configuration_key_account request_uses_distinct --manifest-path src-tauri/Cargo.toml`
Expected: FAIL because the account helper and request fields do not exist.

- [ ] **Step 3: Implement configuration-scoped key access**

```rust
fn configuration_key_account(config_id: &str) -> String {
    format!("config:{config_id}")
}

pub(crate) fn configuration_key(
    config_id: &str,
    legacy_provider: &str,
) -> Result<String, ProviderError> {
    read_key(&configuration_key_account(config_id))
        .or_else(|_| read_key(legacy_provider))
        .ok_or_else(|| ProviderError::MissingKey(legacy_provider.to_string()))
}
```

Validate configuration IDs as non-empty opaque identifiers, return only `BTreeMap<String, bool>` presence maps, and use keyring delete for explicit removal. Migration copies legacy provider credentials to every supplied configuration account before deleting the legacy entry; on write failure it keeps the legacy entry.

Pass both configuration IDs through batch and streaming requests as
`#[serde(default)] Option<String>` during this task. Use a configuration-scoped
key when the ID is present and the legacy Provider key otherwise, so this commit
remains backward compatible until App wiring lands. Qwen Local still uses no
key and Qwen API remains optional.

- [ ] **Step 4: Run Rust tests and verify GREEN**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 112 existing tests plus the new credential/request tests pass; native paste remains ignored.

- [ ] **Step 5: Update TypeScript command wrappers and request types**

```ts
export type ConfigurationKeyPresence = Record<string, boolean>;

export async function saveProviderConfigurationKey(
  configurationId: string,
  apiKey: string,
): Promise<ConfigurationKeyPresence> {
  return invoke("save_provider_configuration_key", { configurationId, apiKey });
}
```

Add check, remove, and migration wrappers plus optional `stt_config_id` and
`rewrite_config_id` fields to audio and streaming request types. Browser preview
returns deterministic presence without storing secret values.

- [ ] **Step 6: Run frontend type tests**

Run: `npm test -- src/App.test.tsx`
Run: `npm run build`
Expected: PASS because the new request fields are temporarily optional.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/src/provider.rs src-tauri/src/streaming.rs src-tauri/src/lib.rs src/lib/tauri.ts
git commit -m "feat: scope provider credentials to configurations"
```

### Task 3: Providers Page

**Files:**
- Create: `src/components/ProvidersPage.tsx`
- Create: `src/components/ProvidersPage.test.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: named configuration state, key presence map, Provider option arrays, CRUD/activation/key callbacks.
- Produces: complete Providers page with ASR/Rewrite tabs.

- [ ] **Step 1: Write failing component tests**

```tsx
it("shows the active ASR to Rewrite pipeline and groups configurations", () => {
  renderProviders();
  expect(screen.getByText("Current pipeline")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "ASR" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("heading", { name: "Groq Whisper" })).toBeInTheDocument();
  expect(screen.getByText("Configured")).toBeInTheDocument();
});

it("previews, edits, activates, and blocks deleting the active configuration", async () => {
  const callbacks = renderProviders();
  await user.click(screen.getByRole("button", { name: "Preview Work Groq" }));
  expect(screen.getByText("Key configured")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete Work Groq" })).toBeDisabled();
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `npm test -- src/components/ProvidersPage.test.tsx`
Expected: FAIL because `ProvidersPage` does not exist.

- [ ] **Step 3: Implement the page with existing primitives**

```tsx
<section className="module-panel providers-page" aria-labelledby="providers-title">
  <PipelineSummary asr={activeAsr} rewrite={activeRewrite} />
  <div role="tablist" aria-label="Provider kinds">
    {(["stt", "rewrite"] as const).map((kind) => (
      <button
        aria-selected={activeKind === kind}
        key={kind}
        onClick={() => setActiveKind(kind)}
        role="tab"
        type="button"
      >
        {kind === "stt" ? "ASR" : "Rewrite"}
      </button>
    ))}
  </div>
  {groups.map((group) => (
    <ProviderGroup key={group.id} provider={group} configurations={group.items} />
  ))}
</section>
```

Use module-level components, native `dialog`, Lucide icons already installed, visible labels, arrow-key tab navigation, inline read-only preview, explicit activation, and configuration dialogs that retain input after failure. Do not add cards beyond the approved Provider groups.

- [ ] **Step 4: Add scoped styles**

Reuse existing white surfaces, `#e4e9f1` borders, 14–16px radii, focus styles, and responsive breakpoint. Keep the pipeline summary readable at 390px and stack configuration rows without horizontal overflow.

- [ ] **Step 5: Run component tests and verify GREEN**

Run: `npm test -- src/components/ProvidersPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/components/ProvidersPage.tsx src/components/ProvidersPage.test.tsx src/App.css
git commit -m "feat: add providers configuration page"
```

### Task 4: App Navigation, Persistence, And Runtime Wiring

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/GeneralPage.tsx`
- Modify: `src/components/GeneralPage.test.tsx`
- Modify: `src/domain/navigation.ts`

**Interfaces:**
- Consumes: Providers page callbacks and configuration-scoped Tauri commands.
- Produces: persisted named configurations, active request IDs, General deep links, approved navigation order.

- [ ] **Step 1: Write failing integration tests**

```tsx
it("orders Providers before Profiles and routes General model cards there", async () => {
  render(<App />);
  expect(screen.getAllByRole("navigation")[0].textContent)
    .toMatch(/General.*Providers.*Profiles.*Dictionary.*Settings/);
  await user.click(screen.getByRole("button", { name: /ASR model/ }));
  expect(screen.getByRole("heading", { name: "Providers" })).toBeInTheDocument();
});

it("passes active configuration IDs to dictation", async () => {
  await runOneDictation();
  expect(runAudioFileDictation).toHaveBeenCalledWith(expect.objectContaining({
    stt_config_id: "provider_default_groq",
    rewrite_config_id: "provider_default_openai",
  }));
});
```

- [ ] **Step 2: Run integration tests and verify RED**

Run: `npm test -- src/App.test.tsx src/components/GeneralPage.test.tsx`
Expected: FAIL on navigation and missing request IDs.

- [ ] **Step 3: Wire App state and persistence**

Load/migrate the `providers` preference once, call
`addLegacyCredentialConfigurations` with the existing Provider-scoped presence
map, persist the resulting metadata, invoke credential migration for every
generated configuration, then refresh configuration-scoped key presence.
Persist CRUD and activation through the existing
`persistPreference("providers", ...)`, and derive runtime `stt`/`rewrite`
snapshots from active IDs. Add `providers` to `AppSection`, remove
`SettingsTab`, and route General cards directly to the correct Providers tab.

After every request caller is wired, make `stt_config_id` and
`rewrite_config_id` required in the TypeScript request type. Keep Rust's serde
default only for backward-compatible command deserialization.

- [ ] **Step 4: Wire request IDs**

```ts
const active = activeProviderPair(config.providers);
const request = {
  stt_config_id: active.stt.id,
  stt_provider: active.stt.providerId,
  stt_model: active.stt.model,
  stt_base_url: active.stt.baseUrl ?? null,
  rewrite_config_id: active.rewrite.id,
  rewrite_provider: active.rewrite.providerId,
  rewrite_model: active.rewrite.model,
  // existing fields unchanged
};
```

- [ ] **Step 5: Run integration tests and verify GREEN**

Run: `npm test -- src/App.test.tsx src/components/GeneralPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/App.tsx src/App.test.tsx src/components/GeneralPage.tsx src/components/GeneralPage.test.tsx src/domain/navigation.ts
git commit -m "feat: wire named providers into app navigation"
```

### Task 5: Consolidated Settings And Schema-Two Import/Export

**Files:**
- Modify: `src/components/SettingsPage.tsx`
- Modify: `src/components/SettingsPage.test.tsx`
- Modify: `src/domain/config.ts`
- Modify: `src/domain/config.test.ts`
- Modify: `src-tauri/src/storage.rs`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces one Settings page and schema-version-two import/export.

- [ ] **Step 1: Write failing Settings and import tests**

```tsx
it("shows three vertical Settings sections without Provider controls", () => {
  renderSettings();
  expect(screen.getByRole("heading", { name: "Dictation" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Privacy & Data" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Advanced" })).toBeInTheDocument();
  expect(screen.queryByLabelText("ASR provider")).not.toBeInTheDocument();
});
```

```rust
#[test]
fn imports_schema_two_and_rejects_wrong_active_provider_kind() {
    let invalid = schema_two_payload_with_crossed_active_ids();
    assert!(import_config_payload(&mut connection(), &invalid).is_err());
}
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/components/SettingsPage.test.tsx src/domain/config.test.ts`
Run: `cargo test imports_schema_two --manifest-path src-tauri/Cargo.toml`
Expected: FAIL on old tabs/schema-one-only behavior.

- [ ] **Step 3: Simplify Settings**

Render three semantic sections in one vertical page and remove every Provider prop, tab, and key control. Preserve existing immediate-save behavior and existing import/export callbacks.

- [ ] **Step 4: Implement schema two**

```ts
export type ConfigExportPayload = {
  schemaVersion: 2;
  exportedAt: string;
  data: {
    providers: ProviderConfigurationState;
    // existing non-secret fields unchanged
  };
};
```

Rust import accepts schema 1 and 2. Schema 1 remains stored as legacy providers JSON for frontend migration; schema 2 validates unique configuration IDs, supported kinds, and active IDs referencing the correct kind before the existing transaction replaces data. Keys remain absent.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- src/components/SettingsPage.test.tsx src/domain/config.test.ts src/App.test.tsx`
Run: `cargo test import --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/components/SettingsPage.tsx src/components/SettingsPage.test.tsx src/domain/config.ts src/domain/config.test.ts src-tauri/src/storage.rs src/App.tsx
git commit -m "feat: consolidate settings and provider exports"
```

### Task 6: Providers And Settings Verification

**Files:**
- Modify only files required by failures found in this task.
- Delete temporary screenshots/artifacts before commit.

- [ ] **Step 1: Run the full automated set**

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

- [ ] **Step 2: Run browser QA**

Start the Vite preview and use the in-app browser. Verify 1280x720, 900px, and 390px widths; navigation order; General deep links; both Provider tabs; configured/incomplete/empty groups; preview/add/edit/delete/activation; consolidated Settings; keyboard focus; no overflow; and zero console errors. Capture the latest implementation screenshot and inspect it with `view_image`. Because the user explicitly opted out of generated visual concepts, compare against the approved text spec and the existing Gospeak visual system rather than inventing a new concept.

- [ ] **Step 3: Commit verification fixes**

```powershell
git add src/App.css src/App.css.test.ts src/App.tsx src/App.test.tsx src/components/ProvidersPage.tsx src/components/ProvidersPage.test.tsx src/components/SettingsPage.tsx src/components/SettingsPage.test.tsx
git commit -m "fix: finish providers and settings QA"
```
