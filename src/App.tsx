import { useEffect, useReducer, useRef, useState } from "react";
import {
  BookMarked,
  House,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import "./App.css";
import { DictionaryPage } from "./components/DictionaryPage";
import { GeneralPage } from "./components/GeneralPage";
import { ProfilesPage } from "./components/ProfilesPage";
import { SettingsPage } from "./components/SettingsPage";
import {
  DEFAULT_APP_CONFIG,
  type ApiKeyPresence,
  type AppConfig,
  type AppProfileRule,
  type CredentialProviderId,
  type DictionaryTerm,
  type ForegroundAppContext,
  type PromptProfile,
  type RewriteProviderId,
  type SttProviderId,
  applyStoredPreferences,
  buildExportPayload,
  resolveActiveProfileId,
  resolveProfileForContext,
  updateProviderModel,
  updateRewriteProvider,
  updateSttBaseUrl,
  updateSttProvider,
  validateSttBaseUrl,
} from "./domain/config";
import {
  DICTATION_INITIAL_STATE,
  dictationReducer,
} from "./domain/dictation";
import type { AppSection, SettingsTab } from "./domain/navigation";
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

const navItems = [
  { id: "general", label: "General", icon: House },
  { id: "profiles", label: "Profiles", icon: SlidersHorizontal },
  { id: "dictionary", label: "Dictionary", icon: BookMarked },
  { id: "settings", label: "Settings", icon: Settings },
] satisfies Array<{ id: AppSection; label: string; icon: typeof Settings }>;

type AppNotice = { text: string; tone: "info" | "error" } | null;

function App() {
  const [activeSection, setActiveSection] = useState<AppSection>("general");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("dictation");
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [keyPresence, setKeyPresence] = useState<ApiKeyPresence>({
    groq: false,
    openai: false,
  });
  const [keyDrafts, setKeyDrafts] = useState<
    Partial<Record<CredentialProviderId, string>>
  >({});
  const [profiles, setProfiles] = useState<PromptProfile[]>(
    DEFAULT_APP_CONFIG.promptProfiles,
  );
  const [dictionaryTerms, setDictionaryTerms] =
    useState<DictionaryTerm[]>(seedDictionaryTerms);
  const [appRules, setAppRules] = useState<AppProfileRule[]>([]);
  const [usageEvents, setUsageEvents] = useState<UsageEventRecord[]>([]);
  const [foregroundContext, setForegroundContext] =
    useState<ForegroundAppContext | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const [dictation, dispatchDictation] = useReducer(
    dictationReducer,
    DICTATION_INITIAL_STATE,
  );
  const [notice, setNotice] = useState<AppNotice>(null);

  useEffect(() => {
    if (notice?.tone !== "info") return;
    const timeout = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function refreshKeys() {
    const status = await checkProviderKeys();
    setKeyPresence(status);
    setNotice({
      text: "Credential status refreshed without exposing key values.",
      tone: "info",
    });
  }

  async function saveKey(provider: CredentialProviderId, apiKey: string) {
    const status = await saveProviderApiKey(provider, apiKey);
    setKeyPresence(status);
    setKeyDrafts((current) => ({ ...current, [provider]: "" }));
    setNotice({
      text: `${provider.toUpperCase()} key saved to the OS credential store.`,
      tone: "info",
    });
  }

  async function saveProfile(profile: PromptProfile) {
    const nextProfile =
      profile.id === "normal" && !profile.enabled
        ? { ...profile, enabled: true }
        : profile;
    if (config.activeProfileId === nextProfile.id && !nextProfile.enabled) {
      await changeActiveProfile("normal");
    }
    const record: ProfileRecord = {
      id: nextProfile.id,
      name: nextProfile.name,
      mode: nextProfile.mode,
      system_prompt: nextProfile.systemPrompt,
      user_prompt_template: nextProfile.userPromptTemplate,
      target_language: nextProfile.targetLanguage ?? null,
      enabled: nextProfile.enabled,
      updated_at: nextProfile.updatedAt,
      deleted_at: null,
    };

    await upsertProfile(record);
    setProfiles((current) => upsertById(current, nextProfile));
    setConfig((current) => ({
      ...current,
      promptProfiles: upsertById(current.promptProfiles, nextProfile),
    }));
    setNotice({ text: `Profile saved: ${nextProfile.name}`, tone: "info" });
  }

  async function deleteProfile(profile: PromptProfile) {
    if (profile.id === "normal") return;
    const deletedAt = new Date().toISOString();
    const associatedRules = appRules.filter(
      (rule) => rule.profileId === profile.id && !rule.deletedAt,
    );

    if (config.activeProfileId === profile.id) {
      await changeActiveProfile("normal");
    }
    await Promise.all(
      associatedRules.map((rule) =>
        upsertAppProfileRule({
          record: { ...rule, enabled: false, updatedAt: deletedAt, deletedAt },
        }),
      ),
    );
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
    setAppRules((current) =>
      current.filter((rule) => rule.profileId !== profile.id),
    );
    setProfiles((current) => current.filter((item) => item.id !== profile.id));
    setConfig((current) => ({
      ...current,
      promptProfiles: current.promptProfiles.filter((item) => item.id !== profile.id),
    }));
  }

  async function saveDictionaryTerm(term: DictionaryTerm) {
    const record: DictionaryRecord = {
      id: term.id,
      spoken: term.spoken,
      written: term.written,
      aliases_json: JSON.stringify(term.aliases),
      tags_json: JSON.stringify(term.tags),
      enabled: term.enabled,
      updated_at: term.updatedAt,
      deleted_at: null,
    };

    await upsertDictionaryTerm(record);
    setDictionaryTerms((current) => upsertById(current, term));
    setNotice({ text: `Dictionary term saved: ${term.written}`, tone: "info" });
  }

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

  async function toggleDictionaryTerm(term: DictionaryTerm, enabled: boolean) {
    await saveDictionaryTerm({ ...term, enabled, updatedAt: new Date().toISOString() });
  }

  async function saveAppRule(rule: AppProfileRule) {
    await upsertAppProfileRule({ record: rule });
    setAppRules((current) => upsertById(current, rule));
    setNotice({
      text: `App rule saved for ${rule.appId}.`,
      tone: "info",
    });
  }

  async function deleteAppRule(rule: AppProfileRule) {
    const deletedAt = new Date().toISOString();
    await upsertAppProfileRule({
      record: { ...rule, enabled: false, updatedAt: deletedAt, deletedAt },
    });
    setAppRules((current) => current.filter((item) => item.id !== rule.id));
  }

  async function exportConfiguration() {
    const path = await selectExportPath();
    if (!path) {
      return;
    }
    await exportConfigToFile(path, exportPreview);
    setNotice({ text: `Configuration exported to ${path}`, tone: "info" });
  }

  async function importConfiguration() {
    if (
      !window.confirm(
        "Importing will replace local Profiles, Dictionary terms, App Rules, and preferences. Continue?",
      )
    ) {
      return;
    }
    const path = await selectImportPath();
    if (!path) {
      return;
    }
    const payload = await importConfigFromFile(path);
    setConfig(
      applyStoredPreferences(DEFAULT_APP_CONFIG, {
        providers: JSON.stringify(payload.data.providers),
        hotkey: JSON.stringify(payload.data.hotkey),
        privacy: JSON.stringify(payload.data.privacy),
        performance: JSON.stringify(payload.data.performance),
        app_routing: JSON.stringify(payload.data.appRouting),
        active_profile_id: payload.data.activeProfileId,
      }),
    );
    setProfiles(payload.data.promptProfiles);
    setDictionaryTerms(payload.data.dictionaryTerms);
    setAppRules(payload.data.appRules ?? []);
    setNotice({ text: `Configuration imported from ${path}`, tone: "info" });
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
        const sttBaseUrlError = validateSttBaseUrl(config);
        if (sttBaseUrlError) throw new Error(sttBaseUrlError);
        if (config.performance.speakToEdit) {
          selectedTextForEditRef.current = await readSelectedTextForEdit();
          if (
            config.providers.stt.providerId === "openai-realtime" &&
            selectedTextForEditRef.current
          ) {
            throw new Error(
              "OpenAI Realtime is not compatible with Speak to Edit. Choose a batch ASR provider.",
            );
          }
          setNotice({
            text: "Editing selected text. Record the edit instruction.",
            tone: "info",
          });
        }
        const path = await (config.providers.stt.providerId === "openai-realtime"
          ? startStreamingRecording
          : startRecording)();
        dictationStatusRef.current = "recording";
        dispatchDictation({ type: "recording-started", audioPath: path });
        setNotice({
          text: config.performance.speakToEdit
            ? "Editing selected text. Press Stop Speak to Edit to replace it."
            : "Recording to temporary WAV. Press Stop Dictation to transcribe.",
          tone: "info",
        });
        if (
          shortcutModeRef.current === "push-to-talk" &&
          stopAfterStartRef.current
        ) {
          stopAfterStartRef.current = false;
          void dictationToggleRef.current();
        }
        return;
      }

      const audioPath = await stopRecording();
      completedAudioPath = audioPath;
      dictationStatusRef.current = "transcribing";
      dispatchDictation({ type: "recording-stopped" });
      await publishRecorderStateSafely({
        status: "transcribing",
        message: `Transcribing with ${config.providers.stt.providerId}…`,
      });
      setNotice({
        text: "Recording stopped. Running STT and rewrite pipeline.",
        tone: "info",
      });

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
        stt_provider: config.providers.stt.providerId,
        stt_base_url: config.providers.stt.baseUrl ?? null,
        stt_model: config.providers.stt.model,
        rewrite_provider: config.providers.rewrite.providerId,
        rewrite_model: config.providers.rewrite.model,
        selected_text: selectedTextForEditRef.current,
        skip_rewrite:
          config.performance.fastMode && selectedTextForEditRef.current == null,
      };
      let insertedStreaming = false;
      let result: Awaited<ReturnType<typeof runAudioFileDictation>> &
        Partial<Awaited<ReturnType<typeof runStreamingDictation>>>;
      if (
        config.providers.stt.providerId === "openai-realtime" &&
        selectedTextForEditRef.current == null
      ) {
        const streamingResult = await runStreamingDictation({
          ...request,
          streaming_insert: true,
        });
        result = streamingResult;
        insertedStreaming = streamingResult.inserted_streaming;
      } else {
        result = await runAudioFileDictation(request);
      }
      if (result.no_speech) {
        dictationStatusRef.current = "idle";
        dispatchDictation({ type: "reset" });
        await publishRecorderStateSafely({
          status: "idle",
          message: "Ready for dictation.",
        });
        setNotice({ text: "Ready for dictation.", tone: "info" });
        selectedTextForEditRef.current = null;
        return;
      }
      if (!result.fast_path_used) {
        dictationStatusRef.current = "rewriting";
        dispatchDictation({ type: "rewriting" });
        await publishRecorderStateSafely({
          status: "rewriting",
          message: `Rewriting with ${config.providers.rewrite.providerId}…`,
        });
      }
      dictationStatusRef.current = "pasting";
      dispatchDictation({ type: "pasting" });
      await publishRecorderStateSafely({
        status: "pasting",
        message: "Pasting…",
      });
      const completionMessage = insertedStreaming
        ? "Streaming dictation inserted text into the active app."
        : (await copyTextForPaste(result.text)).message;
      dictationStatusRef.current = "done";
      dispatchDictation({
        type: "completed",
        message: completionMessage,
        rewriteFallbackUsed: result.rewrite_fallback_used,
      });
      await refreshUsageEvents();
      setNotice({ text: completionMessage, tone: "info" });
      selectedTextForEditRef.current = null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      dictationStatusRef.current = "error";
      dispatchDictation({ type: "failed", message: errorMessage });
      setNotice({ text: errorMessage, tone: "error" });
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
    if (activeSection !== "profiles") {
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
      setDictionaryTerms(storedDictionary.map(dictionaryRecordToTerm));
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
      setNotice({ text: `Could not load local config: ${error}`, tone: "error" });
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
    setNotice({ text: `Active profile changed to ${profileId}.`, tone: "info" });
  }

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

  async function changeHotkey(
    next: Partial<AppConfig["hotkey"]>,
  ) {
    const hotkey = { ...config.hotkey, ...next };
    if (next.binding) {
      await updateGlobalShortcut(next.binding, config.hotkey.binding);
    }
    setConfig((current) => ({ ...current, hotkey }));
    await persistPreference("hotkey", hotkey);
    setNotice({ text: "Saved", tone: "info" });
  }

  async function changeProviderModel(
    kind: "stt" | "rewrite",
    model: string,
  ) {
    const next = updateProviderModel(config, kind, model);
    setConfig(next);
    await persistPreference("providers", next.providers);
    setNotice({ text: "Saved", tone: "info" });
  }

  async function changeSttProvider(provider: SttProviderId) {
    const next = updateSttProvider(config, provider);
    setConfig(next);
    await persistPreference("providers", next.providers);
    setNotice({ text: "Saved", tone: "info" });
  }

  async function changeRewriteProvider(provider: RewriteProviderId) {
    const next = updateRewriteProvider(config, provider);
    setConfig(next);
    await persistPreference("providers", next.providers);
    setNotice({ text: "Saved", tone: "info" });
  }

  async function changeSttBaseUrl(baseUrl: string) {
    const next = updateSttBaseUrl(config, baseUrl);
    setConfig(next);
    await persistPreference("providers", next.providers);
    setNotice({ text: "Saved", tone: "info" });
  }

  async function changePrivacy(
    key: keyof AppConfig["privacy"],
    enabled: boolean,
  ) {
    const privacy = { ...config.privacy, [key]: enabled };
    setConfig((current) => ({ ...current, privacy }));
    await persistPreference("privacy", privacy);
    setNotice({ text: "Saved", tone: "info" });
  }

  async function changeFastMode(enabled: boolean) {
    const performanceConfig = { ...config.performance, fastMode: enabled };
    setConfig((current) => ({ ...current, performance: performanceConfig }));
    await persistPreference("performance", performanceConfig);
    setNotice({ text: "Saved", tone: "info" });
  }

  async function changeSpeakToEdit(enabled: boolean) {
    const performanceConfig = { ...config.performance, speakToEdit: enabled };
    setConfig((current) => ({ ...current, performance: performanceConfig }));
    await persistPreference("performance", performanceConfig);
    setNotice({ text: "Saved", tone: "info" });
  }

  async function changeAppRouting(enabled: boolean) {
    const appRouting = { enabled };
    setConfig((current) => ({ ...current, appRouting }));
    await persistPreference("app_routing", appRouting);
    setNotice({ text: "Saved", tone: "info" });
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
            <img alt="" src="/favicon.png?v=flat-bars-2" />
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
              onClick={() => navigate(item.id)}
              type="button"
            >
              <item.icon size={17} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-status" aria-label="Application status">
          <span className="sidebar-status-dot" aria-hidden="true" />
          <strong>All systems normal</strong>
          <span>Gospeak is running locally</span>
        </div>
      </aside>

      <section className={`workspace workspace-${activeSection}`}>
        {notice ? (
          <p
            className="app-message"
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        ) : null}

        <div className="module-stage">
          {activeSection === "general" ? (
            <GeneralPage
              config={config}
              keyPresence={keyPresence}
              profiles={profiles}
              usageEvents={usageEvents}
              onOpenProfiles={() => navigate("profiles")}
              onOpenSettings={(tab) => {
                setSettingsTab(tab);
                navigate("settings");
              }}
            />
          ) : null}

          {activeSection === "settings" ? (
            <SettingsPage
              activeTab={settingsTab}
              config={config}
              keyPresence={keyPresence}
              keyDrafts={keyDrafts}
              onTabChange={setSettingsTab}
              onKeyDraftChange={(provider, value) =>
                setKeyDrafts((current) => ({ ...current, [provider]: value }))
              }
              onSaveKey={(provider, key) => void saveKey(provider, key)}
              onRefreshKeys={() => void refreshKeys()}
              onChangeHotkey={(next) => void changeHotkey(next)}
              onChangeProviderModel={(kind, model) =>
                void changeProviderModel(kind, model)
              }
              onChangeSttProvider={(provider) =>
                void changeSttProvider(provider)
              }
              onChangeRewriteProvider={(provider) =>
                void changeRewriteProvider(provider)
              }
              onChangeSttBaseUrl={(baseUrl) =>
                void changeSttBaseUrl(baseUrl)
              }
              onChangePrivacy={(key, enabled) =>
                void changePrivacy(key, enabled)
              }
              onChangeFastMode={(enabled) => void changeFastMode(enabled)}
              onChangeSpeakToEdit={(enabled) => void changeSpeakToEdit(enabled)}
              onChangeAppRouting={(enabled) => void changeAppRouting(enabled)}
              onExport={() => void exportConfiguration()}
              onImport={() => void importConfiguration()}
            />
          ) : null}

          {activeSection === "profiles" ? (
            <ProfilesPage
              activeProfileId={config.activeProfileId}
              appRules={appRules}
              foregroundContext={foregroundContext}
              onDeleteProfile={(profile) => void deleteProfile(profile)}
              onDeleteRule={(rule) => void deleteAppRule(rule)}
              onDirtyChange={setProfileDirty}
              onSaveProfile={(profile) => void saveProfile(profile)}
              onSaveRule={(rule) => void saveAppRule(rule)}
              onSetActive={(profileId) => void changeActiveProfile(profileId)}
              profiles={profiles}
            />
          ) : null}

          {activeSection === "dictionary" ? (
            <DictionaryPage
              onDeleteTerm={(term) => void deleteDictionaryTerm(term)}
              onSaveTerm={saveDictionaryTerm}
              onToggleTerm={(term, enabled) => void toggleDictionaryTerm(term, enabled)}
              terms={dictionaryTerms}
            />
          ) : null}

        </div>
      </section>
    </main>
  );
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

export default App;
