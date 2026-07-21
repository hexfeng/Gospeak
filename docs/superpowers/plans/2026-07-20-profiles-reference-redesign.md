# Profiles Reference Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Profiles split editor with reference-aligned Profile cards, native Profile and App Rule dialogs, and a searchable App Rules table without changing persistence behavior.

**Architecture:** Keep all behavior in `ProfilesPage` and preserve its public props. Reuse the repository's `PageHeader`, `Card`, `Button`, native `dialog`, and Lucide patterns; add only file-local dialog components and page-specific CSS.

**Tech Stack:** React 19, TypeScript, native HTML dialog/table/form controls, lucide-react, Vitest, Testing Library, CSS.

## Global Constraints

- Do not change backend, database, routing, import/export, or Provider behavior.
- Do not add drag-to-reorder, application brand icons, dependencies, or generic UI abstractions.
- Keep Profile activation, duplication, deletion, dirty-state protection, App Rule toggling, and all existing callbacks.
- Normal remains undeletable by `id === "normal"`.
- Use the supplied desktop screenshot as the visual target and the existing General/Providers/Dictionary UI language as the component target.
- Write each behavior test first and observe the expected failure before implementation.

## File Map

- Modify `src/components/ProfilesPage.tsx`: card selection, summary, rule table, and file-local dialogs.
- Modify `src/components/ProfilesPage.test.tsx`: focused component behavior and dialog regressions.
- Modify `src/App.test.tsx`: only integration tests whose fields move into dialogs.
- Modify `src/App.css`: Profiles-only reference layout and responsive rules; remove obsolete split-editor selectors.
- Modify `src/App.css.test.ts`: replace the obsolete split-layout contract with card/table responsive contracts.
- Create `design-qa.md`: final reference comparison required by the Product Design workflow.

---

### Task 1: Profile Cards And Profile Dialog

**Files:**
- Modify: `src/components/ProfilesPage.test.tsx`
- Modify: `src/components/ProfilesPage.tsx`

**Interfaces:**
- Consumes: existing `ProfilesPageProps`, `ProfileDraft`, `toDraft()`, and `createProfileDraft()`.
- Produces: unchanged exported `ProfilesPage`; file-local `ProfileDialog`; selected Profile id shared with Task 2.

- [ ] **Step 1: Replace inline-editor assumptions with failing card/dialog tests**

Add or update these focused tests. Keep the existing Normal deletion, duplicate, dirty navigation, and callback assertions unless their interaction now needs to open the dialog first.

```tsx
it("opens a Profile card in an edit dialog and keeps its App Rules selected", async () => {
  const user = userEvent.setup();
  render(<ProfilesPage {...profileProps} activeProfileId="normal" />);

  await user.click(screen.getByRole("button", { name: "Email" }));

  expect(screen.getByRole("dialog", { name: "Edit Email Profile" })).toBeInTheDocument();
  expect(screen.getByLabelText("Profile name")).toHaveValue("Email");
  expect(screen.getByText("outlook.exe")).toBeInTheDocument();
  expect(screen.queryByText("code.exe")).not.toBeInTheDocument();
});

it("creates a Profile through the shared Profile dialog", async () => {
  const user = userEvent.setup();
  const onSaveProfile = vi.fn();
  render(<ProfilesPage {...profileProps} activeProfileId="normal" onSaveProfile={onSaveProfile} />);

  await user.click(screen.getByRole("button", { name: "New Profile" }));
  expect(screen.getByRole("dialog", { name: "New Profile" })).toBeInTheDocument();
  await user.type(screen.getByLabelText("Profile name"), "Meeting Notes");
  await user.click(screen.getByRole("button", { name: "Save Profile" }));

  expect(onSaveProfile).toHaveBeenCalledWith(expect.objectContaining({
    id: expect.stringMatching(/^profile_/),
    name: "Meeting Notes",
    mode: "normal",
    enabled: true,
  }));
  expect(screen.queryByRole("dialog", { name: "New Profile" })).not.toBeInTheDocument();
});

it("confirms before cancelling a dirty Profile dialog", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<ProfilesPage {...profileProps} activeProfileId="normal" />);

  await user.click(screen.getByRole("button", { name: "Email" }));
  await user.clear(screen.getByLabelText("Profile name"));
  await user.type(screen.getByLabelText("Profile name"), "Changed Email");
  await user.click(screen.getByRole("button", { name: "Cancel" }));

  expect(confirm).toHaveBeenCalledWith("Discard unsaved Profile changes?");
  expect(screen.getByRole("dialog", { name: "Edit Email Profile" })).toBeInTheDocument();
  confirm.mockRestore();
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm test -- src/components/ProfilesPage.test.tsx
```

