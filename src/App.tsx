import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookMarked,
  Database,
  Download,
  KeyRound,
  Mic,
  Play,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from "lucide-react";
import "./App.css";
import {
  DEFAULT_APP_CONFIG,
  type ApiKeyPresence,
  type AppConfig,
  type DictionaryTerm,
  type PromptProfile,
  buildExportPayload,
  getProviderReadiness,
  updateProviderModel,
} from "./domain/config";
import {
  checkProviderKeys,
  cleanupTempAudioFile,
  copyTextForPaste,
  exportConfigToFile,
  importConfigFromFile,
  listDictionaryTerms,
  listProfiles,
  listenForGlobalShortcut,
  runAudioFileDictation,
  saveProviderApiKey,
  startRecording,
  stopRecording,
  upsertDictionaryTerm,
  upsertProfile,
  type AudioFilePipelineRequest,
  type DictionaryRecord,
  type ProfileRecord,
} from "./lib/tauri";

const seedDictionaryTerms: DictionaryTerm[] = [
  {
    id: "dict_agent_security",
    spoken: "agent security",
    written: "AI Agent Security",
    aliases: ["agent 安全", "agent security project"],
    tags: ["work", "ai"],
    enabled: true,
    updatedAt: "2026-06-21T10:00:00.000Z",
  },
  {
    id: "dict_runtime_monitoring",
    spoken: "runtime monitoring",
    written: "runtime monitoring",
    aliases: ["运行时监控"],
    tags: ["engineering"],
    enabled: true,
    updatedAt: "2026-06-21T10:00:00.000Z",
  },
];

const navItems = [
  { label: "General", icon: Settings },
  { label: "Providers", icon: KeyRound },
  { label: "Profiles", icon: SlidersHorizontal },
  { label: "Dictionary", icon: BookMarked },
  { label: "Privacy", icon: ShieldCheck },
  { label: "Import/Export", icon: Database },
];

