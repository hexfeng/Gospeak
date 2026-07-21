import { useEffect, useRef, useState } from "react";
import { Check, Plus, SlidersHorizontal } from "lucide-react";
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
  onDeleteProfile: (profile: PromptProfile) => void;
  onSaveRule: (rule: AppProfileRule) => void;
  onDeleteRule: (rule: AppProfileRule) => void;
  onSetActive: (profileId: string) => void;
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
  const profileOpenerRef = useRef<HTMLElement | null>(null);
  const selected = props.profiles.find((profile) => profile.id === selectedId);
  const dirty = profileDialogOpen && draft !== null &&
    (selected === undefined || JSON.stringify(toDraft(selected)) !== JSON.stringify(draft));
  const rules = props.appRules.filter((rule) => rule.profileId === selectedId && !rule.deletedAt);
  const visibleProfiles = props.profiles.filter((profile) =>
    profile.name.toLocaleLowerCase().includes(profileQuery.toLocaleLowerCase()),
  );

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    if (!profileDialogOpen) profileOpenerRef.current?.focus();
  }, [profileDialogOpen]);

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
    if (selected) setDraft(toDraft(selected));
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

  function deleteProfile(profile: PromptProfile) {
    if (profile.id === "normal" || !window.confirm(`Delete ${profile.name}?`)) return;
    props.onDeleteProfile(profile);
    const fallback =
      props.profiles.find((item) => item.mode === "normal") ??
      props.profiles.find((item) => item.id !== profile.id);
    if (fallback) {
      setSelectedId(fallback.id);
      setDraft(toDraft(fallback));
      setRuleDraft(emptyRuleDraft);
    }
    setProfileDialogOpen(false);
  }

  function saveRule() {
    if (!selected || !ruleDraft.appId.trim()) return;
    props.onSaveRule({
      id: ruleDraft.id ?? `rule_${crypto.randomUUID()}`,
      appId: ruleDraft.appId.trim(),
      windowTitlePattern: ruleDraft.windowTitlePattern.trim() || null,
      profileId: selected.id,
      priority: ruleDraft.priority,
      enabled: ruleDraft.enabled,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    setRuleDraft(emptyRuleDraft);
  }

  function editRule(rule: AppProfileRule) {
    setRuleDraft({
      id: rule.id,
      appId: rule.appId,
      windowTitlePattern: rule.windowTitlePattern ?? "",
      priority: rule.priority,
      enabled: rule.enabled,
    });
  }

  function toggleRule(rule: AppProfileRule) {
    props.onSaveRule({
      ...rule,
      enabled: !rule.enabled,
      updatedAt: new Date().toISOString(),
    });
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
          onDelete={() => selected && deleteProfile(selected)}
          onDuplicate={async () => { if (selected) await duplicateProfile(selected); }}
          onSave={saveProfile}
          onSetActive={() => selected && props.onSetActive(selected.id)}
          original={selected}
        />
      ) : null}
      <section aria-labelledby="app-rules-title">
        <h2 id="app-rules-title">App Rules</h2>
        <section aria-label="Current app preview" className="app-context-preview"><span>{props.foregroundContext?.appId || "No app detected"}</span><span>{props.foregroundContext?.windowTitle || "No window title"}</span></section>
        {selected ? <>
          <div className="compact-form app-rule-form">
            <label>App id<input onChange={(event) => setRuleDraft((current) => ({ ...current, appId: event.target.value }))} placeholder="chrome.exe" value={ruleDraft.appId} /></label>
            <label>Title contains<input onChange={(event) => setRuleDraft((current) => ({ ...current, windowTitlePattern: event.target.value }))} placeholder="ChatGPT" value={ruleDraft.windowTitlePattern} /></label>
            <label>Priority<input onChange={(event) => setRuleDraft((current) => ({ ...current, priority: Number(event.target.value) }))} type="number" value={ruleDraft.priority} /></label>
            <Button disabled={!ruleDraft.appId.trim()} onClick={saveRule} type="button">Save app rule</Button>
          </div>
          <div className="rule-list">{rules.length > 0 ? rules.map((rule) => <article className="rule-item" key={rule.id}><strong>{rule.appId}</strong><span>{rule.windowTitlePattern || "Any title"}</span><small>Priority {rule.priority}</small><label><span>Enable rule for {rule.appId}</span><input aria-label={`Enable rule for ${rule.appId}`} checked={rule.enabled} onChange={() => toggleRule(rule)} type="checkbox" /></label><Button onClick={() => editRule(rule)} type="button">Edit rule for {rule.appId}</Button><Button onClick={() => window.confirm(`Delete rule for ${rule.appId}?`) && props.onDeleteRule(rule)} type="button">Delete rule for {rule.appId}</Button></article>) : <p className="empty-note">No App Rules for this Profile.</p>}</div>
        </> : <p className="empty-note">Save the Profile before adding automatic switching rules</p>}
      </section>
    </section>
  );
}

function ProfileDialog(props: {
  draft: ProfileDraft;
  error: string;
  pending: boolean;
  original?: PromptProfile;
  onCancel: () => void;
  onChange: (draft: ProfileDraft) => void;
  onDelete: () => void;
  onDuplicate: () => Promise<void>;
  onSave: () => Promise<void>;
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
      <form onSubmit={(event) => { event.preventDefault(); void props.onSave(); }}>
        <h2>{title}</h2>
        <div className="compact-form">
          <label>Profile name<input autoFocus onChange={(event) => props.onChange({ ...props.draft, name: event.target.value })} value={props.draft.name} /></label>
          <label>Profile mode<select onChange={(event) => props.onChange({ ...props.draft, mode: event.target.value as PromptProfile["mode"] })} value={props.draft.mode}><option value="normal">normal</option><option value="email">email</option><option value="prompt">prompt</option><option value="translate">translate</option></select></label>
          <label>Target language<input onChange={(event) => props.onChange({ ...props.draft, targetLanguage: event.target.value })} value={props.draft.targetLanguage ?? ""} /></label>
          <label className="checkbox-line"><span>Enabled</span><input aria-label="Enabled" checked={props.draft.enabled} onChange={(event) => props.onChange({ ...props.draft, enabled: event.target.checked })} type="checkbox" /></label>
        </div>
        <details><summary>Advanced</summary><div className="compact-form"><label className="wide-field">Profile system prompt<textarea onChange={(event) => props.onChange({ ...props.draft, systemPrompt: event.target.value })} value={props.draft.systemPrompt} /></label><label className="wide-field">User prompt template<textarea onChange={(event) => props.onChange({ ...props.draft, userPromptTemplate: event.target.value })} value={props.draft.userPromptTemplate} /></label></div></details>
        {props.error ? <p role="alert">{props.error}</p> : null}
        <div className="button-row">
          <Button disabled={props.pending || !props.draft.name.trim() || !props.draft.systemPrompt.trim()} type="submit" variant="primary">Save Profile</Button>
          {props.original ? <Button disabled={props.pending} onClick={props.onSetActive} type="button">Set Active</Button> : null}
          {props.original ? <Button disabled={props.pending} onClick={() => void props.onDuplicate()} type="button">Duplicate {props.original.name}</Button> : null}
          {props.original && props.original.id !== "normal" ? <Button disabled={props.pending} onClick={props.onDelete} type="button" variant="danger">Delete {props.original.name}</Button> : null}
          <Button disabled={props.pending} onClick={props.onCancel} type="button">Cancel</Button>
        </div>
      </form>
    </dialog>
  );
}
