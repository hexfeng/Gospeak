# Providers Compact List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Provider-group layout with one compact mixed ASR/Rewrite list that shows at most five rows per page and uses one simplified Add/Edit dialog.

**Architecture:** Keep `ProviderConfigurationState`, App callbacks, credential commands, runtime routing, and the pipeline summary unchanged. Limit the implementation to `ProvidersPage`, its component tests, and scoped CSS: render the existing configuration array directly, derive pagination during render, and reuse the existing native dialog for Add and Edit.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, native HTML `dialog`, existing Lucide icons, existing Gospeak CSS.

## Global Constraints

- Keep the active `ASR -> Rewrite` pipeline summary and its current status calculation.
- Render ASR and Rewrite configurations together; do not add tabs, filters, grouping, search, or sorting.
- Render exactly five or fewer configuration rows per page with no internal vertical scrollbar.
- Keep credentials in the OS credential store; never render or persist key values in frontend metadata.
- Keep explicit activation, incomplete-config activation, active-delete protection, and existing error handling.
- Do not change Settings, Profiles, backend Provider routing, import/export, retry, priority, fallback, or health-check behavior.
- Reuse the existing visual system; no generated concept is required for this small existing-system refinement.

---

### Task 1: Lock The Compact Mixed-List Behavior With Component Tests

**Files:**
- Modify: `src/components/ProvidersPage.test.tsx`

**Interfaces:**
- Consumes: `ProvidersPageProps` callbacks already exposed by `ProvidersPage`.
- Produces: failing tests for mixed rows, five-row pagination, compact actions, and Add/Edit dialog behavior.

- [ ] **Step 1: Replace group-oriented fixtures with a seven-configuration state**

Add a helper that preserves the two active defaults and appends five inactive configurations:

```tsx
function paginatedState() {
  const base = migrateProviderConfigurations(
    DEFAULT_APP_CONFIG.providers,
    "2026-07-15T12:00:00.000Z",
  );
  const extras: ProviderConfiguration[] = [
    { id: "groq-work", name: "Groq Work", kind: "stt", providerId: "groq", model: "whisper-large-v3", createdAt: "2026-07-15T12:00:00.000Z", updatedAt: "2026-07-15T12:00:00.000Z" },
    { id: "qwen-local", name: "Local Qwen", kind: "stt", providerId: "qwen-local", model: "Qwen/Qwen3-ASR-0.6B", baseUrl: "http://127.0.0.1:8000/v1", createdAt: "2026-07-15T12:00:00.000Z", updatedAt: "2026-07-15T12:00:00.000Z" },
    { id: "qwen-api", name: "Qwen Cloud", kind: "stt", providerId: "qwen-api", model: "Qwen/Qwen3-ASR-1.7B", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", createdAt: "2026-07-15T12:00:00.000Z", updatedAt: "2026-07-15T12:00:00.000Z" },
    { id: "doubao", name: "Doubao", kind: "stt", providerId: "doubao", model: "bigmodel", createdAt: "2026-07-15T12:00:00.000Z", updatedAt: "2026-07-15T12:00:00.000Z" },
    { id: "deepseek", name: "DeepSeek", kind: "rewrite", providerId: "deepseek", model: "deepseek-v4-flash", createdAt: "2026-07-15T12:00:00.000Z", updatedAt: "2026-07-15T12:00:00.000Z" },
  ];
  return { ...base, configurations: [...base.configurations, ...extras] };
}
```

Update the render helper so tests can supply that state:

```tsx
function renderProviders(
  keyPresence: Record<string, boolean> = {},
  state = migrateProviderConfigurations(
    DEFAULT_APP_CONFIG.providers,
    "2026-07-15T12:00:00.000Z",
  ),
) {
  const props = {
    state,
    keyPresence,
    onSave: vi.fn(async () => undefined),
    onActivate: vi.fn(async () => undefined),
    onDelete: vi.fn(async () => undefined),
    onRemoveKey: vi.fn(async () => undefined),
    onRefresh: vi.fn(async () => undefined),
  };
  render(<ProvidersPage {...props} />);
  return props;
}
```