Expected: FAIL because clicking a card does not open a dialog and the New Profile editor is still inline.

- [ ] **Step 3: Implement the minimum Profile card and dialog state**

In `ProfilesPage.tsx`, import the installed presentation tools and icons:

```tsx
import { useEffect, useRef, useState } from "react";
import { Check, Plus, SlidersHorizontal } from "lucide-react";
import { Button, Card, PageHeader } from "./ui";
```

Keep the existing Profile draft helpers. Replace the split-editor state with selection, query, dialog, and opener state:

```tsx
const initial = props.profiles.find((profile) => profile.id === props.activeProfileId) ?? props.profiles[0];
const [selectedId, setSelectedId] = useState(initial?.id ?? "");
const [draft, setDraft] = useState<ProfileDraft | null>(initial ? toDraft(initial) : null);
const [profileQuery, setProfileQuery] = useState("");
const [profileDialogOpen, setProfileDialogOpen] = useState(false);
const profileOpenerRef = useRef<HTMLElement | null>(null);
const selected = props.profiles.find((profile) => profile.id === selectedId);
const dirty = profileDialogOpen && draft !== null &&
  (selected === undefined || JSON.stringify(toDraft(selected)) !== JSON.stringify(draft));

useEffect(() => props.onDirtyChange(dirty), [dirty, props.onDirtyChange]);
useEffect(() => {
  if (!profileDialogOpen) profileOpenerRef.current?.focus();
}, [profileDialogOpen]);
```

Use these open/close helpers so card clicks select, open, and restore focus without a new abstraction:

```tsx
function openProfile(profile: PromptProfile, target: HTMLElement) {
  profileOpenerRef.current = target;
  setSelectedId(profile.id);
  setDraft(toDraft(profile));
  setProfileDialogOpen(true);
}

function newProfile(target: HTMLElement) {
  const next = createProfileDraft();
  profileOpenerRef.current = target;
  setSelectedId(next.id);
  setDraft(next);
  setProfileDialogOpen(true);
}

function closeProfileDialog() {
  if (dirty && !window.confirm("Discard unsaved Profile changes?")) return;
  setProfileDialogOpen(false);
  if (selected) setDraft(toDraft(selected));
}
```

Render the shared header, search, cards, and selected summary. Preserve exact card accessible names so existing callers can continue to find `Email`, `Normal`, and other Profiles:

```tsx
<PageHeader
  action={<Button onClick={(event) => newProfile(event.currentTarget)} type="button" variant="primary"><Plus size={16} /> New Profile</Button>}
  description="Writing behavior and automatic app switching."
  title="Profiles"
  titleId="profiles-title"
/>
<label className="profile-search">Search profiles<input onChange={(event) => setProfileQuery(event.target.value)} value={profileQuery} /></label>
<div className="profile-card-grid" aria-label="Profiles">
  {visibleProfiles.map((profile) => {
    const ruleCount = props.appRules.filter((rule) => rule.profileId === profile.id && !rule.deletedAt).length;
    const isSelected = profile.id === selectedId;
    return (
      <button aria-label={profile.name} aria-pressed={isSelected} className="profile-card" key={profile.id} onClick={(event) => openProfile(profile, event.currentTarget)} type="button">
        <span className="profile-card-heading"><strong>{profile.name}</strong>{isSelected ? <Check aria-hidden="true" size={16} /> : null}</span>
        <span>{profile.mode}</span>
        <span className="profile-card-status">{profile.enabled ? "Enabled" : "Disabled"} · {profile.id === props.activeProfileId ? "Active" : "Inactive"}</span>
        <small>{ruleCount} App Rule{ruleCount === 1 ? "" : "s"}</small>
      </button>
    );
  })}
</div>
{selected ? (
  <Card className="selected-profile-summary" aria-label="Selected Profile">
    <span className="selected-profile-icon"><SlidersHorizontal aria-hidden="true" size={20} /></span>
    <div><strong>{selected.name}</strong><p>{selected.id === props.activeProfileId ? "Active profile" : "Selected profile"}</p></div>
  </Card>
) : null}
```

