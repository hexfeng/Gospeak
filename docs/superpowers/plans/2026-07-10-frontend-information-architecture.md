# Frontend Information Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Gospeak's seven-item settings-style shell with the approved General, Profiles, Dictionary, and Settings experience while preserving dictation and Tauri behavior.

**Architecture:** Keep `App.tsx` as the owner of persisted state, Tauri calls, and dictation orchestration. Move each large page into a focused React component, add one pure frontend usage-summary helper, and reuse existing upsert records for editing and soft deletion. No Rust command, SQLite migration, router, or new dependency is needed.

**Tech Stack:** React 19, TypeScript 6, existing CSS, Lucide React, Vitest, Testing Library, Tauri 2.

## Global Constraints

- Primary navigation is exactly `General`, `Profiles`, `Dictionary`, and `Settings`.
- Preserve the current Apple-inspired visual language; this is an interaction and information-architecture change, not a rebrand.
- General uses only existing privacy-safe `UsageEventRecord` fields and never displays transcript content.
- Profile App Rules live inside the selected Profile.
- Settings tabs are exactly `Dictation`, `Providers`, `Privacy & Data`, and `Advanced`.
- Reuse existing Profile, App Rule, Dictionary, preference, key, usage, and import/export commands.
- Add no npm or Cargo dependency and make no Rust or SQLite schema change.
- Preserve global hotkey, dictation, streaming, Speak to Edit, routing, clipboard paste, recorder overlay, and import/export behavior.

---

## File Map

Create:

- `src/domain/navigation.ts` - shared App section and Settings-tab types.
- `src/domain/usage.ts` - pure current-day/current-month usage aggregation.
- `src/domain/usage.test.ts` - deterministic date-boundary and cost tests.
- `src/components/GeneralPage.tsx` - readiness, setup, usage, recent activity.
- `src/components/GeneralPage.test.tsx` - General rendering and deep-link actions.
- `src/components/SettingsPage.tsx` - four Settings tabs and controls.
- `src/components/SettingsPage.test.tsx` - tab behavior and control callbacks.
- `src/components/ProfilesPage.tsx` - two-pane Profile editor and scoped App Rules.
- `src/components/ProfilesPage.test.tsx` - selection, dirty state, fallback, rules.
- `src/components/DictionaryPage.tsx` - searchable term list and native dialog.
- `src/components/DictionaryPage.test.tsx` - add, edit, duplicate validation, delete.

Modify:

- `src/App.tsx` - four-item navigation, page orchestration, persistence handlers.
- `src/App.test.tsx` - integration coverage for the consolidated shell.
- `src/App.css` - page layouts, tabs, lists, dialog, responsive collapse.
- `src/App.css.test.ts` - stable dimensions and responsive selectors.
- `src/setupTests.ts` - jsdom support for native dialog methods.
- `README.md` - replace the home screenshot after browser verification.
- `artifacts/gospeak-home.png` - accepted General screenshot from the final UI.

## Shared Interfaces

`src/domain/navigation.ts` owns the deep-link types used by `App.tsx`,
`GeneralPage.tsx`, and `SettingsPage.tsx`:

```ts
export type AppSection = "general" | "profiles" | "dictionary" | "settings";

export type SettingsTab =
  | "dictation"
  | "providers"
  | "privacy-data"
  | "advanced";
```

`App.tsx` remains responsible for all writes. Page components receive data and
callbacks; they do not invoke Tauri directly.

---

### Task 1: Add Privacy-Safe Usage Aggregation

**Files:**

- Create: `src/domain/usage.ts`
- Create: `src/domain/usage.test.ts`
- Source type: `src/lib/tauri.ts:108`

**Interfaces:**

- Consumes: `UsageEventRecord[]` and an optional `Date` for deterministic tests.
- Produces: `summarizeUsage(events, now): UsageSummary` and
  `recentUsageEvents(events, limit): UsageEventRecord[]`.

- [ ] **Step 1: Write the failing aggregation tests**

```ts
import { describe, expect, it } from "vitest";
import type { UsageEventRecord } from "../lib/tauri";
import { recentUsageEvents, summarizeUsage } from "./usage";

function event(
  id: string,
  createdAt: string,
  overrides: Partial<UsageEventRecord> = {},
): UsageEventRecord {
  return {
    id,
    stt_provider: "groq",
    stt_model: "whisper-large-v3-turbo",
    llm_provider: "openai",
    llm_model: "gpt-5-nano",
    profile_id: "normal",
    audio_seconds: 30,
    stt_latency_ms: 100,
    rewrite_latency_ms: 50,
    rewrite_fallback_used: false,
    stt_estimated_cost: 0.001,
    rewrite_estimated_cost: 0.002,
    estimated_cost: 0.003,
    created_at: createdAt,
    ...overrides,
  };
}

describe("summarizeUsage", () => {
  it("separates today's activity from current-month cost", () => {
    const now = new Date(2026, 6, 10, 12, 0, 0);
    const events = [
      event("today", new Date(2026, 6, 10, 9, 0, 0).toISOString()),
      event("month", new Date(2026, 6, 2, 9, 0, 0).toISOString(), {
        audio_seconds: 90,
        stt_estimated_cost: 0.004,
        rewrite_estimated_cost: 0.005,
      }),
      event("old", new Date(2026, 5, 30, 9, 0, 0).toISOString()),
    ];

    expect(summarizeUsage(events, now)).toEqual({
      todayCount: 1,
      todayAudioSeconds: 30,
      todayAverageLatencyMs: 150,
      todayFallbackCount: 0,
      monthSttCost: 0.005,
      monthRewriteCost: 0.007,
      monthTotalCost: 0.012,
    });
  });

  it("returns null average latency when today has no events", () => {
    const events = [event("old", "2026-06-30T12:00:00.000Z")];
    expect(summarizeUsage(events, new Date(2026, 6, 10))).toMatchObject({
      todayCount: 0,
      todayAverageLatencyMs: null,
    });
  });

  it("returns the newest privacy-safe events without mutating input", () => {
    const events = [
      event("older", "2026-07-09T10:00:00.000Z"),
      event("newer", "2026-07-10T10:00:00.000Z"),
    ];
    expect(recentUsageEvents(events, 1).map((item) => item.id)).toEqual([
      "newer",
    ]);
    expect(events.map((item) => item.id)).toEqual(["older", "newer"]);
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run: `npm test -- src/domain/usage.test.ts`

Expected: FAIL because `src/domain/usage.ts` does not exist.

- [ ] **Step 3: Implement the pure aggregation helper**

```ts
import type { UsageEventRecord } from "../lib/tauri";

