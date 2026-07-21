import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import type {
  AppProfileRule,
  ForegroundAppContext,
  PromptProfile,
} from "../domain/config";
import { Button, Card, PageHeader } from "./ui";

type ProfileDraft = Pick<
  PromptProfile,
  | "id"
  | "name"
  | "mode"
  | "systemPrompt"
  | "userPromptTemplate"
  | "targetLanguage"
  | "enabled"
>;

type ProfilesPageProps = {
  profiles: PromptProfile[];
  appRules: AppProfileRule[];
  activeProfileId: string;
  foregroundContext: ForegroundAppContext | null;
  onSaveProfile: (profile: PromptProfile) => Promise<void>;
  onDeleteProfile: (profile: PromptProfile) => Promise<void>;
  onSaveRule: (rule: AppProfileRule) => Promise<void>;
  onDeleteRule: (rule: AppProfileRule) => Promise<void>;
  onSetActive: (profileId: string) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
};

type RuleDraft = {
  id?: string;
  appId: string;
  windowTitlePattern: string;
  priority: number;
  enabled: boolean;
};

const emptyRuleDraft: RuleDraft = {
  appId: "",
  windowTitlePattern: "",
  priority: 0,
  enabled: true,
};

function toDraft(profile: PromptProfile): ProfileDraft {
  const { id, name, mode, systemPrompt, userPromptTemplate, targetLanguage, enabled } = profile;
  return { id, name, mode, systemPrompt, userPromptTemplate, targetLanguage, enabled };
}

function createProfileDraft(): ProfileDraft {
  return {
    id: `profile_${crypto.randomUUID()}`,
    name: "",
    mode: "normal",
    systemPrompt: "Clean the transcript into natural written text without adding facts.",
    userPromptTemplate: "Transcript:\n{{transcript}}\n\nDictionary terms:\n{{dictionaryTerms}}",
    targetLanguage: undefined,
    enabled: true,
  };
}