Add a file-local `ProfileDialog` using the same native pattern as Providers and Dictionary. It owns only modal behavior; state and callbacks stay in `ProfilesPage`:

```tsx
function ProfileDialog(props: {
  draft: ProfileDraft;
  original?: PromptProfile;
  onCancel: () => void;
  onChange: (draft: ProfileDraft) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSave: () => void;
  onSetActive: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  const title = props.original ? `Edit ${props.original.name} Profile` : "New Profile";
  return (
    <dialog aria-label={title} onCancel={(event) => { event.preventDefault(); props.onCancel(); }} onClose={props.onCancel} ref={dialogRef}>
      <form onSubmit={(event) => { event.preventDefault(); props.onSave(); }}>
        <h2>{title}</h2>
        <div className="compact-form">
          <label>Profile name<input autoFocus onChange={(event) => props.onChange({ ...props.draft, name: event.target.value })} value={props.draft.name} /></label>
          <label>Profile mode<select onChange={(event) => props.onChange({ ...props.draft, mode: event.target.value as PromptProfile["mode"] })} value={props.draft.mode}><option value="normal">normal</option><option value="email">email</option><option value="prompt">prompt</option><option value="translate">translate</option></select></label>
          <label>Target language<input onChange={(event) => props.onChange({ ...props.draft, targetLanguage: event.target.value })} value={props.draft.targetLanguage ?? ""} /></label>
          <label className="checkbox-line"><span>Enabled</span><input aria-label="Enabled" checked={props.draft.enabled} onChange={(event) => props.onChange({ ...props.draft, enabled: event.target.checked })} type="checkbox" /></label>
        </div>
        <details><summary>Advanced</summary><div className="compact-form"><label className="wide-field">Profile system prompt<textarea onChange={(event) => props.onChange({ ...props.draft, systemPrompt: event.target.value })} value={props.draft.systemPrompt} /></label><label className="wide-field">User prompt template<textarea onChange={(event) => props.onChange({ ...props.draft, userPromptTemplate: event.target.value })} value={props.draft.userPromptTemplate} /></label></div></details>
        <div className="button-row">
          <Button disabled={!props.draft.name.trim() || !props.draft.systemPrompt.trim()} type="submit" variant="primary">Save Profile</Button>
          {props.original ? <Button onClick={props.onSetActive} type="button">Set Active</Button> : null}
          {props.original ? <Button onClick={props.onDuplicate} type="button">Duplicate {props.original.name}</Button> : null}
          {props.original && props.original.id !== "normal" ? <Button onClick={props.onDelete} type="button" variant="danger">Delete {props.original.name}</Button> : null}
          <Button onClick={props.onCancel} type="button">Cancel</Button>
        </div>
      </form>
    </dialog>
  );
}
```

Wire `saveProfile`, duplicate, delete, and activation to the unchanged props. On successful local dispatch, close the modal and keep the saved/duplicated Profile id selected.

- [ ] **Step 4: Run Profile tests and verify GREEN**

Run:

```powershell
npm test -- src/components/ProfilesPage.test.tsx
```

Expected: all Profile card, dialog, deletion, duplication, dirty-state, and existing rule tests pass.

- [ ] **Step 5: Commit the Profile interaction slice**

```powershell
git add -- src/components/ProfilesPage.tsx src/components/ProfilesPage.test.tsx
git commit -m "feat: edit profiles in dialogs"
```

---

### Task 2: App Rules Table And Rule Dialog