export type UsageSummary = {
  todayCount: number;
  todayAudioSeconds: number;
  todayAverageLatencyMs: number | null;
  todayFallbackCount: number;
  monthSttCost: number;
  monthRewriteCost: number;
  monthTotalCost: number;
};

export function summarizeUsage(
  events: UsageEventRecord[],
  now = new Date(),
): UsageSummary {
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let todayCount = 0;
  let todayAudioSeconds = 0;
  let todayLatencyMs = 0;
  let todayFallbackCount = 0;
  let monthSttCost = 0;
  let monthRewriteCost = 0;

  for (const event of events) {
    const createdAt = new Date(event.created_at).getTime();
    if (createdAt >= monthStart && createdAt <= now.getTime()) {
      monthSttCost += event.stt_estimated_cost ?? 0;
      monthRewriteCost += event.rewrite_estimated_cost ?? 0;
    }
    if (createdAt >= todayStart && createdAt <= now.getTime()) {
      todayCount += 1;
      todayAudioSeconds += event.audio_seconds ?? 0;
      todayLatencyMs += event.stt_latency_ms + (event.rewrite_latency_ms ?? 0);
      todayFallbackCount += event.rewrite_fallback_used ? 1 : 0;
    }
  }

  return {
    todayCount,
    todayAudioSeconds,
    todayAverageLatencyMs:
      todayCount === 0 ? null : Math.round(todayLatencyMs / todayCount),
    todayFallbackCount,
    monthSttCost,
    monthRewriteCost,
    monthTotalCost: monthSttCost + monthRewriteCost,
  };
}

export function recentUsageEvents(
  events: UsageEventRecord[],
  limit = 5,
): UsageEventRecord[] {
  return [...events]
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    )
    .slice(0, limit);
}
```

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- src/domain/usage.test.ts`

Expected: 3 tests pass.

- [ ] **Step 5: Commit the helper**

```powershell
git add src/domain/usage.ts src/domain/usage.test.ts
git commit -m "feat: add usage summary helpers"
```

---

### Task 2: Build General As The Status Home

**Files:**

- Create: `src/domain/navigation.ts`
- Create: `src/components/GeneralPage.tsx`
- Create: `src/components/GeneralPage.test.tsx`

**Interfaces:**

- Consumes: `AppConfig`, `ApiKeyPresence`, Profiles, usage events, dictation
  button state, existing diagnostics as `ReactNode`, and navigation callbacks.
- Produces: `GeneralPage` and calls `onOpenProfiles()` or
  `onOpenSettings(tab)` for configuration summaries.

- [ ] **Step 1: Write a General page rendering test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_CONFIG } from "../domain/config";
import { GeneralPage } from "./GeneralPage";