export function ProfilesPage(props: ProfilesPageProps) {
  const { onDirtyChange } = props;
  const initial = props.profiles.find((profile) => profile.id === props.activeProfileId) ?? props.profiles[0];
  const [selectedId, setSelectedId] = useState(initial?.id ?? "");
  const [draft, setDraft] = useState<ProfileDraft | null>(initial ? toDraft(initial) : null);
  const [profileQuery, setProfileQuery] = useState("");
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profilePending, setProfilePending] = useState(false);
  const [ruleDraft, setRuleDraft] = useState(emptyRuleDraft);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleError, setRuleError] = useState("");
  const [rulePending, setRulePending] = useState(false);
  const [ruleMutationPending, setRuleMutationPending] = useState(false);
  const [rulePageError, setRulePageError] = useState("");
  const [ruleQuery, setRuleQuery] = useState("");
  const profileOpenerRef = useRef<HTMLElement | null>(null);
  const ruleOpenerRef = useRef<HTMLElement | null>(null);
  const selected = props.profiles.find((profile) => profile.id === selectedId);
  const dirty = profileDialogOpen && draft !== null &&
    (selected === undefined || JSON.stringify(toDraft(selected)) !== JSON.stringify(draft));
  const rules = props.appRules.filter((rule) => rule.profileId === selectedId && !rule.deletedAt);
  const normalizedRuleQuery = ruleQuery.trim().toLocaleLowerCase();
  const visibleRules = rules.filter((rule) =>
    !normalizedRuleQuery || rule.appId.toLocaleLowerCase().includes(normalizedRuleQuery) ||
    (rule.windowTitlePattern ?? "").toLocaleLowerCase().includes(normalizedRuleQuery),
  );
  const visibleProfiles = props.profiles.filter((profile) =>
    profile.name.toLocaleLowerCase().includes(profileQuery.toLocaleLowerCase()),
  );

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    if (!profileDialogOpen) profileOpenerRef.current?.focus();
  }, [profileDialogOpen]);
  useEffect(() => {
    if (!ruleDialogOpen) ruleOpenerRef.current?.focus();
  }, [ruleDialogOpen]);

  function openProfile(profile: PromptProfile, target: HTMLElement) {
    profileOpenerRef.current = target;
    setSelectedId(profile.id);
    setDraft(toDraft(profile));
    setRuleDraft(emptyRuleDraft);
    setProfileError("");
    setProfilePending(false);
    setProfileDialogOpen(true);
  }

  function newProfile(target: HTMLElement) {
    const next = createProfileDraft();
    profileOpenerRef.current = target;
    setSelectedId(next.id);
    setDraft(next);
    setRuleDraft(emptyRuleDraft);
    setProfileError("");
    setProfilePending(false);
    setProfileDialogOpen(true);
  }

  function closeProfileDialog() {
    if (profilePending) return;
    if (dirty && !window.confirm("Discard unsaved Profile changes?")) return;
    setProfileDialogOpen(false);
    setProfileError("");
    const fallback = selected ??
      props.profiles.find((profile) => profile.id === props.activeProfileId) ??
      props.profiles[0];
    if (fallback) {
      setSelectedId(fallback.id);
      setDraft(toDraft(fallback));
    }
  }

  async function saveProfile() {
    if (profilePending || !draft || !draft.name.trim() || !draft.systemPrompt.trim()) return;
    const profile = {
      ...draft,
      name: draft.name.trim(),
      systemPrompt: draft.systemPrompt.trim(),
      targetLanguage: draft.targetLanguage?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    setProfileError("");
    setProfilePending(true);
    try {
      await props.onSaveProfile(profile);
      setSelectedId(profile.id);
      setDraft(toDraft(profile));
      setProfileDialogOpen(false);
    } catch {
      setProfileError("Couldn't save Profile. Try again.");
    } finally {
      setProfilePending(false);
    }
  }

  async function duplicateProfile(profile: PromptProfile) {
    if (profilePending || (dirty && !window.confirm("Discard unsaved Profile changes?"))) return;
    const copy = {
      ...profile,
      id: `profile_${crypto.randomUUID()}`,
      name: `${profile.name} Copy`,
      updatedAt: new Date().toISOString(),
    };
    setProfileError("");
    setProfilePending(true);
    try {
      await props.onSaveProfile(copy);
      setSelectedId(copy.id);
      setDraft(toDraft(copy));
      setRuleDraft(emptyRuleDraft);
      setProfileDialogOpen(false);
    } catch {
      setProfileError("Couldn't duplicate Profile. Try again.");
    } finally {
      setProfilePending(false);
    }
  }

  async function setActiveProfile(profile: PromptProfile) {
    if (profilePending) return;
    setProfileError("");
    setProfilePending(true);
    try {
      await props.onSetActive(profile.id);
    } catch {
      setProfileError("Couldn't set active Profile. Try again.");
    } finally {
      setProfilePending(false);
    }
  }

  async function deleteProfile(profile: PromptProfile) {
    if (profilePending || profile.id === "normal" || !window.confirm(`Delete ${profile.name}?`)) return;
    setProfileError("");
    setProfilePending(true);
    try {
      await props.onDeleteProfile(profile);
      const fallback =
        props.profiles.find((item) => item.id === "normal" && item.id !== profile.id) ??
        props.profiles.find((item) => item.id !== profile.id);
      if (fallback) {
        setSelectedId(fallback.id);
        setDraft(toDraft(fallback));
      } else {
        setSelectedId("");
        setDraft(null);
      }
      setRuleDraft(emptyRuleDraft);
      setProfileDialogOpen(false);
    } catch {
      setProfileError("Couldn't delete Profile. Try again.");
    } finally {
      setProfilePending(false);
    }
  }

  async function saveRule() {
    if (rulePending || !selected || !ruleDraft.appId.trim()) return;
    const rule = {
      id: ruleDraft.id ?? `rule_${crypto.randomUUID()}`,
      appId: ruleDraft.appId.trim(),
      windowTitlePattern: ruleDraft.windowTitlePattern.trim() || null,
      profileId: selected.id,
      priority: ruleDraft.priority,
      enabled: ruleDraft.enabled,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    setRuleError("");
    setRulePending(true);
    try {
      await props.onSaveRule(rule);
      setRuleDraft(emptyRuleDraft);
      setRuleDialogOpen(false);
    } catch {
      setRuleError("Couldn't save App Rule. Try again.");
    } finally {
      setRulePending(false);
    }
  }

  function openNewRule(target: HTMLElement) {
    ruleOpenerRef.current = target;
    setRuleDraft(emptyRuleDraft);
    setRuleError("");
    setRulePageError("");
    setRuleDialogOpen(true);
  }

  function openEditRule(rule: AppProfileRule, target: HTMLElement) {
    ruleOpenerRef.current = target;
    setRuleDraft({
      id: rule.id,
      appId: rule.appId,
      windowTitlePattern: rule.windowTitlePattern ?? "",
      priority: rule.priority,
      enabled: rule.enabled,
    });
    setRuleError("");
    setRulePageError("");
    setRuleDialogOpen(true);
  }

  function closeRuleDialog() {
    if (rulePending) return;
    setRuleDialogOpen(false);
    setRuleDraft(emptyRuleDraft);
    setRuleError("");
  }

  async function toggleRule(rule: AppProfileRule) {
    if (ruleMutationPending) return;
    setRulePageError("");
    setRuleMutationPending(true);
    try {
      await props.onSaveRule({
        ...rule,
        enabled: !rule.enabled,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      setRulePageError("Couldn't update App Rule. Try again.");
    } finally {
      setRuleMutationPending(false);
    }
  }

  async function deleteRule(rule: AppProfileRule) {
    if (ruleMutationPending || !window.confirm(`Delete rule for ${rule.appId}?`)) return;
    setRulePageError("");
    setRuleMutationPending(true);
    try {
      await props.onDeleteRule(rule);
    } catch {
      setRulePageError("Couldn't delete App Rule. Try again.");
    } finally {
      setRuleMutationPending(false);
    }
  }

  return (
    <section className="panel module-panel profiles-page" aria-labelledby="profiles-title">
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
      {profileDialogOpen && draft ? (
        <ProfileDialog
          draft={draft}
          error={profileError}
          pending={profilePending}
          onCancel={closeProfileDialog}
          onChange={setDraft}
          onDelete={async () => { if (selected) await deleteProfile(selected); }}
          onDuplicate={async () => { if (selected) await duplicateProfile(selected); }}
          onSave={saveProfile}
          onSetActive={async () => { if (selected) await setActiveProfile(selected); }}
          original={selected}
        />
      ) : null}
      <Card className="profile-rules-card" aria-labelledby="app-rules-title">
        <header className="profile-rules-header">
          <div><h2 id="app-rules-title">App Rules</h2><p>{selected ? `Automatic switching for ${selected.name}` : "Select a Profile"}</p></div>
          <Button disabled={!selected} onClick={(event) => openNewRule(event.currentTarget)} type="button" variant="primary"><Plus size={16} /> Add Rule</Button>
        </header>
        <section aria-label="Current app preview" className="app-context-preview"><span>{props.foregroundContext?.appId || "No app detected"}</span><span>{props.foregroundContext?.windowTitle || "No window title"}</span></section>
        <label className="rule-search"><Search aria-hidden="true" size={16} /><span className="sr-only">Search App Rules</span><input aria-label="Search App Rules" onChange={(event) => setRuleQuery(event.target.value)} placeholder="Search rules..." type="search" value={ruleQuery} /></label>
        {rulePageError ? <p role="alert">{rulePageError}</p> : null}
        {visibleRules.length ? (
          <div className="profile-rule-table-wrap">
            <table className="profile-rule-table">
              <thead><tr><th>App</th><th>Window title</th><th>Priority</th><th>Enabled</th><th>Actions</th></tr></thead>
              <tbody>{visibleRules.map((rule) => {
                const ruleLabel = `${rule.appId}, ${rule.windowTitlePattern ? `title ${rule.windowTitlePattern}` : "any title"}, priority ${rule.priority}`;
                return (
                  <tr key={rule.id}>
                    <td data-label="App"><strong>{rule.appId}</strong></td>
                    <td data-label="Window title">{rule.windowTitlePattern || "Any title"}</td>
                    <td data-label="Priority">{rule.priority}</td>
                    <td data-label="Enabled"><input aria-label={`Enable rule for ${ruleLabel}`} checked={rule.enabled} disabled={ruleMutationPending} onChange={() => void toggleRule(rule)} type="checkbox" /></td>
                    <td data-label="Actions"><div className="profile-rule-actions"><Button aria-label={`Edit rule for ${ruleLabel}`} disabled={ruleMutationPending} onClick={(event) => openEditRule(rule, event.currentTarget)} type="button"><Pencil aria-hidden="true" size={15} /></Button><Button aria-label={`Delete rule for ${ruleLabel}`} disabled={ruleMutationPending} onClick={() => void deleteRule(rule)} type="button" variant="danger"><Trash2 aria-hidden="true" size={15} /></Button></div></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : <p className="empty-note">No App Rules for this Profile.</p>}
      </Card>
      {ruleDialogOpen ? <RuleDialog draft={ruleDraft} editing={Boolean(ruleDraft.id)} error={ruleError} pending={rulePending} onCancel={closeRuleDialog} onChange={setRuleDraft} onSave={saveRule} /> : null}
    </section>
  );
}

function RuleDialog(props: {
  draft: RuleDraft;
  editing: boolean;
  error: string;
  pending: boolean;
  onCancel: () => void;
  onChange: (draft: RuleDraft) => void;
  onSave: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  const title = props.editing ? "Edit App Rule" : "Add App Rule";

  return (
    <dialog aria-label={title} onCancel={(event) => { event.preventDefault(); props.onCancel(); }} onClose={props.onCancel} ref={dialogRef}>
      <form onSubmit={(event) => { event.preventDefault(); void props.onSave(); }}>
        <h2>{title}</h2>
        <label>App id<input autoFocus disabled={props.pending} onChange={(event) => props.onChange({ ...props.draft, appId: event.target.value })} placeholder="chrome.exe" value={props.draft.appId} /></label>
        <label>Title contains<input disabled={props.pending} onChange={(event) => props.onChange({ ...props.draft, windowTitlePattern: event.target.value })} placeholder="ChatGPT" value={props.draft.windowTitlePattern} /></label>
        <label>Priority<input disabled={props.pending} onChange={(event) => props.onChange({ ...props.draft, priority: Number(event.target.value) })} type="number" value={props.draft.priority} /></label>
        <label className="checkbox-line"><span>Enabled</span><input checked={props.draft.enabled} disabled={props.pending} onChange={(event) => props.onChange({ ...props.draft, enabled: event.target.checked })} type="checkbox" /></label>
        {props.error ? <p role="alert">{props.error}</p> : null}
        <div className="button-row"><Button disabled={props.pending || !props.draft.appId.trim()} type="submit" variant="primary">Save App Rule</Button><Button disabled={props.pending} onClick={props.onCancel} type="button">Cancel</Button></div>
      </form>
    </dialog>
  );
}

function ProfileDialog(props: {
  draft: ProfileDraft;
  error: string;
  pending: boolean;
  original?: PromptProfile;
  onCancel: () => void;
  onChange: (draft: ProfileDraft) => void;
  onDelete: () => Promise<void>;
  onDuplicate: () => Promise<void>;
  onSave: () => Promise<void>;
  onSetActive: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  const title = props.original ? `Edit ${props.original.name} Profile` : "New Profile";

  return (
    <dialog aria-label={title} className="profile-dialog" onCancel={(event) => { event.preventDefault(); props.onCancel(); }} onClose={props.onCancel} ref={dialogRef}>
      <form onSubmit={(event) => { event.preventDefault(); void props.onSave(); }}>
        <h2>{title}</h2>
        <div className="compact-form">
          <label>Profile name<input autoFocus disabled={props.pending} onChange={(event) => props.onChange({ ...props.draft, name: event.target.value })} value={props.draft.name} /></label>
          <label>Profile mode<select disabled={props.pending} onChange={(event) => props.onChange({ ...props.draft, mode: event.target.value as PromptProfile["mode"] })} value={props.draft.mode}><option value="normal">normal</option><option value="email">email</option><option value="prompt">prompt</option><option value="translate">translate</option></select></label>
          <label>Target language<input disabled={props.pending} onChange={(event) => props.onChange({ ...props.draft, targetLanguage: event.target.value })} value={props.draft.targetLanguage ?? ""} /></label>
          <label className="checkbox-line"><span>Enabled</span><input aria-label="Enabled" checked={props.draft.enabled} disabled={props.pending} onChange={(event) => props.onChange({ ...props.draft, enabled: event.target.checked })} type="checkbox" /></label>
        </div>
        <details><summary onClick={(event) => { if (props.pending) event.preventDefault(); }}>Advanced</summary><div className="compact-form"><label className="wide-field">Profile system prompt<textarea disabled={props.pending} onChange={(event) => props.onChange({ ...props.draft, systemPrompt: event.target.value })} value={props.draft.systemPrompt} /></label><label className="wide-field">User prompt template<textarea disabled={props.pending} onChange={(event) => props.onChange({ ...props.draft, userPromptTemplate: event.target.value })} value={props.draft.userPromptTemplate} /></label></div></details>
        {props.error ? <p role="alert">{props.error}</p> : null}
        <div className="button-row">
          <Button disabled={props.pending || !props.draft.name.trim() || !props.draft.systemPrompt.trim()} type="submit" variant="primary">Save Profile</Button>
          {props.original ? <Button disabled={props.pending} onClick={() => void props.onSetActive()} type="button">Set Active</Button> : null}
          {props.original ? <Button disabled={props.pending} onClick={() => void props.onDuplicate()} type="button">Duplicate {props.original.name}</Button> : null}
          {props.original && props.original.id !== "normal" ? <Button disabled={props.pending} onClick={() => void props.onDelete()} type="button" variant="danger">Delete {props.original.name}</Button> : null}
          <Button disabled={props.pending} onClick={props.onCancel} type="button">Cancel</Button>
        </div>
      </form>
    </dialog>
  );
}
