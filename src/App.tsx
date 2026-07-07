import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  BookMarked,
  Database,
  Download,
  KeyRound,
  Mic,
  Play,
  Route,
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
  type AppProfileRule,
  type DictionaryTerm,
  type ForegroundAppContext,
  type PromptProfile,
  buildExportPayload,
  getProviderReadiness,
  resolveActiveProfileId,
  resolveProfileForContext,
  updateProviderModel,
} from "./domain/config";
import {
  DICTATION_INITIAL_STATE,
  dictationReducer,
} from "./domain/dictation";
import {
  checkProviderKeys,
  cleanupTempAudioFile,
  copyTextForPaste,
  exportConfigToFile,
  getForegroundAppContext,
  importConfigFromFile,
  listAppProfileRules,
  listDictionaryTerms,
  listPreferences,
  listProfiles,
  listUsageEvents,
  listenForGlobalShortcut,
  listenForTrayAction,
  publishRecorderState,
  readSelectedTextForEdit,
  runAudioFileDictation,
  runStreamingDictation,
  saveProviderApiKey,
  selectExportPath,
  selectImportPath,
  startRecording,
  startStreamingRecording,
  stopRecording,
  updateGlobalShortcut,
  upsertAppProfileRule,
  upsertDictionaryTerm,
  upsertPreference,
  upsertProfile,
  type AudioFilePipelineRequest,
  type DictionaryRecord,
  type ProfileRecord,
  type UsageEventRecord,
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

type AppSection =
  | "general"
  | "providers"
  | "profiles"
  | "app-rules"
  | "dictionary"
  | "privacy"
  | "import-export";

const navItems: Array<{
  id: AppSection;
  label: string;
  icon: typeof Settings;
}> = [
  { id: "general", label: "General", icon: Settings },
  { id: "providers", label: "Providers", icon: KeyRound },
  { id: "profiles", label: "Profiles", icon: SlidersHorizontal },
  { id: "app-rules", label: "App Rules", icon: Route },
  { id: "dictionary", label: "Dictionary", icon: BookMarked },
  { id: "privacy", label: "Privacy", icon: ShieldCheck },
  { id: "import-export", label: "Import/Export", icon: Database },
];

type DictationDiagnostics = {
  recordingStartMs: number;
  recordingStopMs: number;
  pipelineMs: number;
  sttMs: number;
  rewriteMs: number | null;
  pasteMs: number;
  audioSeconds: number | null;
  audioBytes: number | null;
  fastPathUsed: boolean;
  firstSttDeltaMs: number | null;
  firstRewriteDeltaMs: number | null;
  firstInsertMs: number | null;
  streamingUsed: boolean;
};

const STREAMING_STT_MODEL = "gpt-realtime-whisper";

function App() {
  const [activeSection, setActiveSection] = useState<AppSection>("general");
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
  const [appRules, setAppRules] = useState<AppProfileRule[]>([]);
  const [usageEvents, setUsageEvents] = useState<UsageEventRecord[]>([]);
  const [foregroundContext, setForegroundContext] =
    useState<ForegroundAppContext | null>(null);
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
  const [appRuleDraft, setAppRuleDraft] = useState({
    appId: "",
    windowTitlePattern: "",
    profileId: DEFAULT_APP_CONFIG.activeProfileId,
    priority: 0,
  });
  const [dictation, dispatchDictation] = useReducer(
    dictationReducer,
    DICTATION_INITIAL_STATE,
  );
  const [isDictationBusy, setIsDictationBusy] = useState(false);
  const [message, setMessage] = useState(
    "Provider interfaces are configured. Add keys when you are ready for live calls.",
  );
  const [lastDiagnostics, setLastDiagnostics] =
    useState<DictationDiagnostics | null>(null);

  const readiness = useMemo(
    () => getProviderReadiness(config, keyPresence),
    [config, keyPresence],
  );
  const usageCostTotals = useMemo(
    () => summarizeUsageCosts(usageEvents),
    [usageEvents],
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

  async function saveAppRule() {
    const appId = appRuleDraft.appId.trim();
    const titlePattern = appRuleDraft.windowTitlePattern.trim();
    if (!appId) {
      setMessage("App rule needs an app id.");
      return;
    }

    const now = new Date().toISOString();
    const profileId = appRuleDraft.profileId || config.activeProfileId;
    const record: AppProfileRule = {
      id: `rule_${slug([appId, titlePattern, profileId, now].join("_"))}`,
      appId,
      windowTitlePattern: titlePattern || null,
      profileId,
      priority: appRuleDraft.priority,
      enabled: true,
      updatedAt: now,
      deletedAt: null,
    };

    await upsertAppProfileRule({ record });
    setAppRules((current) => upsertById(current, record));
    setAppRuleDraft((current) => ({
      ...current,
      appId: "",
      windowTitlePattern: "",
      priority: 0,
    }));
    setMessage(`App rule saved for ${appId || titlePattern}.`);
  }

  async function exportConfiguration() {
    const path = await selectExportPath();
    if (!path) {
      return;
    }
    await exportConfigToFile(path, exportPreview);
    setMessage(`Configuration exported to ${path}`);
  }

  async function importConfiguration() {
    const path = await selectImportPath();
    if (!path) {
      return;
    }
    const payload = await importConfigFromFile(path);
    setConfig({ ...DEFAULT_APP_CONFIG, ...payload.data });
    setProfiles(payload.data.promptProfiles);
    setDictionaryTerms(payload.data.dictionaryTerms);
    setAppRules(payload.data.appRules ?? []);
    setMessage(`Configuration imported from ${path}`);
  }

  async function publishRecorderStateSafely(payload: {
    status: string;
    message: string;
  }) {
    try {
      await publishRecorderState(payload);
    } catch (error) {
      console.warn("Recorder overlay update failed", error);
    }
  }

  async function handleDictationToggle() {
    setIsDictationBusy(true);
    let completedAudioPath: string | null = null;
    let ownsStartingFlag = false;
    try {
      if (dictationStatusRef.current !== "recording") {
        if (isStartingRecordingRef.current) {
          stopAfterStartRef.current = true;
          return;
        }
        isStartingRecordingRef.current = true;
        ownsStartingFlag = true;
        selectedTextForEditRef.current = null;
        if (config.performance.speakToEdit) {
          selectedTextForEditRef.current = await readSelectedTextForEdit();
          setMessage("Editing selected text. Record the edit instruction.");
        }
        const recordingStartStarted = performance.now();
        const path = await (config.performance.streamingMode
          ? startStreamingRecording
          : startRecording)();
        recordingStartLatencyRef.current = elapsedPerformanceMs(
          recordingStartStarted,
        );
        dictationStatusRef.current = "recording";
        dispatchDictation({ type: "recording-started", audioPath: path });
        setMessage(
          config.performance.speakToEdit
            ? "Editing selected text. Press Stop Speak to Edit to replace it."
            : "Recording to temporary WAV. Press Stop Dictation to transcribe.",
        );
        if (
          shortcutModeRef.current === "push-to-talk" &&
          stopAfterStartRef.current
        ) {
          stopAfterStartRef.current = false;
          void dictationToggleRef.current();
        }
        return;
      }

      const recordingStopStarted = performance.now();
      const audioPath = await stopRecording();
      const recordingStopMs = elapsedPerformanceMs(recordingStopStarted);
      completedAudioPath = audioPath;
      dictationStatusRef.current = "transcribing";
      dispatchDictation({ type: "recording-stopped" });
      await publishRecorderStateSafely({
        status: "transcribing",
        message: "Transcribing with Groq…",
      });
      setMessage("Recording stopped. Running STT and rewrite pipeline.");

      let profileId = config.activeProfileId;
      if (config.appRouting.enabled) {
        const context = await getForegroundAppContext();
        setForegroundContext(context);
        profileId = resolveProfileForContext({
          activeProfileId: config.activeProfileId,
          enabledProfileIds: enabledProfileIds(profiles),
          context,
          rules: appRules,
        }).profileId;
      } else {
        profileId = resolveActiveProfileId(
          config.activeProfileId,
          enabledProfileIds(profiles),
        );
      }

      const request: AudioFilePipelineRequest = {
        audio_path: audioPath,
        profile_id: profileId,
        stt_model: config.providers.stt.model,
        rewrite_model: config.providers.rewrite.model,
        selected_text: selectedTextForEditRef.current,
        skip_rewrite:
          config.performance.fastMode && selectedTextForEditRef.current == null,
      };
      const pipelineStarted = performance.now();
      let insertedStreaming = false;
      let result: Awaited<ReturnType<typeof runAudioFileDictation>> &
        Partial<Awaited<ReturnType<typeof runStreamingDictation>>>;
      if (
        config.performance.streamingMode &&
        selectedTextForEditRef.current == null
      ) {
        try {
          const streamingResult = await runStreamingDictation({
            ...request,
            stt_model: STREAMING_STT_MODEL,
            streaming_insert: true,
          });
          result = streamingResult;
          insertedStreaming = streamingResult.inserted_streaming;
        } catch {
          result = await runAudioFileDictation(request);
        }
      } else {
        result = await runAudioFileDictation(request);
      }
      const pipelineMs = elapsedPerformanceMs(pipelineStarted);
      if (result.no_speech) {
        dictationStatusRef.current = "idle";
        dispatchDictation({ type: "reset" });
        await publishRecorderStateSafely({
          status: "idle",
          message: "Ready for dictation.",
        });
        setMessage("Ready for dictation.");
        selectedTextForEditRef.current = null;
        return;
      }
      if (!result.fast_path_used) {
        dictationStatusRef.current = "rewriting";
        dispatchDictation({ type: "rewriting" });
        await publishRecorderStateSafely({
          status: "rewriting",
          message: "Rewriting with OpenAI…",
        });
      }
      dictationStatusRef.current = "pasting";
      dispatchDictation({ type: "pasting" });
      await publishRecorderStateSafely({
        status: "pasting",
        message: "Pasting…",
      });
      const pasteStarted = performance.now();
      const completionMessage = insertedStreaming
        ? "Streaming dictation inserted text into the active app."
        : (await copyTextForPaste(result.text)).message;
      const pasteMs = insertedStreaming
        ? 0
        : elapsedPerformanceMs(pasteStarted);
      setLastDiagnostics({
        recordingStartMs: recordingStartLatencyRef.current,
        recordingStopMs,
        pipelineMs,
        sttMs: result.stt_latency_ms,
        rewriteMs: result.rewrite_latency_ms ?? null,
        pasteMs,
        audioSeconds: result.audio_seconds ?? null,
        audioBytes: result.audio_file_bytes ?? null,
        fastPathUsed: result.fast_path_used === true,
        firstSttDeltaMs: result.first_stt_delta_ms ?? null,
        firstRewriteDeltaMs: result.first_rewrite_delta_ms ?? null,
        firstInsertMs: result.first_insert_ms ?? null,
        streamingUsed: result.streaming_used === true,
      });
      dictationStatusRef.current = "done";
      dispatchDictation({
        type: "completed",
        message: completionMessage,
        rewriteFallbackUsed: result.rewrite_fallback_used,
      });
      await refreshUsageEvents();
      setMessage(completionMessage);
      selectedTextForEditRef.current = null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      dictationStatusRef.current = "error";
      dispatchDictation({ type: "failed", message: errorMessage });
      setMessage(errorMessage);
    } finally {
      if (dictationStatusRef.current !== "recording") {
        selectedTextForEditRef.current = null;
      }
      if (ownsStartingFlag) {
        isStartingRecordingRef.current = false;
      }
      if (completedAudioPath) {
        if (!config.privacy.saveRawAudio) {
          try {
            await cleanupTempAudioFile(completedAudioPath);
          } catch (cleanupError) {
            console.warn("Temporary audio cleanup failed", cleanupError);
          }
        }
      }
      setIsDictationBusy(false);
    }
  }

  const dictationToggleRef = useRef(handleDictationToggle);
  const changeActiveProfileRef = useRef<(profileId: string) => Promise<void>>(
    async () => undefined,
  );
  const shortcutModeRef = useRef(config.hotkey.mode);
  const dictationStatusRef = useRef(dictation.status);
  const isStartingRecordingRef = useRef(false);
  const stopAfterStartRef = useRef(false);
  const recordingStartLatencyRef = useRef(0);
  const selectedTextForEditRef = useRef<string | null>(null);

  useEffect(() => {
    dictationToggleRef.current = handleDictationToggle;
    shortcutModeRef.current = config.hotkey.mode;
    dictationStatusRef.current = dictation.status;
    changeActiveProfileRef.current = changeActiveProfile;
  });

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    listenForGlobalShortcut((state) => {
      const mode = shortcutModeRef.current;
      const status = dictationStatusRef.current;
      if (
        (mode === "toggle" && state === "pressed") ||
        (mode === "push-to-talk" &&
          ((state === "pressed" && status !== "recording") ||
            (state === "released" &&
              (status === "recording" || isStartingRecordingRef.current))))
      ) {
        void dictationToggleRef.current();
      }
    })
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
    void publishRecorderStateSafely({
      status: dictation.status,
      message: dictation.message,
    });
  }, [dictation.message, dictation.status]);

  useEffect(() => {
    if (activeSection !== "app-rules") {
      return;
    }
    let disposed = false;
    getForegroundAppContext()
      .then((context) => {
        if (!disposed) {
          setForegroundContext(context);
        }
      })
      .catch((error) => {
        console.warn("Foreground app preview failed", error);
      });
    return () => {
      disposed = true;
    };
  }, [activeSection]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenForTrayAction((action) => {
      if (action === "toggle") {
        void dictationToggleRef.current();
      } else if (action.startsWith("profile:")) {
        void changeActiveProfileRef.current(action.slice("profile:".length));
      }
    }).then((cleanup) => {
      unlisten = cleanup;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let disposed = false;

    async function loadStoredConfig() {
      const [
        storedProfiles,
        storedDictionary,
        storedAppRules,
        storedPreferences,
        storedKeyPresence,
        storedUsageEvents,
      ] = await Promise.all([
        listProfiles(),
        listDictionaryTerms(),
        listAppProfileRules(),
        listPreferences(),
        checkProviderKeys(),
        listUsageEvents(),
      ]);
      if (disposed) {
        return;
      }
      setKeyPresence(storedKeyPresence);
      setUsageEvents(storedUsageEvents);
      if (storedProfiles.length > 0) {
        const mappedProfiles = storedProfiles.map(profileRecordToProfile);
        setProfiles(mappedProfiles);
      }
      if (storedDictionary.length > 0) {
        setDictionaryTerms(storedDictionary.map(dictionaryRecordToTerm));
      }
      setAppRules(storedAppRules);
      const preferences = Object.fromEntries(
        storedPreferences.map((preference) => [preference.key, preference.value]),
      );
      const mappedProfiles =
        storedProfiles.length > 0
          ? storedProfiles.map(profileRecordToProfile)
          : DEFAULT_APP_CONFIG.promptProfiles;
      const nextConfig = applyStoredPreferences(
        { ...DEFAULT_APP_CONFIG, promptProfiles: mappedProfiles },
        preferences,
      );
      setConfig({
        ...nextConfig,
        activeProfileId: resolveActiveProfileId(
          nextConfig.activeProfileId,
          enabledProfileIds(mappedProfiles),
        ),
      });
      if (nextConfig.hotkey.binding !== DEFAULT_APP_CONFIG.hotkey.binding) {
        await updateGlobalShortcut(
          nextConfig.hotkey.binding,
          DEFAULT_APP_CONFIG.hotkey.binding,
        );
      }
    }

    loadStoredConfig().catch((error) => {
      setMessage(`Could not load local config: ${error}`);
    });

    return () => {
      disposed = true;
    };
  }, []);

  async function persistPreference(key: string, value: unknown) {
    await upsertPreference({
      key,
      value: typeof value === "string" ? value : JSON.stringify(value),
      updated_at: new Date().toISOString(),
    });
  }

  async function refreshUsageEvents() {
    setUsageEvents(await listUsageEvents());
  }

  async function changeActiveProfile(profileId: string) {
    setConfig((current) => ({ ...current, activeProfileId: profileId }));
    await persistPreference("active_profile_id", profileId);
    setMessage(`Active profile changed to ${profileId}.`);
  }

  async function changeHotkey(
    next: Partial<AppConfig["hotkey"]>,
  ) {
    const hotkey = { ...config.hotkey, ...next };
    if (next.binding) {
      await updateGlobalShortcut(next.binding, config.hotkey.binding);
    }
    setConfig((current) => ({ ...current, hotkey }));
    await persistPreference("hotkey", hotkey);
    setMessage(`Global shortcut updated: ${hotkey.binding} (${hotkey.mode}).`);
  }

  async function changeProviderModel(
    kind: "stt" | "rewrite",
    model: string,
  ) {
    const next = updateProviderModel(config, kind, model);
    setConfig(next);
    await persistPreference("providers", next.providers);
  }

  async function changePrivacy(
    key: keyof AppConfig["privacy"],
    enabled: boolean,
  ) {
    const privacy = { ...config.privacy, [key]: enabled };
    setConfig((current) => ({ ...current, privacy }));
    await persistPreference("privacy", privacy);
  }

  async function changeFastMode(enabled: boolean) {
    const performanceConfig = { ...config.performance, fastMode: enabled };
    setConfig((current) => ({ ...current, performance: performanceConfig }));
    await persistPreference("performance", performanceConfig);
    setMessage(enabled ? "Fast dictation enabled." : "Fast dictation disabled.");
  }

  async function changeSpeakToEdit(enabled: boolean) {
    const performanceConfig = { ...config.performance, speakToEdit: enabled };
    setConfig((current) => ({ ...current, performance: performanceConfig }));
    await persistPreference("performance", performanceConfig);
    setMessage(enabled ? "Speak to Edit enabled." : "Speak to Edit disabled.");
  }

  async function changeStreamingMode(enabled: boolean) {
    const performanceConfig = { ...config.performance, streamingMode: enabled };
    setConfig((current) => ({ ...current, performance: performanceConfig }));
    await persistPreference("performance", performanceConfig);
  }

  async function changeAppRouting(enabled: boolean) {
    const appRouting = { enabled };
    setConfig((current) => ({ ...current, appRouting }));
    await persistPreference("app_routing", appRouting);
    setMessage(
      enabled ? "App-aware routing enabled." : "App-aware routing disabled.",
    );
  }

  const exportPreview = buildExportPayload({
    config,
    dictionaryTerms,
    appRules,
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
            <button
              aria-current={activeSection === item.id ? "page" : undefined}
              className={activeSection === item.id ? "nav-item active" : "nav-item"}
              key={item.label}
              onClick={() => setActiveSection(item.id)}
              type="button"
            >
              <item.icon size={17} />
              {item.label}
            </button>
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
            {dictation.status === "recording"
              ? config.performance.speakToEdit
                ? "Stop Speak to Edit"
                : "Stop Dictation"
              : config.performance.speakToEdit
                ? "Start Speak to Edit"
                : "Start Dictation"}
          </button>
        </header>

        <p className="app-message" role="status">
          {message}
        </p>

        <div className="module-stage">
          {activeSection === "general" ? (
          <section className="panel module-panel" id="general">
            <PanelHeader
              icon={<Settings size={19} />}
              title="General"
              description="Choose the profile and global shortcut used by the live pipeline."
            />
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
              <StatusTile
                label="History"
                value="Off"
                detail="Transcript history disabled"
              />
              <StatusTile
                label="Storage"
                value="Local"
                detail="SQLite enabled as source of truth"
              />
            </section>
            <div className="compact-form">
              <label>
                Active profile
                <select
                  value={config.activeProfileId}
                  onChange={(event) => void changeActiveProfile(event.target.value)}
                >
                  {profiles
                    .filter((profile) => profile.enabled)
                    .map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Hotkey binding
                <input
                  value={config.hotkey.binding}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      hotkey: { ...current.hotkey, binding: event.target.value },
                    }))
                  }
                  onBlur={(event) =>
                    void changeHotkey({ binding: event.target.value })
                  }
                />
              </label>
              <label>
                Hotkey mode
                <select
                  value={config.hotkey.mode}
                  onChange={(event) =>
                    void changeHotkey({
                      mode: event.target.value as AppConfig["hotkey"]["mode"],
                    })
                  }
                >
                  <option value="push-to-talk">Push-to-talk</option>
                  <option value="toggle">Toggle</option>
                </select>
              </label>
              <label className="checkbox-line">
                <span>Fast dictation</span>
                <input
                  type="checkbox"
                  checked={config.performance.fastMode}
                  onChange={(event) => void changeFastMode(event.target.checked)}
                />
              </label>
              <label className="checkbox-line">
                <span>Speak to Edit</span>
                <input
                  type="checkbox"
                  checked={config.performance.speakToEdit}
                  onChange={(event) =>
                    void changeSpeakToEdit(event.target.checked)
                  }
                />
              </label>
              <label className="checkbox-line">
                <span>
                  <strong>Experimental streaming dictation</strong>
                  <small>
                    Streams STT and rewrite when available; batch dictation
                    remains the fallback.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={config.performance.streamingMode}
                  onChange={(event) =>
                    void changeStreamingMode(event.target.checked)
                  }
                />
              </label>
            </div>
            {lastDiagnostics ? (
              <LatencyDiagnostics diagnostics={lastDiagnostics} />
            ) : null}
          </section>
          ) : null}

          {activeSection === "providers" ? (
          <section className="panel module-panel providers-panel" id="providers">
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
                    void changeProviderModel("stt", event.target.value)
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
                    void changeProviderModel("rewrite", event.target.value)
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

            <UsageCostTotals totals={usageCostTotals} />

            <div className="message-row">
              <span>{message}</span>
              <button type="button" onClick={refreshKeys}>
                Refresh key status
              </button>
            </div>
          </section>
          ) : null}

          {activeSection === "profiles" ? (
          <section className="panel module-panel" id="profiles">
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
          ) : null}

          {activeSection === "app-rules" ? (
          <section className="panel module-panel" id="app-rules">
            <PanelHeader
              icon={<Route size={19} />}
              title="App Rules"
              description="Resolve the dictation profile from the foreground app before each request."
            />
            <label className="privacy-line app-routing-toggle">
              <span>Enable app-aware routing</span>
              <input
                aria-label="Enable app-aware routing"
                type="checkbox"
                checked={config.appRouting.enabled}
                onChange={(event) => void changeAppRouting(event.target.checked)}
              />
            </label>
            <section className="app-context-preview" aria-label="Current app preview">
              <Metric
                label="Detected app"
                value={foregroundContext?.appId || "Unavailable"}
              />
              <Metric
                label="Window title"
                value={foregroundContext?.windowTitle || "Unavailable"}
              />
            </section>
            <div className="compact-form app-rule-form">
              <label>
                App id
                <input
                  value={appRuleDraft.appId}
                  onChange={(event) =>
                    setAppRuleDraft((current) => ({
                      ...current,
                      appId: event.target.value,
                    }))
                  }
                  placeholder="chrome.exe"
                />
              </label>
              <label>
                Title contains
                <input
                  value={appRuleDraft.windowTitlePattern}
                  onChange={(event) =>
                    setAppRuleDraft((current) => ({
                      ...current,
                      windowTitlePattern: event.target.value,
                    }))
                  }
                  placeholder="ChatGPT"
                />
              </label>
              <label>
                Rule profile
                <select
                  value={appRuleDraft.profileId}
                  onChange={(event) =>
                    setAppRuleDraft((current) => ({
                      ...current,
                      profileId: event.target.value,
                    }))
                  }
                >
                  {profiles
                    .filter((profile) => profile.enabled)
                    .map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Priority
                <input
                  type="number"
                  value={appRuleDraft.priority}
                  onChange={(event) =>
                    setAppRuleDraft((current) => ({
                      ...current,
                      priority: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <button
                type="button"
                onClick={saveAppRule}
                disabled={!appRuleDraft.appId.trim()}
              >
                Save app rule
              </button>
            </div>
            <div className="rule-list">
              {appRules.length > 0 ? (
                appRules.map((rule) => (
                  <article className="rule-item" key={rule.id}>
                    <strong>{rule.profileId}</strong>
                    <span>{rule.appId}</span>
                    <span>{rule.windowTitlePattern || "Any title"}</span>
                    <span>{rule.enabled ? "Enabled" : "Disabled"}</span>
                    <small>Priority {rule.priority}</small>
                  </article>
                ))
              ) : (
                <p className="empty-note">No App Rules saved yet.</p>
              )}
            </div>
          </section>
          ) : null}

          {activeSection === "dictionary" ? (
          <section className="panel module-panel" id="dictionary">
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
          ) : null}

          {activeSection === "privacy" ? (
          <section className="panel module-panel" id="privacy">
            <PanelHeader
              icon={<ShieldCheck size={19} />}
              title="Privacy Defaults"
              description="The Alpha keeps sensitive content out of local export and logs."
            />
            <div className="privacy-list">
              <PrivacyLine
                label="Save raw audio"
                enabled={config.privacy.saveRawAudio}
                onChange={(enabled) => void changePrivacy("saveRawAudio", enabled)}
              />
              <PrivacyLine
                label="Save transcript history"
                enabled={config.privacy.saveTranscriptHistory}
                onChange={(enabled) =>
                  void changePrivacy("saveTranscriptHistory", enabled)
                }
              />
              <PrivacyLine
                label="Sync transcript history"
                enabled={config.privacy.syncTranscriptHistory}
                onChange={(enabled) =>
                  void changePrivacy("syncTranscriptHistory", enabled)
                }
              />
              <PrivacyLine
                label="Crash report includes transcript"
                enabled={config.privacy.crashReportIncludesTranscript}
                onChange={(enabled) =>
                  void changePrivacy("crashReportIncludesTranscript", enabled)
                }
              />
            </div>
          </section>
          ) : null}

          {activeSection === "import-export" ? (
          <section className="panel module-panel export-panel" id="import-export">
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
          ) : null}
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

type UsageCostSummary = {
  sttCost: number;
  rewriteCost: number;
};

function UsageCostTotals({ totals }: { totals: UsageCostSummary }) {
  return (
    <section className="cost-panel" aria-label="Usage cost totals">
      <div className="pricing-heading">
        <h3>Usage cost</h3>
        <span>Completed dictations</span>
      </div>
      <div className="cost-grid">
        <div className="cost-metric">
          <span>STT cost</span>
          <strong>{formatUsd(totals.sttCost)}</strong>
        </div>
        <div className="cost-metric">
          <span>Rewrite cost</span>
          <strong>{formatUsd(totals.rewriteCost)}</strong>
        </div>
      </div>
    </section>
  );
}

function LatencyDiagnostics({
  diagnostics,
}: {
  diagnostics: DictationDiagnostics;
}) {
  const rewriteValue = diagnostics.fastPathUsed
    ? "Skipped"
    : formatMs(diagnostics.rewriteMs);
  return (
    <section className="latency-panel" aria-label="Last dictation diagnostics">
      <h3>Last dictation diagnostics</h3>
      <div className="latency-grid">
        <Metric label="Start" value={formatMs(diagnostics.recordingStartMs)} />
        <Metric label="Stop" value={formatMs(diagnostics.recordingStopMs)} />
        <Metric label="STT" value={formatMs(diagnostics.sttMs)} />
        <Metric label="Rewrite" value={rewriteValue} />
        <Metric label="First STT" value={formatMs(diagnostics.firstSttDeltaMs)} />
        <Metric
          label="First rewrite"
          value={formatMs(diagnostics.firstRewriteDeltaMs)}
        />
        <Metric label="First insert" value={formatMs(diagnostics.firstInsertMs)} />
        <Metric label="Pipeline" value={formatMs(diagnostics.pipelineMs)} />
        <Metric label="Paste" value={formatMs(diagnostics.pasteMs)} />
        <Metric label="Audio" value={formatSeconds(diagnostics.audioSeconds)} />
        <Metric label="File" value={formatBytes(diagnostics.audioBytes)} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
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

function PrivacyLine({
  label,
  enabled,
  onChange,
}: {
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <label className="privacy-line">
      <span>{label}</span>
      <input
        aria-label={label}
        type="checkbox"
        checked={enabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
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

function enabledProfileIds(profiles: PromptProfile[]) {
  return profiles
    .filter((profile) => profile.enabled)
    .map((profile) => profile.id);
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

function applyStoredPreferences(
  config: AppConfig,
  preferences: Record<string, string>,
): AppConfig {
  const parse = <T,>(key: string, fallback: T): T => {
    const value = preferences[key];
    if (!value) {
      return fallback;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  };
  return {
    ...config,
    providers: parse("providers", config.providers),
    hotkey: parse("hotkey", config.hotkey),
    privacy: parse("privacy", config.privacy),
    performance: {
      ...config.performance,
      ...parse("performance", config.performance),
    },
    appRouting: parse("app_routing", config.appRouting),
    activeProfileId:
      preferences.active_profile_id ?? config.activeProfileId,
  };
}

function elapsedPerformanceMs(started: number) {
  return Math.max(0, Math.round(performance.now() - started));
}

function summarizeUsageCosts(events: UsageEventRecord[]): UsageCostSummary {
  return events.reduce(
    (totals, event) => ({
      sttCost: totals.sttCost + (event.stt_estimated_cost ?? 0),
      rewriteCost: totals.rewriteCost + (event.rewrite_estimated_cost ?? 0),
    }),
    { sttCost: 0, rewriteCost: 0 },
  );
}

function formatMs(value: number | null | undefined) {
  return value == null ? "N/A" : `${Math.round(value)} ms`;
}

function formatSeconds(value: number | null | undefined) {
  return value == null ? "N/A" : `${Number(value.toFixed(1))} s`;
}

function formatBytes(value: number | null | undefined) {
  if (value == null) {
    return "N/A";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  return `${(value / 1024).toFixed(1)} KB`;
}

function formatUsd(value: number) {
  return `$${value.toFixed(value >= 0.01 ? 2 : 4)}`;
}

export default App;