describe("GeneralPage", () => {
  it("shows readiness, usage, cost, and profile navigation", async () => {
    const user = userEvent.setup();
    const onOpenProfiles = vi.fn();
    render(
      <GeneralPage
        config={DEFAULT_APP_CONFIG}
        keyPresence={{ groq: true, openai: true }}
        profiles={DEFAULT_APP_CONFIG.promptProfiles}
        usageEvents={[]}
        isDictationBusy={false}
        dictationLabel="Start Dictation"
        diagnostics={null}
        onStartDictation={vi.fn()}
        onOpenProfiles={onOpenProfiles}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Today's usage")).toBeInTheDocument();
    expect(screen.getByText("This month's cost")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Profiles" }));
    expect(onOpenProfiles).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- src/components/GeneralPage.test.tsx`

Expected: FAIL because `GeneralPage.tsx` does not exist.

- [ ] **Step 3: Create the page contract and status-first structure**

```tsx
import type { ReactNode } from "react";
import { Play } from "lucide-react";
import {
  getProviderReadiness,
  type ApiKeyPresence,
  type AppConfig,
  type PromptProfile,
} from "../domain/config";
import {
  recentUsageEvents,
  summarizeUsage,
} from "../domain/usage";
import type { UsageEventRecord } from "../lib/tauri";
import type { SettingsTab } from "../domain/navigation";

type GeneralPageProps = {
  config: AppConfig;
  keyPresence: ApiKeyPresence;
  profiles: PromptProfile[];
  usageEvents: UsageEventRecord[];
  isDictationBusy: boolean;
  dictationLabel: string;
  diagnostics: ReactNode;
  onStartDictation: () => void;
  onOpenProfiles: () => void;
  onOpenSettings: (tab: SettingsTab) => void;
};

export function GeneralPage(props: GeneralPageProps) {
  const readiness = getProviderReadiness(props.config, props.keyPresence);
  const usage = summarizeUsage(props.usageEvents);
  const recent = recentUsageEvents(props.usageEvents);
  const activeProfile = props.profiles.find(
    (profile) => profile.id === props.config.activeProfileId,
  );
  const ready = readiness.stt.ready && readiness.rewrite.ready;

  return (
    <section className="module-panel general-page" aria-labelledby="general-title">
      <header className="page-heading">
        <div>
          <h1 id="general-title">General</h1>
          <p>Current readiness, configuration, and private usage summary.</p>
        </div>
        <button
          className="primary-action"
          disabled={props.isDictationBusy}
          onClick={props.onStartDictation}
          type="button"
        >
          <Play size={16} />
          {props.dictationLabel}
        </button>
      </header>

      <strong className={ready ? "health-state good" : "health-state warn"}>
        {ready ? "Ready" : "Needs setup"}
      </strong>

      <section className="summary-grid" aria-label="Readiness">
        <Status label="STT" value={readiness.stt.ready ? "Ready" : readiness.stt.reason} />
        <Status label="Rewrite" value={readiness.rewrite.ready ? "Ready" : readiness.rewrite.reason} />
        <Status label="Hotkey" value={`${props.config.hotkey.binding} (${props.config.hotkey.mode})`} />
        <button aria-label="Open Profiles" className="summary-item" onClick={props.onOpenProfiles} type="button">
          <span>Active Profile</span>
          <strong>{activeProfile?.name ?? "Normal"}</strong>
        </button>
      </section>

      <section aria-labelledby="current-setup-title" className="usage-section">
        <h2 id="current-setup-title">Current setup</h2>
        <div className="summary-grid">
          <button className="summary-item" onClick={() => props.onOpenSettings("providers")} type="button"><span>STT model</span><strong>{props.config.providers.stt.model}</strong></button>
          <button className="summary-item" onClick={() => props.onOpenSettings("providers")} type="button"><span>Rewrite model</span><strong>{props.config.providers.rewrite.model}</strong></button>
          <button className="summary-item" onClick={() => props.onOpenSettings("dictation")} type="button"><span>Dictation</span><strong>{props.config.performance.fastMode ? "Fast" : "Standard"}</strong></button>
          <button className="summary-item" onClick={() => props.onOpenSettings("advanced")} type="button"><span>App routing</span><strong>{props.config.appRouting.enabled ? "On" : "Off"}</strong></button>
        </div>
      </section>

      <UsageSummary title="Today's usage" values={[
        ["Dictations", String(usage.todayCount)],
        ["Audio", `${Math.round(usage.todayAudioSeconds / 60)} min`],
        ["Average", usage.todayAverageLatencyMs === null ? "--" : `${usage.todayAverageLatencyMs} ms`],
        ["Fallbacks", String(usage.todayFallbackCount)],
      ]} />

      <UsageSummary title="This month's cost" values={[
        ["STT", `$${usage.monthSttCost.toFixed(4)}`],
        ["Rewrite", `$${usage.monthRewriteCost.toFixed(4)}`],
        ["Total", `$${usage.monthTotalCost.toFixed(4)}`],
      ]} />

      <section aria-labelledby="recent-activity-title">
        <h2 id="recent-activity-title">Recent activity</h2>
        {recent.length === 0 ? <p>No dictations recorded yet.</p> : recent.map((event) => (
          <article className="activity-row" key={event.id}>
            <strong>{event.profile_id}</strong>
            <span>{new Date(event.created_at).toLocaleString()}</span>
            <span>{event.stt_latency_ms + (event.rewrite_latency_ms ?? 0)} ms</span>
            <span>{event.rewrite_fallback_used ? "Raw fallback" : "Completed"}</span>
          </article>
        ))}
      </section>

      {props.diagnostics}
    </section>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return <article className="summary-item"><span>{label}</span><strong>{value}</strong></article>;
}

function UsageSummary({ title, values }: { title: string; values: string[][] }) {
  return <section className="usage-section"><h2>{title}</h2><div className="summary-grid">{values.map(([label, value]) => <Status key={label} label={label} value={value} />)}</div></section>;
}
```

- [ ] **Step 4: Run the isolated General component tests**

Do not switch `App.tsx` yet. Keeping the existing shell active until Settings
exists preserves every current control and keeps the intermediate commit
functional.

Run: `npm test -- src/domain/usage.test.ts src/components/GeneralPage.test.tsx`

Expected: usage and General component tests pass.

- [ ] **Step 5: Commit the isolated General component**

```powershell
git add src/domain/navigation.ts src/components/GeneralPage.tsx src/components/GeneralPage.test.tsx
git commit -m "feat: add General status home component"
```

---

### Task 3: Consolidate Low-Frequency Controls Into Settings

**Files:**

- Create: `src/components/SettingsPage.tsx`
- Create: `src/components/SettingsPage.test.tsx`
- Modify: `src/App.tsx:316`
- Modify: `src/App.test.tsx:170`

**Interfaces:**

- Consumes: `SettingsTab` from `src/domain/navigation.ts`.
- Produces: `SettingsPage`.
- Consumes: `activeTab`, current config/key state, and the existing App handler
  callbacks for hotkey, provider, privacy, performance, routing, keys,
  import/export, and refresh.

- [ ] **Step 1: Write Settings tab and callback tests**

```tsx
it("shows four settings tabs and routes controls to their owner", async () => {
  const user = userEvent.setup();
  const onTabChange = vi.fn();
  render(<SettingsPage {...settingsProps} onTabChange={onTabChange} />);

  expect(screen.getAllByRole("tab")).toHaveLength(4);
  await user.click(screen.getByRole("tab", { name: "Providers" }));
  expect(onTabChange).toHaveBeenCalledWith("providers");
});

it("moves Settings tabs with arrow keys", async () => {
  const user = userEvent.setup();
  const onTabChange = vi.fn();
  render(<SettingsPage {...settingsProps} onTabChange={onTabChange} />);
  const dictation = screen.getByRole("tab", { name: "Dictation" });
  dictation.focus();
  await user.keyboard("{ArrowRight}");
  expect(onTabChange).toHaveBeenCalledWith("providers");
  expect(screen.getByRole("tab", { name: "Providers" })).toHaveFocus();
});

it("keeps API key save explicit", async () => {
  const user = userEvent.setup();
  const onSaveKey = vi.fn();
  render(
    <SettingsPage
      {...settingsProps}
      activeTab="providers"
      groqKey="gsk-test"
      onSaveKey={onSaveKey}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Save Groq key" }));
  expect(onSaveKey).toHaveBeenCalledWith("groq", "gsk-test");
});
```

Define `settingsProps` in the test with `DEFAULT_APP_CONFIG`, empty key inputs,
and `vi.fn()` for every callback in the `SettingsPageProps` interface.

- [ ] **Step 2: Run the test and verify the missing component failure**

Run: `npm test -- src/components/SettingsPage.test.tsx`

Expected: FAIL because `SettingsPage.tsx` does not exist.

- [ ] **Step 3: Implement the four-tab shell**

```tsx
import type { SettingsTab } from "../domain/navigation";

type SettingsPageProps = {
  activeTab: SettingsTab;
  config: AppConfig;
  keyPresence: ApiKeyPresence;
  groqKey: string;
  openAiKey: string;
  onTabChange: (tab: SettingsTab) => void;
  onGroqKeyChange: (value: string) => void;
  onOpenAiKeyChange: (value: string) => void;
  onSaveKey: (provider: "groq" | "openai", key: string) => void;
  onRefreshKeys: () => void;
  onChangeHotkey: (next: Partial<AppConfig["hotkey"]>) => void;
  onChangeProviderModel: (kind: "stt" | "rewrite", model: string) => void;
  onChangePrivacy: (
    key: keyof AppConfig["privacy"],
    enabled: boolean,
  ) => void;
  onChangeFastMode: (enabled: boolean) => void;
  onChangeSpeakToEdit: (enabled: boolean) => void;
  onChangeStreamingMode: (enabled: boolean) => void;
  onChangeAppRouting: (enabled: boolean) => void;
  onExport: () => void;
  onImport: () => void;
};

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "dictation", label: "Dictation" },
  { id: "providers", label: "Providers" },
  { id: "privacy-data", label: "Privacy & Data" },
  { id: "advanced", label: "Advanced" },
];

export function SettingsPage(props: SettingsPageProps) {
  return (
    <section className="module-panel settings-page" aria-labelledby="settings-title">
      <header className="page-heading">
        <div><h1 id="settings-title">Settings</h1><p>Low-frequency Gospeak configuration.</p></div>
      </header>
      <div aria-label="Settings sections" className="settings-tabs" role="tablist">
        {tabs.map((tab, index) => (
          <button
            aria-selected={props.activeTab === tab.id}
            key={tab.id}
            onClick={() => props.onTabChange(tab.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const delta = event.key === "ArrowRight" ? 1 : -1;
              const nextIndex = (index + delta + tabs.length) % tabs.length;
              const next = tabs[nextIndex];
              props.onTabChange(next.id);
              const tabButtons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']");
              tabButtons?.[nextIndex]?.focus();
            }}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <section aria-live="polite" className="settings-content">
        {props.activeTab === "dictation" ? <DictationSettings {...props} /> : null}
        {props.activeTab === "providers" ? <ProviderSettings {...props} /> : null}
        {props.activeTab === "privacy-data" ? <PrivacyDataSettings {...props} /> : null}
        {props.activeTab === "advanced" ? <AdvancedSettings {...props} /> : null}
      </section>
    </section>
  );
}
```

Define `DictationSettings`, `ProviderSettings`, `PrivacyDataSettings`, and
`AdvancedSettings` in the same file with `SettingsPageProps` as their exact
parameter type. Each helper renders only the controls assigned to its tab in
the mapping below and calls the named callback directly; it owns no persisted
state.

Move the existing controls without changing their values or callbacks:

- `General` hotkey and Fast/Speak to Edit controls -> `DictationSettings`.
- `Providers` model/key controls -> `ProviderSettings`.
- `Privacy` toggles plus Import/Export buttons -> `PrivacyDataSettings`.
- App-aware routing and Experimental Streaming -> `AdvancedSettings`.

Do not move `UsageCostTotals`; remove that rendering because General now owns
cost visibility. Remove the provider JSON `<pre>` preview.

After each successful hotkey, provider-model, privacy, performance, or routing
write, set the App notice to `{ text: "Saved", tone: "info" }`. Keep API-key,
import, and export messages specific because those operations require explicit
confirmation. Add a fake-timer App test proving the generic Saved notice clears
after four seconds while an error notice remains.

- [ ] **Step 4: Confirm import before opening the native picker**

At the beginning of `importConfiguration` in `App.tsx`, add:

```ts
if (
  !window.confirm(
    "Importing will replace local Profiles, Dictionary terms, App Rules, and preferences. Continue?",
  )
) {
  return;
}
```

Add an App integration test that mocks `window.confirm` to `false`, clicks
`Settings`, opens `Privacy & Data`, clicks `Import configuration`, and verifies
`selectImportPath` was not called. Restore the mock after the test.

- [ ] **Step 5: Wire General and Settings in one App-shell change**

Keep `handleDictationToggle`, `LatencyDiagnostics`, and all dictation state in
`App.tsx`. Remove the global `Gospeak Alpha` topbar so each destination owns its
page heading. Add:

```ts
type AppNotice = { text: string; tone: "info" | "error" } | null;
const [notice, setNotice] = useState<AppNotice>(null);
const [settingsTab, setSettingsTab] = useState<SettingsTab>("dictation");

useEffect(() => {
  if (notice?.tone !== "info") return;
  const timeout = window.setTimeout(() => setNotice(null), 4000);
  return () => window.clearTimeout(timeout);
}, [notice]);

function dictationButtonLabel(config: AppConfig, status: string): string {
  if (status === "recording") {
    return config.performance.speakToEdit
      ? "Stop Speak to Edit"
      : "Stop Dictation";
  }
  return config.performance.speakToEdit
    ? "Start Speak to Edit"
    : "Start Dictation";
}
```

Use `tone: "error"` in existing catch/validation branches and `tone: "info"`
for successful saves and status updates. Render one `role="status"` for info or
`role="alert"` for errors immediately above the active page.

Replace the current General branch with:

```tsx
<GeneralPage
  config={config}
  keyPresence={keyPresence}
  profiles={profiles}
  usageEvents={usageEvents}
  isDictationBusy={isDictationBusy}
  dictationLabel={dictationButtonLabel(config, dictation.status)}
  diagnostics={
    lastDiagnostics ? <LatencyDiagnostics diagnostics={lastDiagnostics} /> : null
  }
  onStartDictation={() => void handleDictationToggle()}
  onOpenProfiles={() => setActiveSection("profiles")}
  onOpenSettings={(tab) => {
    setSettingsTab(tab);
    setActiveSection("settings");
  }}
/>
```

Render `SettingsPage` for the new Settings branch and pass the current config,
key inputs, key status, and existing persistence handlers through the exact
`SettingsPageProps` contract.

Replace Providers, Privacy, and Import/Export navigation with Settings while
temporarily retaining App Rules until Task 4:

Change the section union and nav data in `App.tsx`:

```ts
type AppSection =
  | "general"
  | "profiles"
  | "app-rules"
  | "dictionary"
  | "settings";

const navItems = [
  { id: "general", label: "General", icon: Settings },
  { id: "profiles", label: "Profiles", icon: SlidersHorizontal },
  { id: "app-rules", label: "App Rules", icon: Route },
  { id: "dictionary", label: "Dictionary", icon: BookMarked },
  { id: "settings", label: "Settings", icon: Settings },
] satisfies Array<{ id: AppSection; label: string; icon: typeof Settings }>;
```

App Rules remains temporarily until Task 4 merges it into Profiles. Add
the five-item temporary section union shown above and update App integration
tests in the same commit.

- [ ] **Step 6: Run Settings and App integration tests**

Run: `npm test -- src/components/SettingsPage.test.tsx src/App.test.tsx`

Expected: Settings tests and all migrated provider/privacy/import tests pass.

- [ ] **Step 7: Commit Settings**

```powershell
git add src/components/SettingsPage.tsx src/components/SettingsPage.test.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: consolidate desktop settings"
```

---

### Task 4: Merge App Rules Into The Profile Editor

**Files:**

- Create: `src/components/ProfilesPage.tsx`
- Create: `src/components/ProfilesPage.test.tsx`
- Modify: `src/App.tsx:203`
- Modify: `src/App.test.tsx:368`

**Interfaces:**

- Consumes: Profiles, App Rules, active Profile id, foreground context, and App
  persistence callbacks.
- Produces callbacks with complete domain records:
  `onSaveProfile(profile)`, `onDeleteProfile(profile)`,
  `onSaveRule(rule)`, `onDeleteRule(rule)`, and `onSetActive(profileId)`.

- [ ] **Step 1: Write Profile selection and rule-scoping tests**

```tsx
it("opens on the active Profile and shows only its App Rules", () => {
  render(
    <ProfilesPage
      profiles={profiles}
      appRules={rules}
      activeProfileId="email"
      foregroundContext={null}
      onSaveProfile={vi.fn()}
      onDeleteProfile={vi.fn()}
      onSaveRule={vi.fn()}
      onDeleteRule={vi.fn()}
      onSetActive={vi.fn()}
    />,
  );
  expect(screen.getByRole("heading", { name: "Email" })).toBeInTheDocument();
  expect(screen.getByText("outlook.exe")).toBeInTheDocument();
  expect(screen.queryByText("code.exe")).not.toBeInTheDocument();
});

it("does not offer deletion for the Normal fallback", () => {
  render(<ProfilesPage {...profileProps} activeProfileId="normal" />);
  expect(screen.queryByRole("button", { name: "Delete Normal" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused tests and verify the missing component failure**

Run: `npm test -- src/components/ProfilesPage.test.tsx`

Expected: FAIL because `ProfilesPage.tsx` does not exist.

- [ ] **Step 3: Implement the two-pane state model**

```tsx
type ProfileDraft = Pick<
  PromptProfile,
  "id" | "name" | "mode" | "systemPrompt" | "userPromptTemplate" |
    "targetLanguage" | "enabled"
>;

type ProfilesPageProps = {
  profiles: PromptProfile[];
  appRules: AppProfileRule[];
  activeProfileId: string;
  foregroundContext: ForegroundAppContext | null;
  onSaveProfile: (profile: PromptProfile) => void;
  onDeleteProfile: (profile: PromptProfile) => void;
  onSaveRule: (rule: AppProfileRule) => void;
  onDeleteRule: (rule: AppProfileRule) => void;
  onSetActive: (profileId: string) => void;
  onDirtyChange: (dirty: boolean) => void;
};

function toDraft(profile: PromptProfile): ProfileDraft {
  return {
    id: profile.id,
    name: profile.name,
    mode: profile.mode,
    systemPrompt: profile.systemPrompt,
    userPromptTemplate: profile.userPromptTemplate,
    targetLanguage: profile.targetLanguage,
    enabled: profile.enabled,
  };
}

export function ProfilesPage(props: ProfilesPageProps) {
  const initial =
    props.profiles.find((profile) => profile.id === props.activeProfileId) ??
    props.profiles[0];
  const [selectedId, setSelectedId] = useState(initial?.id ?? "");
  const selected = props.profiles.find((profile) => profile.id === selectedId);
  const [draft, setDraft] = useState<ProfileDraft | null>(
    selected ? toDraft(selected) : null,
  );
  const [profileQuery, setProfileQuery] = useState("");
  const dirty = selected !== undefined && draft !== null &&
    JSON.stringify(toDraft(selected)) !== JSON.stringify(draft);
  const visibleProfiles = props.profiles.filter((profile) =>
    profile.name.toLocaleLowerCase().includes(profileQuery.toLocaleLowerCase()),
  );
  const rules = props.appRules.filter(
    (rule) => rule.profileId === selectedId && !rule.deletedAt,
  );

  useEffect(() => props.onDirtyChange(dirty), [dirty, props.onDirtyChange]);

  function selectProfile(profile: PromptProfile) {
    if (dirty && !window.confirm("Discard unsaved Profile changes?")) return;
    setSelectedId(profile.id);
    setDraft(toDraft(profile));
  }

  function duplicateProfile(profile: PromptProfile) {
    const copy: PromptProfile = {
      ...profile,
      id: `profile_${crypto.randomUUID()}`,
      name: `${profile.name} Copy`,
      updatedAt: new Date().toISOString(),
    };
    props.onSaveProfile(copy);
  }

  function startNewProfile() {
    const id = `profile_${crypto.randomUUID()}`;
    setSelectedId(id);
    setDraft({
      id,
      name: "",
      mode: "normal",
      systemPrompt: "Clean the transcript into natural written text without adding facts.",
      userPromptTemplate: "Transcript:\n{{transcript}}\n\nDictionary terms:\n{{dictionaryTerms}}",
      targetLanguage: undefined,
      enabled: true,
    });
  }

  return (
    <section className="module-panel profiles-page" aria-labelledby="profiles-title">
      <header className="page-heading"><div><h1 id="profiles-title">Profiles</h1><p>Writing behavior and automatic app switching.</p></div></header>
      <div className="profile-split">
        <ProfileList profiles={visibleProfiles} query={profileQuery} selectedId={selectedId} rules={props.appRules} onAdd={startNewProfile} onQueryChange={setProfileQuery} onSelect={selectProfile} />
        {draft ? (
          <ProfileEditor
            active={draft.id === props.activeProfileId}
            draft={draft}
            foregroundContext={props.foregroundContext}
            rules={rules}
            onChange={setDraft}
            onDeleteProfile={selected ? () => {
              if (window.confirm(`Delete ${selected.name}?`)) props.onDeleteProfile(selected);
            } : undefined}
            onDeleteRule={(rule) => {
              if (window.confirm(`Delete rule for ${rule.appId}?`)) props.onDeleteRule(rule);
            }}
            onDuplicateProfile={selected ? () => duplicateProfile(selected) : undefined}
            onSaveProfile={() => props.onSaveProfile({ ...draft, updatedAt: new Date().toISOString() })}
            onSaveRule={props.onSaveRule}
            onSetActive={() => props.onSetActive(selected.id)}
          />
        ) : <p>Select or create a Profile.</p>}
      </div>
    </section>
  );
}
```

Define `ProfileList` and `ProfileEditor` in the same file. `ProfileList`
receives the filtered Profile array, query, selected id, complete App Rule
array, `onAdd()`, `onQueryChange(query)`, and `onSelect(profile)`. `ProfileEditor` receives the current `ProfileDraft`, active
state, foreground context, rules already filtered to the selected Profile, and
the eight callbacks shown at its call site; delete and duplicate are optional
for an unsaved new Profile. The editor renders the approved
fields, a native `<details>` for prompts, explicit Save/Set Active actions, and
the selected Profile's rule form and rows.

Use `profile.mode === "normal"` to hide Profile deletion. The `Advanced`
disclosure is a native `<details>` containing system prompt and user prompt
template. The rule form omits Profile selection because the selected Profile is
the destination.

- [ ] **Step 4: Refactor App persistence handlers to accept records**

Replace the draft-specific `saveProfile()` with:

```ts
async function saveProfile(profile: PromptProfile) {
  await upsertProfile({
    id: profile.id,
    name: profile.name,
    mode: profile.mode,
    system_prompt: profile.systemPrompt,
    user_prompt_template: profile.userPromptTemplate,
    target_language: profile.targetLanguage ?? null,
    enabled: profile.enabled,
    updated_at: profile.updatedAt,
    deleted_at: null,
  });
  setProfiles((current) => upsertById(current, profile));
  setConfig((current) => ({
    ...current,
    promptProfiles: upsertById(current.promptProfiles, profile),
  }));
  setMessage(`Profile saved: ${profile.name}`);
}

async function deleteProfile(profile: PromptProfile) {
  if (profile.mode === "normal") return;
  const deletedAt = new Date().toISOString();
  await upsertProfile({
    id: profile.id,
    name: profile.name,
    mode: profile.mode,
    system_prompt: profile.systemPrompt,
    user_prompt_template: profile.userPromptTemplate,
    target_language: profile.targetLanguage ?? null,
    enabled: false,
    updated_at: deletedAt,
    deleted_at: deletedAt,
  });
  setProfiles((current) => current.filter((item) => item.id !== profile.id));
}
```

Refactor `saveAppRule()` to accept an `AppProfileRule`. Add `deleteAppRule(rule)`
that calls `upsertAppProfileRule` with `enabled: false`, `deletedAt`, and
`updatedAt` set to the same current ISO timestamp, then removes it from local
state.

When deleting a non-Normal Profile, soft-delete its associated App Rules with
the existing `upsertAppProfileRule` command before removing the Profile from
local state. If the deleted Profile is active, persist `normal` as the active
Profile before removing it. Do not copy App Rules when duplicating a Profile.

In `App.tsx`, track Profile dirty state and route all primary navigation through
one guard:

```ts
const [profileDirty, setProfileDirty] = useState(false);

function navigate(section: AppSection) {
  if (
    activeSection === "profiles" &&
    section !== "profiles" &&
    profileDirty &&
    !window.confirm("Discard unsaved Profile changes?")
  ) {
    return;
  }
  setActiveSection(section);
}
```

Pass `onDirtyChange={setProfileDirty}` to `ProfilesPage`, use `navigate(item.id)`
for sidebar buttons, and add an App integration test proving Cancel keeps the
Profiles page active.

- [ ] **Step 5: Remove App Rules from primary navigation**

Set the final App section and nav list:

```ts
const navItems = [
  { id: "general", label: "General", icon: Gauge },
  { id: "profiles", label: "Profiles", icon: SlidersHorizontal },
  { id: "dictionary", label: "Dictionary", icon: BookMarked },
  { id: "settings", label: "Settings", icon: Settings },
] satisfies Array<{ id: AppSection; label: string; icon: typeof Settings }>;
```

Import `AppSection` from `src/domain/navigation.ts` and `Gauge` from the
existing Lucide dependency.

Delete the standalone App Rules render branch. Render `ProfilesPage` with the
new callbacks. Update App tests to assert exactly four navigation buttons and
move App Rule persistence tests through Profiles.

- [ ] **Step 6: Run Profile and App routing frontend tests**

Run: `npm test -- src/components/ProfilesPage.test.tsx src/App.test.tsx`

Expected: Profile CRUD, App Rule CRUD, routing request, and four-item navigation
tests pass.

- [ ] **Step 7: Commit Profiles**

```powershell
git add src/components/ProfilesPage.tsx src/components/ProfilesPage.test.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: merge App Rules into Profiles"
```

---

### Task 5: Make Dictionary List-First

**Files:**

- Create: `src/components/DictionaryPage.tsx`
- Create: `src/components/DictionaryPage.test.tsx`
- Modify: `src/App.tsx:248`
- Modify: `src/setupTests.ts`

**Interfaces:**

- Consumes: current Dictionary terms and App callbacks.
- Produces: `onSaveTerm(term)`, `onDeleteTerm(term)`, and
  `onToggleTerm(term, enabled)` calls.

- [ ] **Step 1: Add jsdom native-dialog support**

```ts
if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  }
}
```

- [ ] **Step 2: Write list, search, dialog, and duplicate tests**

```tsx
it("filters terms and opens one add dialog", async () => {
  const user = userEvent.setup();
  render(<DictionaryPage {...dictionaryProps} />);
  await user.type(screen.getByRole("searchbox", { name: "Search Dictionary" }), "agent");
  expect(screen.getByText("AI Agent Security")).toBeInTheDocument();
  expect(screen.queryByText("runtime monitoring")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Add Dictionary term" }));
  expect(screen.getByRole("dialog", { name: "Add Dictionary term" })).toBeInTheDocument();
});

it("rejects a duplicate spoken form without closing", async () => {
  const user = userEvent.setup();
  render(<DictionaryPage {...dictionaryProps} />);
  await user.click(screen.getByRole("button", { name: "Add Dictionary term" }));
  await user.type(screen.getByLabelText("Spoken phrase"), " Agent Security ");
  await user.type(screen.getByLabelText("Written phrase"), "Agent Security");
  await user.click(screen.getByRole("button", { name: "Save term" }));
  expect(screen.getByText("A term with this spoken phrase already exists.")).toBeInTheDocument();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the focused tests and verify failure**

Run: `npm test -- src/components/DictionaryPage.test.tsx`

Expected: FAIL because `DictionaryPage.tsx` does not exist.

- [ ] **Step 4: Implement search and the native add/edit dialog**

```tsx
function normalizeSpoken(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function matches(term: DictionaryTerm, query: string): boolean {
  const haystack = [term.spoken, term.written, ...term.aliases, ...term.tags]
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(query.trim().toLocaleLowerCase());
}

type DictionaryPageProps = {
  terms: DictionaryTerm[];
  onSaveTerm: (term: DictionaryTerm) => void;
  onDeleteTerm: (term: DictionaryTerm) => void;
  onToggleTerm: (term: DictionaryTerm, enabled: boolean) => void;
};

type DictionaryDialogState =
  | { mode: "new"; seed?: DictionaryTerm }
  | { mode: "edit"; term: DictionaryTerm }
  | null;

export function DictionaryPage(props: DictionaryPageProps) {
  const [query, setQuery] = useState("");
  const [dialogState, setDialogState] = useState<DictionaryDialogState>(null);
  const visible = props.terms.filter((term) => matches(term, query));

  return (
    <section className="module-panel dictionary-page" aria-labelledby="dictionary-title">
      <header className="page-heading">
        <div><h1 id="dictionary-title">Dictionary</h1><p>{props.terms.length} terms</p></div>
        <button aria-label="Add Dictionary term" onClick={() => setDialogState({ mode: "new" })} title="Add Dictionary term" type="button"><Plus size={17} /></button>
      </header>
      <input aria-label="Search Dictionary" onChange={(event) => setQuery(event.target.value)} role="searchbox" value={query} />
      <div className="dictionary-rows">
        {visible.map((term) => (
          <article className="dictionary-row" key={term.id}>
            <button aria-label={`Edit ${term.written}`} onClick={() => setDialogState({ mode: "edit", term })} type="button">
              <span>{term.spoken}</span><strong>{term.written}</strong>
            </button>
            <span>{[...term.aliases, ...term.tags].join(", ")}</span>
            <input aria-label={`Enable ${term.written}`} checked={term.enabled} onChange={(event) => props.onToggleTerm(term, event.target.checked)} type="checkbox" />
            <details className="row-menu">
              <summary aria-label={`More actions for ${term.written}`} title="More actions"><MoreHorizontal size={17} /></summary>
              <button onClick={() => setDialogState({ mode: "new", seed: term })} type="button">Duplicate</button>
              <button onClick={() => { if (window.confirm(`Delete ${term.written}?`)) props.onDeleteTerm(term); }} type="button">Delete</button>
            </details>
          </article>
        ))}
      </div>
      <DictionaryDialog state={dialogState} terms={props.terms} onClose={() => setDialogState(null)} onSave={props.onSaveTerm} />
    </section>
  );
}
```

Define `DictionaryDialog` in the same file with this contract:

```ts
type DictionaryDialogProps = {
  state: DictionaryDialogState;
  terms: DictionaryTerm[];
  onClose: () => void;
  onSave: (term: DictionaryTerm) => void;
};
```

It uses a `dialog` ref and `showModal()`/`close()` in an effect. It initializes
fields from the selected term, validates non-empty spoken and written forms,
rejects another term with the same normalized spoken form, and calls `onSave`
with arrays produced by the existing comma-separated `splitList` behavior.
Import `Plus` and `MoreHorizontal` from the existing Lucide dependency. For a
new or duplicated term, create `dict_${crypto.randomUUID()}`; editing preserves
the original id. After close, return focus to the add button or row action that
opened the dialog.

- [ ] **Step 5: Refactor Dictionary persistence handlers**

Change `saveDictionaryTerm` to accept a complete `DictionaryTerm` and map it to
the existing `DictionaryRecord`. Add delete and toggle handlers using the same
upsert command:

```ts
async function deleteDictionaryTerm(term: DictionaryTerm) {
  const deletedAt = new Date().toISOString();
  await upsertDictionaryTerm({
    id: term.id,
    spoken: term.spoken,
    written: term.written,
    aliases_json: JSON.stringify(term.aliases),
    tags_json: JSON.stringify(term.tags),
    enabled: false,
    updated_at: deletedAt,
    deleted_at: deletedAt,
  });
  setDictionaryTerms((current) => current.filter((item) => item.id !== term.id));
}
```

The toggle handler saves `{ ...term, enabled, updatedAt }` through the same
record mapping and updates local state with `upsertById`.

- [ ] **Step 6: Run Dictionary and App integration tests**

Run: `npm test -- src/components/DictionaryPage.test.tsx src/App.test.tsx`

Expected: component tests and migrated Dictionary persistence tests pass.

- [ ] **Step 7: Commit Dictionary**

```powershell
git add src/components/DictionaryPage.tsx src/components/DictionaryPage.test.tsx src/setupTests.ts src/App.tsx src/App.test.tsx
git commit -m "feat: make Dictionary list first"
```

---

### Task 6: Finish Styling, Responsive Behavior, And Handoff Docs

**Files:**

- Modify: `src/App.css`
- Modify: `src/App.css.test.ts`
- Modify: `README.md`
- Replace: `artifacts/gospeak-home.png`

**Interfaces:**

- Consumes: final component class names from Tasks 2-5.
- Produces: stable desktop and <=980px layouts with no overlapping controls.

- [ ] **Step 1: Write CSS contract tests before styling**

```ts
it("keeps the final primary navigation to stable desktop targets", () => {
  expect(css).toMatch(/\.nav-item\s*\{[^}]*min-height:\s*40px/s);
});

it("collapses the Profile split layout below the existing breakpoint", () => {
  expect(css).toMatch(
    /@media \(max-width: 980px\)[\s\S]*\.profile-split\s*\{[^}]*grid-template-columns:\s*1fr/s,
  );
});

it("gives Settings tabs a bounded non-shifting layout", () => {
  expect(css).toMatch(
    /\.settings-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s,
  );
});
```

- [ ] **Step 2: Run the CSS tests and verify failure**

Run: `npm test -- src/App.css.test.ts`

Expected: FAIL until the new layout selectors exist.

- [ ] **Step 3: Replace obsolete page styles with focused layouts**

Add these stable layout rules and style their child rows using the existing
color variables and shadows:

```css
.app-shell button {
  min-height: 40px;
}

.nav-item {
  min-height: 40px;
}

.page-heading,
.profile-split,
.summary-grid,
.settings-tabs,
.dictionary-row,
.activity-row {
  display: grid;
}

.page-heading {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 18px;
}

.summary-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.profile-split {
  grid-template-columns: minmax(210px, 0.34fr) minmax(0, 1fr);
  gap: 16px;
}

.settings-tabs {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.dictionary-row,
.activity-row {
  grid-template-columns: minmax(180px, 1.5fr) minmax(160px, 1fr) auto auto;
  align-items: center;
  gap: 12px;
}

dialog {
  width: min(520px, calc(100vw - 32px));
  border: 0;
  border-radius: 14px;
  padding: 20px;
}

dialog::backdrop {
  background: rgb(17 24 39 / 28%);
}

@media (max-width: 980px) {
  .profile-split,
  .summary-grid,
  .settings-tabs,
  .dictionary-row,
  .activity-row,
  .page-heading {
    grid-template-columns: 1fr;
  }
}
```

Delete selectors only when no final component uses them. Keep existing recorder,
form-control, focus-visible, and toggle styling unless a final screenshot proves
they conflict.

- [ ] **Step 4: Run automated frontend verification**

Run:

```powershell
npm test
npm run lint
npm run build
git diff --check
```

Expected: all tests pass, ESLint exits 0, Vite build exits 0, and diff check has
no output.

- [ ] **Step 5: Verify the real rendered flow in the in-app Browser**

Start the Vite server on an unused localhost port. At a 1280x720 desktop
viewport, capture and inspect:

1. General ready state and missing-provider warning state.
2. General recent activity with zero and multiple events.
3. Profiles list, selected editor, Advanced disclosure, and automatic rules.
4. Dictionary search, add dialog, duplicate error, and edit dialog.
5. Each Settings tab.

At the existing <=980px breakpoint, verify:

- Profile list appears before the editor.
- Settings tabs wrap or stack without clipped labels.
- Dictionary and recent-activity rows remain readable.
- No text overlaps buttons, switches, or adjacent sections.

Reject blank, loading, cropped, or partially painted screenshots. Check browser
console errors after completing the flow.

- [ ] **Step 6: Verify the Tauri desktop package**

Ensure no running `gospeak.exe` is locking the target, then run:

```powershell
npm run tauri -- build --debug
```

Expected: debug Tauri build exits 0 and produces the Windows debug bundle.

- [ ] **Step 7: Update the README screenshot**

Replace `artifacts/gospeak-home.png` with the accepted 1280x720 General
screenshot. Keep the existing README image reference and change the surrounding
scope text only if it still describes the removed seven-item shell.

- [ ] **Step 8: Run final verification after the screenshot/docs update**

Run:

```powershell
npm test
npm run lint
npm run build
git diff --check
git status --short
```

Expected: tests/lint/build pass, diff check has no output, and status lists only
the intended frontend, tests, README, and screenshot files.

- [ ] **Step 9: Commit the finished frontend redesign**

```powershell
git add src README.md artifacts/gospeak-home.png
git commit -m "feat: simplify Gospeak frontend navigation"
```

## Final Acceptance Checklist

- [ ] General is the home/status page and does not contain editable settings.
- [ ] The sidebar has exactly four destinations.
- [ ] General uses only existing privacy-safe usage fields.
- [ ] Profiles is two-pane and owns App Rules.
- [ ] Normal remains available as the undeletable fallback.
- [ ] Dictionary is searchable and list-first with one accessible native dialog.
- [ ] Settings has exactly four tabs and no nested sidebar.
- [ ] Provider cost is visible on General, not Providers.
- [ ] Import requires confirmation before the picker opens.
- [ ] Existing dictation and routing tests still pass.
- [ ] No package, Rust command, or database migration was added.
- [ ] Desktop and <=980px browser screenshots are accepted.
- [ ] The debug Tauri package builds successfully.