**Files:**
- Modify: `src/components/ProfilesPage.test.tsx`
- Modify: `src/components/ProfilesPage.tsx`

**Interfaces:**
- Consumes: selected Profile id from Task 1 and existing `RuleDraft`, `onSaveRule`, `onDeleteRule` callbacks.
- Produces: searchable semantic App Rules table and file-local `RuleDialog` with unchanged rule records.

- [ ] **Step 1: Add failing Rule table/dialog tests**

```tsx
it("opens Add Rule in a dialog and saves it for the selected Profile", async () => {
  const user = userEvent.setup();
  const onSaveRule = vi.fn();
  render(<ProfilesPage {...profileProps} activeProfileId="email" onSaveRule={onSaveRule} />);

  await user.click(screen.getByRole("button", { name: "Add Rule" }));
  expect(screen.getByRole("dialog", { name: "Add App Rule" })).toBeInTheDocument();
  await user.type(screen.getByLabelText("App id"), "teams.exe");
  await user.click(screen.getByRole("button", { name: "Save App Rule" }));

  expect(onSaveRule).toHaveBeenCalledWith(expect.objectContaining({
    appId: "teams.exe",
    profileId: "email",
    enabled: true,
    deletedAt: null,
  }));
});

it("edits an existing App Rule without changing its id", async () => {
  const user = userEvent.setup();
  const onSaveRule = vi.fn();
  render(<ProfilesPage {...profileProps} activeProfileId="email" onSaveRule={onSaveRule} />);

  await user.click(screen.getByRole("button", { name: "Edit rule for outlook.exe" }));
  expect(screen.getByRole("dialog", { name: "Edit App Rule" })).toBeInTheDocument();
  await user.type(screen.getByLabelText("Title contains"), "Inbox");
  await user.click(screen.getByRole("button", { name: "Save App Rule" }));

  expect(onSaveRule).toHaveBeenCalledWith(expect.objectContaining({ id: "rule_outlook", windowTitlePattern: "Inbox" }));
});

it("searches App Rules by app id and window title", async () => {
  const user = userEvent.setup();
  render(<ProfilesPage {...profileProps} activeProfileId="email" appRules={[...rules, { ...rules[0], id: "rule_teams", appId: "teams.exe", windowTitlePattern: "Meeting" }]} />);

  await user.type(screen.getByRole("searchbox", { name: "Search App Rules" }), "meeting");
  expect(screen.getByText("teams.exe")).toBeInTheDocument();
  expect(screen.queryByText("outlook.exe")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- src/components/ProfilesPage.test.tsx
```

Expected: FAIL because Add/Edit still expose the inline rule form and there is no rule searchbox/table.

- [ ] **Step 3: Implement rule query, dialog state, and table**

Add `Pencil`, `Search`, and `Trash2` to the Lucide import. Replace the inline form/list with:

```tsx
<Card className="profile-rules-card" aria-labelledby="app-rules-title">
  <header className="profile-rules-header">
    <div><h2 id="app-rules-title">App Rules</h2><p>{selected ? `Automatic switching for ${selected.name}` : "Select a Profile"}</p></div>
    <Button disabled={!selected} onClick={(event) => openNewRule(event.currentTarget)} type="button" variant="primary"><Plus size={16} /> Add Rule</Button>
  </header>
  <section aria-label="Current app preview" className="app-context-preview"><span>{props.foregroundContext?.appId || "No app detected"}</span><span>{props.foregroundContext?.windowTitle || "No window title"}</span></section>
  <label className="rule-search"><Search aria-hidden="true" size={16} /><span className="sr-only">Search App Rules</span><input aria-label="Search App Rules" onChange={(event) => setRuleQuery(event.target.value)} placeholder="Search rules..." type="search" value={ruleQuery} /></label>
  {visibleRules.length ? (
    <div className="profile-rule-table-wrap"><table className="profile-rule-table"><thead><tr><th>App</th><th>Window title</th><th>Priority</th><th>Enabled</th><th>Actions</th></tr></thead><tbody>{visibleRules.map((rule) => <tr key={rule.id}><td><strong>{rule.appId}</strong></td><td>{rule.windowTitlePattern || "Any title"}</td><td>{rule.priority}</td><td><input aria-label={`Enable rule for ${rule.appId}`} checked={rule.enabled} onChange={() => toggleRule(rule)} type="checkbox" /></td><td><div className="profile-rule-actions"><Button aria-label={`Edit rule for ${rule.appId}`} onClick={(event) => openEditRule(rule, event.currentTarget)} type="button"><Pencil aria-hidden="true" size={15} /></Button><Button aria-label={`Delete rule for ${rule.appId}`} onClick={() => window.confirm(`Delete rule for ${rule.appId}?`) && props.onDeleteRule(rule)} type="button" variant="danger"><Trash2 aria-hidden="true" size={15} /></Button></div></td></tr>)}</tbody></table></div>
  ) : <p className="empty-note">No App Rules for this Profile.</p>}
</Card>
```