function App() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [keyPresence, setKeyPresence] = useState<ApiKeyPresence>({
    groq: false,
    openai: false,
  });
  const [groqKey, setGroqKey] = useState("");
  const [openAiKey, setOpenAiKey] = useState("");
  const [profiles, setProfiles] = useState<PromptProfile[]>(
    DEFAULT_APP_CONFIG.promptProfiles,
  );
  const [dictionaryTerms, setDictionaryTerms] =
    useState<DictionaryTerm[]>(seedDictionaryTerms);
  const [profileDraft, setProfileDraft] = useState({
    name: "",
    mode: "normal" as PromptProfile["mode"],
    systemPrompt: "",
    userPromptTemplate:
      "Transcript:\n{{transcript}}\n\nDictionary terms:\n{{dictionaryTerms}}",
    targetLanguage: "",
  });
  const [dictionaryDraft, setDictionaryDraft] = useState({
    spoken: "",
    written: "",
    aliases: "",
    tags: "",
  });
  const [recordingPath, setRecordingPath] = useState<string | null>(null);
  const [isDictationBusy, setIsDictationBusy] = useState(false);
  const [message, setMessage] = useState(
    "Provider interfaces are configured. Add keys when you are ready for live calls.",
  );

  const readiness = useMemo(
    () => getProviderReadiness(config, keyPresence),
    [config, keyPresence],
  );

  async function refreshKeys() {
    const status = await checkProviderKeys();
    setKeyPresence(status);
    setMessage("Credential status refreshed without exposing key values.");
  }

  async function saveKey(provider: "groq" | "openai", apiKey: string) {
    const status = await saveProviderApiKey(provider, apiKey);
    setKeyPresence(status);
    setGroqKey("");
    setOpenAiKey("");
    setMessage(`${provider.toUpperCase()} key saved to the OS credential store.`);
  }

  async function saveProfile() {
    if (!profileDraft.name.trim() || !profileDraft.systemPrompt.trim()) {
      setMessage("Profile name and system prompt are required.");
      return;
    }

    const now = new Date().toISOString();
    const id = `profile_${slug(profileDraft.name)}`;
    const profile: PromptProfile = {
      id,
      name: profileDraft.name.trim(),
      mode: profileDraft.mode,
      systemPrompt: profileDraft.systemPrompt.trim(),
      userPromptTemplate: profileDraft.userPromptTemplate,
      targetLanguage: profileDraft.targetLanguage.trim() || undefined,
      enabled: true,
      updatedAt: now,
    };
    const record: ProfileRecord = {
      id,
      name: profile.name,
      mode: profile.mode,
      system_prompt: profile.systemPrompt,
      user_prompt_template: profile.userPromptTemplate,
      target_language: profile.targetLanguage ?? null,
      enabled: true,
      updated_at: now,
      deleted_at: null,
    };

    await upsertProfile(record);
    setProfiles((current) => upsertById(current, profile));
    setConfig((current) => ({
      ...current,
      promptProfiles: upsertById(current.promptProfiles, profile),
    }));
    setProfileDraft((current) => ({
      ...current,
      name: "",
      systemPrompt: "",
      targetLanguage: "",
    }));
    setMessage(`Profile saved: ${profile.name}`);
  }

  async function saveDictionaryTerm() {
    if (!dictionaryDraft.spoken.trim() || !dictionaryDraft.written.trim()) {
      setMessage("Dictionary spoken and written phrases are required.");
      return;
    }

    const now = new Date().toISOString();
    const id = `dict_${slug(dictionaryDraft.spoken)}`;
    const aliases = splitList(dictionaryDraft.aliases);
    const tags = splitList(dictionaryDraft.tags);
    const term: DictionaryTerm = {
      id,
      spoken: dictionaryDraft.spoken.trim(),
      written: dictionaryDraft.written.trim(),
      aliases,
      tags,
      enabled: true,
      updatedAt: now,
    };
    const record: DictionaryRecord = {
      id,
      spoken: term.spoken,
      written: term.written,
      aliases_json: JSON.stringify(aliases),
      tags_json: JSON.stringify(tags),
      enabled: true,
      updated_at: now,
      deleted_at: null,
    };

    await upsertDictionaryTerm(record);
    setDictionaryTerms((current) => upsertById(current, term));
    setDictionaryDraft({ spoken: "", written: "", aliases: "", tags: "" });
    setMessage(`Dictionary term saved: ${term.written}`);
  }

  async function exportConfiguration() {
    const path = window.prompt("Export configuration JSON path");
    if (!path) {
      return;
    }
    await exportConfigToFile(path, exportPreview);
    setMessage(`Configuration exported to ${path}`);
  }

  async function importConfiguration() {
    const path = window.prompt("Import configuration JSON path");
    if (!path) {
      return;
    }
    const payload = await importConfigFromFile(path);
    setConfig({
      ...payload.data,
      promptProfiles: payload.data.promptProfiles,
    });
    setProfiles(payload.data.promptProfiles);
    setDictionaryTerms(payload.data.dictionaryTerms);
    setMessage(`Configuration imported from ${path}`);
  }

  async function handleDictationToggle() {
    setIsDictationBusy(true);
    let completedAudioPath: string | null = null;
    try {
      if (!recordingPath) {
        const path = await startRecording();
        setRecordingPath(path);
        setMessage("Recording to temporary WAV. Press Stop Dictation to transcribe.");
        return;
      }

      const audioPath = await stopRecording();
      completedAudioPath = audioPath;
      setRecordingPath(null);
      setMessage("Recording stopped. Running STT and rewrite pipeline.");

      const request: AudioFilePipelineRequest = {
        config: {
          stt_provider: "groq",
          stt_model: config.providers.stt.model,
          rewrite_provider: "openai",
          rewrite_model: config.providers.rewrite.model,
        },
        audio_path: audioPath,
      };
      const text = await runAudioFileDictation(request);
      const clipboard = await copyTextForPaste(text);
      setMessage(clipboard.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (completedAudioPath) {
        try {
          await cleanupTempAudioFile(completedAudioPath);
        } catch (cleanupError) {
          console.warn("Temporary audio cleanup failed", cleanupError);
        }
      }
      setIsDictationBusy(false);
    }
  }

  const dictationToggleRef = useRef(handleDictationToggle);

  useEffect(() => {
    dictationToggleRef.current = handleDictationToggle;
  });

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    listenForGlobalShortcut(() => dictationToggleRef.current())
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unlisten = cleanup;
      })
      .catch((error) => {
        console.warn("Global shortcut listener failed", error);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function loadStoredConfig() {
      const [storedProfiles, storedDictionary] = await Promise.all([
        listProfiles(),
        listDictionaryTerms(),
      ]);
      if (disposed) {
        return;
      }
      if (storedProfiles.length > 0) {
        const mappedProfiles = storedProfiles.map(profileRecordToProfile);
        setProfiles(mappedProfiles);
        setConfig((current) => ({ ...current, promptProfiles: mappedProfiles }));
      }
      if (storedDictionary.length > 0) {
        setDictionaryTerms(storedDictionary.map(dictionaryRecordToTerm));
      }
    }

    loadStoredConfig().catch((error) => {
      setMessage(`Could not load local config: ${error}`);
    });

    return () => {
      disposed = true;
    };
  }, []);

  const exportPreview = buildExportPayload({
    config,
    dictionaryTerms,
  });

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Gospeak navigation">
        <div className="brand">
          <span className="brand-mark">
            <Mic size={18} />
          </span>
          <div>
            <strong>Gospeak</strong>
            <span>Local-first voice input</span>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <a
              className={item.label === "Providers" ? "nav-item active" : "nav-item"}
              href={`#${item.label.toLowerCase().replace("/", "-")}`}
              key={item.label}
            >
              <item.icon size={17} />
              {item.label}
            </a>
          ))}
        </nav>

        <section className="recorder-card" aria-label="Floating recorder preview">
          <div className="recorder-dot" />
          <div>
            <strong>Alt+Space</strong>
            <span>Ready for push-to-talk</span>
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Gospeak Alpha</h1>
            <p>
              Windows-first Tauri shell for hotkey voice input, provider setup,
              profiles, dictionary, and privacy-safe export.
            </p>
          </div>
          <button
            className="primary-action"
            type="button"
            onClick={handleDictationToggle}
            disabled={isDictationBusy}
          >
            <Play size={16} />
            {recordingPath ? "Stop Dictation" : "Start Dictation"}
          </button>
        </header>

        <section className="status-grid" aria-label="Alpha status">
          <StatusTile
            label="STT"
            value="Groq STT"
            detail={readiness.stt.ready ? "Key ready" : readiness.stt.reason}
            tone={readiness.stt.ready ? "good" : "warn"}
          />
          <StatusTile
            label="Rewrite"
            value="OpenAI Rewrite"
            detail={
              readiness.rewrite.ready ? "Key ready" : readiness.rewrite.reason
            }
            tone={readiness.rewrite.ready ? "good" : "warn"}
          />
          <StatusTile label="History" value="Off" detail="Transcript history disabled" />
          <StatusTile label="Storage" value="Local" detail="SQLite enabled as source of truth" />
        </section>

        <div className="content-grid">
          <section className="panel providers-panel" id="providers">
            <PanelHeader
              icon={<KeyRound size={19} />}
              title="Provider Configuration"
              description="Separate STT and rewrite providers so each can evolve independently."
            />

            <div className="provider-row">
              <div>
                <h3>Groq STT</h3>
                <p>Default low-cost, low-latency transcription path.</p>
              </div>
              <label>
                STT model
                <select
                  value={config.providers.stt.model}
                  onChange={(event) =>
                    setConfig((current) =>
                      updateProviderModel(current, "stt", event.target.value),
                    )
                  }
                >
                  <option value="whisper-large-v3-turbo">
                    whisper-large-v3-turbo
                  </option>
                  <option value="whisper-large-v3">whisper-large-v3</option>
                </select>
              </label>
            </div>

            <div className="key-row">
              <input
                aria-label="Groq API key"
                onChange={(event) => setGroqKey(event.target.value)}
                placeholder="Groq API key"
                type="password"
                value={groqKey}
              />
              <button
                type="button"
                onClick={() => saveKey("groq", groqKey)}
                disabled={!groqKey.trim()}
              >
                Save Groq key
              </button>
            </div>

            <div className="provider-row">
              <div>
                <h3>OpenAI Rewrite</h3>
                <p>Default text cleanup, formatting, translation, and prompt shaping.</p>
              </div>
              <label>
                Rewrite model
                <select
                  value={config.providers.rewrite.model}
                  onChange={(event) =>
                    setConfig((current) =>
                      updateProviderModel(
                        current,
                        "rewrite",
                        event.target.value,
                      ),
                    )
                  }
                >
                  <option value="gpt-5-nano">gpt-5-nano</option>
                  <option value="gpt-5-mini">gpt-5-mini</option>
                </select>
              </label>
            </div>

            <div className="key-row">
              <input
                aria-label="OpenAI API key"
                onChange={(event) => setOpenAiKey(event.target.value)}
                placeholder="OpenAI API key"
                type="password"
                value={openAiKey}
              />
              <button
                type="button"
                onClick={() => saveKey("openai", openAiKey)}
                disabled={!openAiKey.trim()}
              >
                Save OpenAI key
              </button>
            </div>

            <div className="message-row">
              <span>{message}</span>
              <button type="button" onClick={refreshKeys}>
                Refresh key status
              </button>
            </div>
          </section>

          <section className="panel" id="profiles">
            <PanelHeader
              icon={<Sparkles size={19} />}
              title="Prompt Profiles"
              description="P0 ships with fixed profile templates before App-aware routing."
            />
            <div className="compact-form">
              <label>
                Profile name
                <input
                  value={profileDraft.name}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Profile mode
                <select
                  value={profileDraft.mode}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      mode: event.target.value as PromptProfile["mode"],
                    }))
                  }
                >
                  <option value="normal">normal</option>
                  <option value="email">email</option>
                  <option value="prompt">prompt</option>
                  <option value="translate">translate</option>
                </select>
              </label>
              <label className="wide-field">
                Profile system prompt
                <textarea
                  value={profileDraft.systemPrompt}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      systemPrompt: event.target.value,
                    }))
                  }
                />
              </label>
              <button type="button" onClick={saveProfile}>
                Save profile
              </button>
            </div>
            <div className="profile-list">
              {profiles.map((profile) => (
                <article className="profile-item" key={profile.id}>
                  <strong>{profile.name}</strong>
                  <span>{profile.mode}</span>
                  <p>{profile.systemPrompt}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel" id="dictionary">
            <PanelHeader
              icon={<BookMarked size={19} />}
              title="Personal Dictionary"
              description="Terms are injected into rewrite prompts and exported as config."
            />
            <div className="dictionary-list">
              <div className="compact-form dictionary-form">
                <label>
                  Spoken phrase
                  <input
                    value={dictionaryDraft.spoken}
                    onChange={(event) =>
                      setDictionaryDraft((current) => ({
                        ...current,
                        spoken: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Written phrase
                  <input
                    value={dictionaryDraft.written}
                    onChange={(event) =>
                      setDictionaryDraft((current) => ({
                        ...current,
                        written: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Dictionary aliases
                  <input
                    value={dictionaryDraft.aliases}
                    onChange={(event) =>
                      setDictionaryDraft((current) => ({
                        ...current,
                        aliases: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Dictionary tags
                  <input
                    value={dictionaryDraft.tags}
                    onChange={(event) =>
                      setDictionaryDraft((current) => ({
                        ...current,
                        tags: event.target.value,
                      }))
                    }
                  />
                </label>
                <button type="button" onClick={saveDictionaryTerm}>
                  Save dictionary term
                </button>
              </div>
              {dictionaryTerms.map((term) => (
                <article className="dict-item" key={term.id}>
                  <span>{term.spoken}</span>
                  <strong>{term.written}</strong>
                  <small>{term.tags.join(", ")}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="panel" id="privacy">
            <PanelHeader
              icon={<ShieldCheck size={19} />}
              title="Privacy Defaults"
              description="The Alpha keeps sensitive content out of local export and logs."
            />
            <div className="privacy-list">
              <PrivacyLine label="Save raw audio" enabled={config.privacy.saveRawAudio} />
              <PrivacyLine
                label="Save transcript history"
                enabled={config.privacy.saveTranscriptHistory}
              />
              <PrivacyLine
                label="Sync transcript history"
                enabled={config.privacy.syncTranscriptHistory}
              />
              <PrivacyLine
                label="Crash report includes transcript"
                enabled={config.privacy.crashReportIncludesTranscript}
              />
            </div>
          </section>

          <section className="panel export-panel" id="import-export">
            <PanelHeader
              icon={<Database size={19} />}
              title="Import / Export"
              description="Config export excludes API keys, audio, logs, and transcript history."
            />
            <div className="button-row">
              <button type="button" onClick={exportConfiguration}>
                <Download size={15} />
                Export configuration
              </button>
              <button type="button" onClick={importConfiguration}>
                <Upload size={15} />
                Import configuration
              </button>
            </div>
            <pre>{JSON.stringify(exportPreview.data.providers, null, 2)}</pre>
          </section>
        </div>
      </section>
    </main>
  );
}

function PanelHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <header className="panel-header">
      <span>{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  );
}

function StatusTile({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <article className={`status-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function PrivacyLine({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="privacy-line">
      <span>{label}</span>
      <strong>{enabled ? "On" : "Off"}</strong>
    </div>
  );
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  const index = items.findIndex((current) => current.id === item.id);
  if (index === -1) {
    return [...items, item];
  }
  return items.map((current) => (current.id === item.id ? item : current));
}

function profileRecordToProfile(record: ProfileRecord): PromptProfile {
  return {
    id: record.id,
    name: record.name,
    mode: record.mode as PromptProfile["mode"],
    systemPrompt: record.system_prompt,
    userPromptTemplate: record.user_prompt_template,
    targetLanguage: record.target_language ?? undefined,
    enabled: record.enabled,
    updatedAt: record.updated_at,
  };
}

function dictionaryRecordToTerm(record: DictionaryRecord): DictionaryTerm {
  return {
    id: record.id,
    spoken: record.spoken,
    written: record.written,
    aliases: parseJsonList(record.aliases_json),
    tags: parseJsonList(record.tags_json),
    enabled: record.enabled,
    updatedAt: record.updated_at,
  };
}

function parseJsonList(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export default App;