- [ ] **Step 2: Write a failing mixed-list and pagination test**

```tsx
it("shows one mixed list with at most five configurations per page", async () => {
  const user = userEvent.setup();
  renderProviders({}, paginatedState());
  const list = screen.getByRole("region", { name: "Configurations" });

  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Groq Whisper" })).not.toBeInTheDocument();
  expect(within(list).getAllByTestId("provider-configuration-row")).toHaveLength(5);
  expect(within(list).getAllByText(/^(ASR|Rewrite)$/)).toHaveLength(5);
  expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(within(list).getAllByTestId("provider-configuration-row")).toHaveLength(2);
  expect(screen.getByText("DeepSeek")).toBeInTheDocument();
});
```

- [ ] **Step 3: Write a failing page-clamping test**

```tsx
it("clamps to the last valid page when configurations are removed", async () => {
  const user = userEvent.setup();
  const state = paginatedState();
  const props = {
    state,
    keyPresence: {},
    onSave: vi.fn(async () => undefined),
    onActivate: vi.fn(async () => undefined),
    onDelete: vi.fn(async () => undefined),
    onRemoveKey: vi.fn(async () => undefined),
    onRefresh: vi.fn(async () => undefined),
  };
  const view = render(<ProvidersPage {...props} />);
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

  view.rerender(
    <ProvidersPage
      {...props}
      state={{ ...state, configurations: state.configurations.slice(0, 5) }}
    />,
  );

  expect(screen.queryByText(/Page 2/)).not.toBeInTheDocument();
  expect(
    within(screen.getByRole("region", { name: "Configurations" }))
      .getByText("Groq Whisper"),
  ).toBeInTheDocument();
});
```

- [ ] **Step 4: Write a failing compact-row action test**

```tsx
it("shows row information and removes Preview", () => {
  const props = renderProviders({ provider_default_groq_stt: true });
  const list = screen.getByRole("region", { name: "Configurations" });
  const row = within(list).getByText("Groq Whisper").closest('[data-testid="provider-configuration-row"]')!;

  expect(within(row).getByText("ASR")).toBeInTheDocument();
  expect(within(row).getByText("whisper-large-v3-turbo")).toBeInTheDocument();
  expect(within(row).getByText("Configured")).toBeInTheDocument();
  expect(within(row).getByText("Active")).toBeInTheDocument();
  expect(within(row).getByRole("button", { name: "Edit" })).toBeInTheDocument();
  expect(within(row).getByRole("button", { name: "Delete" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
  expect(props.onActivate).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Write a failing Add dialog test**

```tsx
it("adds ASR or Rewrite from one simplified dialog", async () => {
  const user = userEvent.setup();
  const props = renderProviders();

  await user.click(screen.getByRole("button", { name: "Add configuration" }));
  await user.selectOptions(screen.getByLabelText("Type"), "rewrite");
  expect(screen.getByLabelText("Provider")).toHaveValue("openai");
  await user.type(screen.getByLabelText("Configuration name"), "Work rewrite");
  await user.selectOptions(screen.getByLabelText("Model"), "gpt-5-mini");
  await user.type(screen.getByLabelText("API key"), "sk-test");
  await user.click(screen.getByRole("button", { name: "Save configuration" }));

  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Work rewrite",
      kind: "rewrite",
      providerId: "openai",
      model: "gpt-5-mini",
    }),
    "sk-test",
  );
  expect(props.onActivate).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Write a failing Edit dialog test**

```tsx
it("keeps Type and Provider fixed while editing", async () => {
  const user = userEvent.setup();
  const props = renderProviders({ provider_default_groq_stt: true });
  const list = screen.getByRole("region", { name: "Configurations" });
  const row = within(list).getByText("Groq Whisper").closest('[data-testid="provider-configuration-row"]')!;

  await user.click(within(row).getByRole("button", { name: "Edit" }));
  expect(screen.getByLabelText("Type")).toBeDisabled();
  expect(screen.getByLabelText("Provider")).toBeDisabled();
  expect(screen.getByLabelText("API key")).toHaveValue("");
  await user.click(screen.getByRole("button", { name: "Save configuration" }));

  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({ id: "provider_default_groq_stt" }),
    undefined,
  );
});
```