Use `ruleDialogOpen`, `ruleQuery`, and a rule opener ref in the parent. Filter case-insensitively by both fields:

```tsx
const normalizedRuleQuery = ruleQuery.trim().toLocaleLowerCase();
const visibleRules = rules.filter((rule) =>
  !normalizedRuleQuery || rule.appId.toLocaleLowerCase().includes(normalizedRuleQuery) ||
  (rule.windowTitlePattern ?? "").toLocaleLowerCase().includes(normalizedRuleQuery),
);
```

Add file-local `RuleDialog` with the Providers/Dictionary native dialog pattern:

```tsx
function RuleDialog(props: { draft: RuleDraft; editing: boolean; onCancel: () => void; onChange: (draft: RuleDraft) => void; onSave: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = dialogRef.current; if (dialog && !dialog.open) dialog.showModal(); }, []);
  const title = props.editing ? "Edit App Rule" : "Add App Rule";
  return (
    <dialog aria-label={title} onClose={props.onCancel} ref={dialogRef}>
      <form onSubmit={(event) => { event.preventDefault(); props.onSave(); }}>
        <h2>{title}</h2>
        <label>App id<input autoFocus onChange={(event) => props.onChange({ ...props.draft, appId: event.target.value })} placeholder="chrome.exe" value={props.draft.appId} /></label>
        <label>Title contains<input onChange={(event) => props.onChange({ ...props.draft, windowTitlePattern: event.target.value })} placeholder="ChatGPT" value={props.draft.windowTitlePattern} /></label>
        <label>Priority<input onChange={(event) => props.onChange({ ...props.draft, priority: Number(event.target.value) })} type="number" value={props.draft.priority} /></label>
        <label className="checkbox-line"><span>Enabled</span><input checked={props.draft.enabled} onChange={(event) => props.onChange({ ...props.draft, enabled: event.target.checked })} type="checkbox" /></label>
        <div className="button-row"><Button disabled={!props.draft.appId.trim()} type="submit" variant="primary">Save App Rule</Button><Button onClick={props.onCancel} type="button">Cancel</Button></div>
      </form>
    </dialog>
  );
}
```

After `saveRule()`, close the dialog, clear the draft, and restore focus. Do not add rule dirty-state confirmation because the existing page does not protect an unfinished rule form.

- [ ] **Step 4: Run focused tests and verify GREEN**

```powershell
npm test -- src/components/ProfilesPage.test.tsx
```

Expected: all Profile and rule tests pass with no React warnings.

- [ ] **Step 5: Commit the App Rules slice**

```powershell
git add -- src/components/ProfilesPage.tsx src/components/ProfilesPage.test.tsx
git commit -m "feat: manage app rules in a table"
```

---

### Task 3: Reference Styling And App Integration Updates

**Files:**
- Modify: `src/App.css.test.ts`
- Modify: `src/App.css`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: class names and dialog labels from Tasks 1-2.
- Produces: desktop four-card layout, responsive card/table behavior, and integration tests that enter dialogs before editing.

- [ ] **Step 1: Write failing CSS contracts**

Replace the obsolete `.profile-split` assertion and extend the secondary-page contract:

```ts
it("uses the approved responsive Profile card and rule table layout", () => {
  expect(css).toMatch(/\.profile-card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s);
  expect(css).toMatch(/\.profile-card\[aria-pressed="true"\]\s*\{[^}]*border-color:\s*#3b82f6/s);
  expect(css).toMatch(/\.profile-rule-table\s*\{[^}]*width:\s*100%/s);
  expect(css).toMatch(/@media \(max-width: 1100px\)[\s\S]*\.profile-card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  expect(css).toMatch(/@media \(max-width: 560px\)[\s\S]*\.profile-card-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
});
```

- [ ] **Step 2: Run the CSS contract and verify RED**

```powershell
npm test -- src/App.css.test.ts
```

Expected: FAIL because the old split layout is still styled and the new class contracts are absent.

- [ ] **Step 3: Replace obsolete Profile CSS with the reference layout**

Remove `.profile-split`, old `.profile-list`, `.profile-item`, `.rule-list`, and `.rule-item` rules that are no longer used. Add the minimum page-specific rules:

```css
.profile-search,
.rule-search {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #667085;
  font-size: 12px;
}

.profile-search {
  width: min(260px, 100%);
  margin-bottom: 14px;
}

.profile-card-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.profile-card {
  display: grid;
  min-width: 0;
  min-height: 138px;
  align-content: start;
  gap: 8px;
  padding: 18px;
  border: 1px solid #e4e9f1;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 10px 28px rgb(15 23 42 / 4%);
  text-align: left;
}

.profile-card[aria-pressed="true"] {
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px rgb(59 130 246 / 12%);
}

.profile-card-heading,
.profile-rules-header,
.profile-rule-actions,
.selected-profile-summary {
  display: flex;
  align-items: center;
}

.profile-card-heading,
.profile-rules-header {
  justify-content: space-between;
  gap: 12px;
}

.profile-card > span,
.profile-card > small {
  color: #667085;
  font-size: 12px;
}

.profile-card strong {
  color: #0f172a;
  font-size: 16px;
}

.selected-profile-summary {
  gap: 14px;
  margin-top: 18px;
  padding: 16px 18px;
}

.selected-profile-icon {
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #eff6ff;
  color: #2563eb;
}

.selected-profile-summary p,
.profile-rules-header p {
  margin: 4px 0 0;
  color: #667085;
  font-size: 13px;
}

.profile-rules-card {
  margin-top: 18px;
  padding: 20px;
}

.rule-search {
  width: min(260px, 100%);
  margin: 14px 0 12px;
}

.profile-rule-table-wrap {
  overflow-x: auto;
  border: 1px solid #e4e9f1;
  border-radius: 14px;
}

.profile-rule-table {
  width: 100%;
  border-collapse: collapse;
}

.profile-rule-table th,
.profile-rule-table td {
  padding: 12px 14px;
  border-bottom: 1px solid #edf0f5;
  color: #475467;
  font-size: 13px;
  text-align: left;
}

.profile-rule-table th {
  background: #f8fafc;
  color: #667085;
  font-weight: 500;
}

.profile-rule-actions { gap: 8px; }
.profile-rule-actions .ui-button { min-width: 40px; padding: 0; }

@media (max-width: 1100px) {
  .profile-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 560px) {
  .profile-card-grid { grid-template-columns: 1fr; }
  .profile-rules-header { align-items: stretch; flex-direction: column; }
  .profile-rule-table,
  .profile-rule-table tbody,
  .profile-rule-table tr,
  .profile-rule-table td { display: block; }
  .profile-rule-table thead { display: none; }
  .profile-rule-table tr { padding: 10px 12px; border-bottom: 1px solid #edf0f5; }
  .profile-rule-table td { padding: 6px 0; border: 0; }
}
```

Keep the shared `dialog`, form control, focus, and button rules unchanged.

- [ ] **Step 4: Update only directly affected App integration tests**

For tests that currently expect rule fields immediately, click `Add Rule` first:

```tsx
await user.click(screen.getByRole("button", { name: "Add Rule" }));
await user.type(screen.getByLabelText(/App id/i), "chrome.exe");
```

For tests that edit a Profile field or trigger Profile actions, click its card first:

```tsx
await user.click(screen.getByRole("button", { name: "Normal" }));
await user.clear(screen.getByLabelText("Profile name"));
```

Use `within(screen.getByRole("dialog"))` only if a duplicated accessible label becomes ambiguous. Do not change persistence expectations.

- [ ] **Step 5: Run component, integration, and CSS tests**

```powershell
npm test -- src/components/ProfilesPage.test.tsx src/App.test.tsx src/App.css.test.ts
```

Expected: all targeted tests pass; App persistence mocks receive the same Profile and App Rule records as before.

- [ ] **Step 6: Commit layout and integration updates**

```powershell
git add -- src/App.css src/App.css.test.ts src/App.test.tsx
git commit -m "style: align profiles with reference layout"
```

---

### Task 4: Full Verification, Visual QA, And Adversarial Review

**Files:**
- Create: `design-qa.md`
- Modify: only files from Tasks 1-3 if verification finds a scoped defect.

**Interfaces:**
- Consumes: completed reference implementation and supplied screenshot.
- Produces: fresh automated evidence plus `design-qa.md` with `final result: passed`.

- [ ] **Step 1: Run the full frontend verification set**

```powershell
npm test
npm run lint
npm run build
git diff --check
```

Expected: every command exits `0`, no tests fail, lint reports no errors, and Vite produces `dist` successfully.

- [ ] **Step 2: Run the app and inspect the core interaction path**

Use the Product Design browser choice rule for Codex Desktop: load the in-app Browser skill, select the in-app browser surface, run the Vite app, and inspect Profiles at the reference desktop width. Verify:

1. Default cards and selected state match the screenshot hierarchy.
2. Profile card click opens the correct dialog; Save, Cancel, Escape, Set Active, Duplicate, and Delete behave correctly.
3. Add/Edit App Rule dialogs save the expected fields; toggle and delete still work.
4. Profile and rule searches filter without changing persisted data.
5. Browser console has no errors or React warnings.

- [ ] **Step 3: Compare desktop, medium, and narrow captures**

Capture the same default state at the supplied reference width, approximately `900px`, and `390px`. Open the reference and implementation captures together. Fix P0-P2 differences in spacing, typography, borders, radii, clipping, overflow, focus, or control usability. Do not loop on P3 polish.

- [ ] **Step 4: Write the blocking design QA result**

Create `design-qa.md` with this exact structure and fill it from the visual comparison:

```markdown
# Profiles Design QA

## Source

- Reference: `C:/Users/PC/Downloads/ChatGPT Image Jul 20, 2026, 09_13_38 PM.png`
- Implementation: local Profiles page at matching desktop, medium, and narrow widths.

## Interaction Checks

- Profile create/edit dialog: passed
- Dirty Profile cancellation and focus return: passed
- App Rule create/edit/toggle/delete: passed
- Profile and rule filtering: passed
- Console errors: none

## Visual Comparison

- P0: none
- P1: none
- P2: none
- P3: application-specific brand icons and drag reorder intentionally omitted by scope

final result: passed
```

- [ ] **Step 5: Perform the required adversarial review**

Attack the implementation on these five likely failure points and fix any confirmed issue:

1. New Profile is considered dirty immediately but can still be cancelled safely.
2. Saving or duplicating does not leave App navigation permanently dirty.
3. Normal cannot be deleted after changing its editable mode.
4. Rule edits preserve ids and always use the selected Profile id.
5. Native dialog close/Escape cannot bypass dirty confirmation or invoke close twice.

Re-run the smallest relevant failing check after each fix, then repeat Step 1 in full.

- [ ] **Step 6: Commit QA evidence and any scoped fixes**

```powershell
git add -- design-qa.md src/components/ProfilesPage.tsx src/components/ProfilesPage.test.tsx src/App.tsx src/App.test.tsx src/App.css src/App.css.test.ts
git commit -m "test: verify profiles reference redesign"
```
