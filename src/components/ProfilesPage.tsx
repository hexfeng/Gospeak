import { useEffect, useState } from "react";
import type {
  AppProfileRule,
  ForegroundAppContext,
  PromptProfile,
} from "../domain/config";

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
  onSaveProfile: (profile: PromptProfile) => void;
  onDeleteProfile: (profile: PromptProfile) => void;
  onSaveRule: (rule: AppProfileRule) => void;
  onDeleteRule: (rule: AppProfileRule) => void;
  onSetActive: (profileId: string) => void;
  onDirtyChange: (dirty: boolean) => void;
};

type RuleDraft = { appId: string; windowTitlePattern: string; priority: number };

const emptyRuleDraft: RuleDraft = { appId: "", windowTitlePattern: "", priority: 0 };

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
  const [query, setQuery] = useState("");
  const [ruleDraft, setRuleDraft] = useState(emptyRuleDraft);
  const selected = props.profiles.find((profile) => profile.id === selectedId);
  const dirty = selected !== undefined && draft !== null && JSON.stringify(toDraft(selected)) !== JSON.stringify(draft);
  const rules = props.appRules.filter((rule) => rule.profileId === selectedId && !rule.deletedAt);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function discardOrContinue() {
    return !dirty || window.confirm("Discard unsaved Profile changes?");
  }

  function chooseProfile(profile: PromptProfile) {
    if (!discardOrContinue()) return;
    setSelectedId(profile.id);
    setDraft(toDraft(profile));
    setRuleDraft(emptyRuleDraft);
  }

  function newProfile() {
    if (!discardOrContinue()) return;
    const next = createProfileDraft();
    setSelectedId(next.id);
    setDraft(next);
    setRuleDraft(emptyRuleDraft);
  }

  function saveProfile() {
    if (!draft || !draft.name.trim() || !draft.systemPrompt.trim()) return;
    props.onSaveProfile({
      ...draft,
      name: draft.name.trim(),
      systemPrompt: draft.systemPrompt.trim(),
      targetLanguage: draft.targetLanguage?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    });
  }

  function duplicateProfile(profile: PromptProfile) {
    const copy = { ...profile, id: `profile_${crypto.randomUUID()}`, name: `${profile.name} Copy`, updatedAt: new Date().toISOString() };
    props.onSaveProfile(copy);
    setSelectedId(copy.id);
    setDraft(toDraft(copy));
    setRuleDraft(emptyRuleDraft);
  }

  function deleteProfile(profile: PromptProfile) {
    if (!window.confirm(`Delete ${profile.name}?`)) return;
    props.onDeleteProfile(profile);
    const fallback =
      props.profiles.find((item) => item.mode === "normal") ??
      props.profiles.find((item) => item.id !== profile.id);
    if (fallback) {
      setSelectedId(fallback.id);
      setDraft(toDraft(fallback));
      setRuleDraft(emptyRuleDraft);
    }
  }

  function saveRule() {
    if (!draft || !ruleDraft.appId.trim()) return;
    props.onSaveRule({
      id: `rule_${crypto.randomUUID()}`,
      appId: ruleDraft.appId.trim(),
      windowTitlePattern: ruleDraft.windowTitlePattern.trim() || null,
      profileId: draft.id,
      priority: ruleDraft.priority,
      enabled: true,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    setRuleDraft(emptyRuleDraft);
  }

  const visibleProfiles = props.profiles.filter((profile) => profile.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));

  return (
    <section className="panel module-panel profiles-page" aria-labelledby="profiles-title">
      <header className="page-heading"><div><h1 id="profiles-title">Profiles</h1><p>Writing behavior and automatic app switching.</p></div></header>
      <div className="profile-split">
        <aside aria-label="Profiles">
          <label>Search profiles<input onChange={(event) => setQuery(event.target.value)} value={query} /></label>
          <button onClick={newProfile} type="button">New Profile</button>
          <div className="profile-list">
            {visibleProfiles.map((profile) => <button aria-label={profile.name} aria-pressed={profile.id === selectedId} className="profile-item" key={profile.id} onClick={() => chooseProfile(profile)} type="button"><strong>{profile.name}</strong><span>{profile.mode}</span></button>)}
          </div>
        </aside>
        {draft ? <section aria-labelledby="profile-editor-title">
          <header className="page-heading"><div><h2 id="profile-editor-title">{draft.name || "New Profile"}</h2><p>{draft.id === props.activeProfileId ? "Active profile" : "Profile editor"}</p></div></header>
          <div className="compact-form">
            <label>Profile name<input onChange={(event) => setDraft((current) => current && { ...current, name: event.target.value })} value={draft.name} /></label>
            <label>Profile mode<select onChange={(event) => setDraft((current) => current && { ...current, mode: event.target.value as PromptProfile["mode"] })} value={draft.mode}><option value="normal">normal</option><option value="email">email</option><option value="prompt">prompt</option><option value="translate">translate</option></select></label>
            <label>Target language<input onChange={(event) => setDraft((current) => current && { ...current, targetLanguage: event.target.value })} value={draft.targetLanguage ?? ""} /></label>
            <label className="checkbox-line"><span>Enabled</span><input checked={draft.enabled} onChange={(event) => setDraft((current) => current && { ...current, enabled: event.target.checked })} type="checkbox" /></label>
          </div>
          <details><summary>Advanced</summary><div className="compact-form">
            <label className="wide-field">Profile system prompt<textarea onChange={(event) => setDraft((current) => current && { ...current, systemPrompt: event.target.value })} value={draft.systemPrompt} /></label>
            <label className="wide-field">User prompt template<textarea onChange={(event) => setDraft((current) => current && { ...current, userPromptTemplate: event.target.value })} value={draft.userPromptTemplate} /></label>
          </div></details>
          <div className="button-row">
            <button disabled={!draft.name.trim() || !draft.systemPrompt.trim()} onClick={saveProfile} type="button">Save Profile</button>
            {selected ? <button onClick={() => props.onSetActive(selected.id)} type="button">Set Active</button> : null}
            {selected ? <button onClick={() => duplicateProfile(selected)} type="button">Duplicate {selected.name}</button> : null}
            {selected && selected.mode !== "normal" ? <button onClick={() => deleteProfile(selected)} type="button">Delete {selected.name}</button> : null}
          </div>
          <section aria-labelledby="app-rules-title">
            <h3 id="app-rules-title">App Rules</h3>
            <section aria-label="Current app preview" className="app-context-preview"><span>{props.foregroundContext?.appId || "No app detected"}</span><span>{props.foregroundContext?.windowTitle || "No window title"}</span></section>
            <div className="compact-form app-rule-form">
              <label>App id<input onChange={(event) => setRuleDraft((current) => ({ ...current, appId: event.target.value }))} placeholder="chrome.exe" value={ruleDraft.appId} /></label>
              <label>Title contains<input onChange={(event) => setRuleDraft((current) => ({ ...current, windowTitlePattern: event.target.value }))} placeholder="ChatGPT" value={ruleDraft.windowTitlePattern} /></label>
              <label>Priority<input onChange={(event) => setRuleDraft((current) => ({ ...current, priority: Number(event.target.value) }))} type="number" value={ruleDraft.priority} /></label>
              <button disabled={!ruleDraft.appId.trim()} onClick={saveRule} type="button">Save app rule</button>
            </div>
            <div className="rule-list">{rules.length > 0 ? rules.map((rule) => <article className="rule-item" key={rule.id}><strong>{rule.appId}</strong><span>{rule.windowTitlePattern || "Any title"}</span><small>Priority {rule.priority}</small><button onClick={() => window.confirm(`Delete rule for ${rule.appId}?`) && props.onDeleteRule(rule)} type="button">Delete rule for {rule.appId}</button></article>) : <p className="empty-note">No App Rules for this Profile.</p>}</div>
          </section>
        </section> : <p>Select or create a Profile.</p>}
      </div>
    </section>
  );
}