- [ ] **Step 7: Run the focused tests and verify RED**

Run:

```powershell
npm test -- --run src/components/ProvidersPage.test.tsx
```

Expected: FAIL because the current component still renders tabs, Provider groups, Preview, all rows, and no Type field.

---

### Task 2: Implement The Unified Five-Row Providers List

**Files:**
- Modify: `src/components/ProvidersPage.tsx`
- Modify: `src/App.css`
- Test: `src/components/ProvidersPage.test.tsx`

**Interfaces:**
- Consumes: unchanged `ProviderConfigurationState`, `configurationStatus`, `activeProviderPair`, and existing App callbacks.
- Produces: one mixed paginated list and one Add/Edit dialog; no new App or backend interface.

- [ ] **Step 1: Replace tab and group state with page state**

Use one page-size constant and derived pagination:

```tsx
const PAGE_SIZE = 5;

export function ProvidersPage(props: ProvidersPageProps) {
  const initialFocusIndex = props.focus
    ? props.state.configurations.findIndex((item) => item.id === props.focus?.configurationId)
    : 0;
  const [page, setPage] = useState(
    Math.floor(Math.max(0, initialFocusIndex) / PAGE_SIZE) + 1,
  );
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pageError, setPageError] = useState("");
  const active = activeProviderPair(props.state);
  const pageCount = Math.max(1, Math.ceil(props.state.configurations.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleConfigurations = props.state.configurations.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
```

Delete `kind` state, the tablist, `provider-toolbar`, `provider-groups`, and every Provider-group header/Add button.
Also remove the Add button from `page-heading`; the Configurations header owns the
single Add action.

- [ ] **Step 2: Add one focus helper for pipeline-summary navigation**

```tsx
function focusConfiguration(configurationId: string) {
  const index = props.state.configurations.findIndex(
    (item) => item.id === configurationId,
  );
  setPage(Math.floor(Math.max(0, index) / PAGE_SIZE) + 1);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.getElementById(`provider-configuration-${configurationId}`)?.focus();
    });
  });
}
```

Pass `focusConfiguration(active.stt.id)` and
`focusConfiguration(active.rewrite.id)` to the two unchanged `PipelineStep`
controls.

- [ ] **Step 3: Render the compact section and rows**

Replace Provider groups with this structure:

```tsx
<section className="provider-configurations" aria-labelledby="provider-configurations-title">
  <header>
    <div>
      <h2 id="provider-configurations-title">Configurations</h2>
      <p>{props.state.configurations.length} saved</p>
    </div>
    <button onClick={() => setDialog({ mode: "new", kind: "stt" })} type="button">
      <Plus size={14} /> Add configuration
    </button>
  </header>

  <div className="provider-config-list">
    {visibleConfigurations.map((configuration) => {
      const status = configurationStatus(configuration, props.keyPresence);
      const isActive =
        configuration.id === props.state.activeAsrConfigId ||
        configuration.id === props.state.activeRewriteConfigId;
      return (
        <article
          className="provider-config-row"
          data-testid="provider-configuration-row"
          id={`provider-configuration-${configuration.id}`}
          key={configuration.id}
          tabIndex={-1}
        >
          <div className="provider-config-identity">
            <strong>{configuration.name}</strong>
            <span className="provider-kind-label">
              {configuration.kind === "stt" ? "ASR" : "Rewrite"}
            </span>
            <small>{providerLabel(configuration.providerId)}</small>
            {configuration.baseUrl ? <small>{configuration.baseUrl}</small> : null}
          </div>
          <span className="provider-config-model">{configuration.model}</span>
          <span className={`configuration-status status-${status}`}>{statusCopy[status]}</span>
          <small>Updated {formatDate(configuration.updatedAt)}</small>
          <div className="provider-config-actions">
            {isActive ? (
              <span className="active-config-label">Active</span>
            ) : (
              <button onClick={() => activate(configuration.id)} type="button">
                Use for {configuration.kind === "stt" ? "ASR" : "Rewrite"}
              </button>
            )}
            <button onClick={() => setDialog({ mode: "edit", configuration })} type="button">Edit</button>
            <button disabled={isActive} onClick={() => remove(configuration)} type="button">Delete</button>
          </div>
        </article>
      );
    })}
  </div>
</section>
```

Keep the existing activation/delete error messages. Implement `activate` and
`remove` as event helpers that call the existing props; do not move persistence
into this component:

```tsx
function activate(configurationId: string) {
  setPageError("");
  void props.onActivate(configurationId).catch(() => {
    setPageError(
      "Could not activate this configuration. The previous active configuration was kept.",
    );
  });
}

function remove(configuration: ProviderConfiguration) {
  if (!window.confirm(`Delete ${configuration.name}?`)) return;
  setPageError("");
  void props.onDelete(configuration).catch(() => {
    setPageError(
      "Could not delete this configuration. It remains available to retry.",
    );
  });
}
```

- [ ] **Step 4: Add pagination without an internal scrollbar**

```tsx
{pageCount > 1 ? (
  <footer className="provider-pagination">
    <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} type="button">Previous</button>
    <span>Page {currentPage} of {pageCount}</span>
    <button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} type="button">Next</button>
  </footer>
) : null}
```

Do not add `overflow-y`, a fixed list height, virtual scrolling, or a pagination dependency.

- [ ] **Step 5: Simplify dialog state and add the Type control**

Use only Add and Edit modes:

```tsx
type DialogState =
  | { mode: "new"; kind: ProviderConfiguration["kind"] }
  | { mode: "edit"; configuration: ProviderConfiguration }
  | null;
```

In `ProviderDialog`, make `kind` stateful and reset dependent fields when Type changes:

```tsx
const original = props.state.mode === "edit" ? props.state.configuration : undefined;
const initialKind = props.state.mode === "edit"
  ? props.state.configuration.kind
  : props.state.kind;
const [kind, setKind] = useState<ProviderConfiguration["kind"]>(initialKind);
const providerOptions = kind === "stt" ? STT_PROVIDER_OPTIONS : REWRITE_PROVIDER_OPTIONS;

function changeKind(nextKind: ProviderConfiguration["kind"]) {
  const nextOptions = nextKind === "stt" ? STT_PROVIDER_OPTIONS : REWRITE_PROVIDER_OPTIONS;
  const nextProvider = nextOptions[0];
  setKind(nextKind);
  setProviderId(nextProvider.id);
  setModel(nextProvider.models[0]);
  setBaseUrl(optionDefaultBaseUrl(nextProvider));
}
```

Render the field before Configuration name:

```tsx
<label>
  Type
  <select
    disabled={Boolean(original)}
    onChange={(event) => changeKind(event.target.value as ProviderConfiguration["kind"])}
    value={kind}
  >
    <option value="stt">ASR</option>
    <option value="rewrite">Rewrite</option>
  </select>
</label>
```

Keep Provider disabled during Edit, the existing conditional Base URL/API Key
fields, blank-key preservation, key removal confirmation, error retention, and
focus return. Delete Preview mode, Preview buttons, read-only branches, and
`KeyRound` if it becomes unused.

- [ ] **Step 6: Replace group/card CSS with compact row CSS**

Remove selectors used only by `.provider-groups`, `.provider-group`, and
`.provider-config-card`. Add:

```css
.provider-configurations {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid #e4e9f1;
  border-radius: 14px;
  background: #fff;
}

.provider-configurations > header,
.provider-config-row,
.provider-config-actions,
.provider-pagination {
  display: flex;
  align-items: center;
}

.provider-configurations > header,
.provider-pagination {
  justify-content: space-between;
}

.provider-config-list {
  display: grid;
  gap: 0;
}

.provider-config-row {
  min-height: 64px;
  gap: 14px;
  padding: 10px 0;
  border-top: 1px solid #edf0f5;
}

.provider-config-identity {
  display: flex;
  min-width: 0;
  flex: 1 1 260px;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.provider-config-identity small,
.provider-config-model {
  color: #667085;
}

.provider-kind-label {
  padding: 2px 7px;
  border-radius: 999px;
  background: #eef2f8;
  color: #344054;
  font-size: 11px;
  font-weight: 700;
}

.provider-config-actions {
  justify-content: flex-end;
  gap: 6px;
}

.provider-pagination {
  padding-top: 4px;
}
```

At the existing narrow breakpoint, allow `.provider-config-row` to wrap and
make `.provider-config-actions` full width. Do not introduce another breakpoint.

- [ ] **Step 7: Run the focused tests and verify GREEN**

Run:

```powershell
npm test -- --run src/components/ProvidersPage.test.tsx
```

Expected: all Providers component tests PASS.

- [ ] **Step 8: Commit the component change**

```powershell
git add src/components/ProvidersPage.tsx src/components/ProvidersPage.test.tsx src/App.css
git commit -m "fix: compact provider configuration list"
```

---

### Task 3: Regression And Desktop Verification

**Files:**
- Modify only files required to fix failures caused by Task 2.
- Delete temporary browser screenshots or QA artifacts before committing.

**Interfaces:**
- Consumes: completed compact Providers list.
- Produces: verified frontend behavior and Windows debug application without changing backend contracts.

- [ ] **Step 1: Run the complete frontend verification set**

```powershell
npm test -- --run
npm run lint
npm run build
```

Expected: every command exits 0; no snapshot or type failures.

- [ ] **Step 2: Run the unchanged Rust safety checks**

```powershell
Set-Location src-tauri
cargo test
cargo fmt -- --check
cargo clippy --all-targets --all-features -- -D warnings
Set-Location ..
```

Expected: all Rust unit tests pass, the manual native-paste smoke remains ignored,
and fmt/clippy exit 0.

- [ ] **Step 3: Verify the rendered Providers workflow in the in-app browser**

Start the existing Vite development server, then verify:

1. The pipeline summary is unchanged.
2. One `Configurations` list contains both ASR and Rewrite labels.
3. Five rows appear on page one and remaining rows appear after `Next`.
4. No Provider groups, ASR/Rewrite tabs, Preview button, or internal vertical scrollbar remain.
5. Add opens a dialog; switching Type resets Provider and Model; key and Qwen endpoint fields remain conditional.
6. Edit fixes Type and Provider; active Delete stays disabled; incomplete configuration activation still works.
7. At 900px and 390px widths, rows wrap without horizontal page overflow.
8. Keyboard focus reaches Add, pagination, Use, Edit, Delete, and every dialog field.
9. Browser console has no errors or warnings introduced by the change.

Because the user opted out of visual concepts and this is a small refinement
inside the existing Gospeak design system, compare against the approved text
spec and the current Gospeak styling rather than generating a new visual concept.

- [ ] **Step 4: Build the current Windows debug application**

```powershell
npm run tauri -- build --debug
```

Expected: exit 0 and recreate:

- `src-tauri/target/debug/gospeak.exe`
- `src-tauri/target/debug/bundle/nsis/Gospeak_0.1.0_x64-setup.exe`
- `src-tauri/target/debug/bundle/msi/Gospeak_0.1.0_x64_en-US.msi`

- [ ] **Step 5: Commit only verification fixes, if any**

If Step 1-4 required code changes:

```powershell
git add src/components/ProvidersPage.tsx src/components/ProvidersPage.test.tsx src/App.css
git commit -m "fix: finish compact providers QA"
```

If no code changes were required, do not create an empty commit.
