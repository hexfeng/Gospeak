import { useEffect, useReducer, useRef, useState } from "react";
import {
  BookMarked,
  House,
  ServerCog,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import "./App.css";
import { DictionaryPage } from "./components/DictionaryPage";
import { GeneralPage } from "./components/GeneralPage";
import { ProfilesPage } from "./components/ProfilesPage";
import { ProvidersPage } from "./components/ProvidersPage";
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
  applyStoredPreferences,
  buildExportPayload,
  resolveActiveProfileId,
  resolveProfileForContext,
  validateSttBaseUrl,
} from "./domain/config";
import {
  DICTATION_INITIAL_STATE,
  dictationReducer,
} from "./domain/dictation";
import type { AppSection } from "./domain/navigation";
import {
  activateProviderConfiguration,
  activeProviderPair,
  addLegacyCredentialConfigurations,
  deleteProviderConfiguration,
  migrateProviderConfigurations,
  upsertProviderConfiguration,
  type ConfigurationKeyPresence,
  type ProviderConfiguration,
  type ProviderConfigurationState,
} from "./domain/providerConfigurations";
import {
  checkProviderConfigurationKeys,
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
  migrateProviderConfigurationApiKey,
  publishRecorderState,
  readSelectedTextForEdit,
  removeProviderApiKey,
  removeProviderConfigurationApiKey,
  runAudioFileDictation,
  runStreamingDictation,
  saveProviderConfigurationApiKey,
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
    type: "technical-term",
    aliases: ["agent 安全", "agent security project"],
    tags: ["work", "ai"],
    enabled: true,
    updatedAt: "2026-06-21T10:00:00.000Z",
  },
  {
    id: "dict_runtime_monitoring",
    spoken: "runtime monitoring",
    written: "runtime monitoring",
    type: "technical-term",
    aliases: ["运行时监控"],
    tags: ["engineering"],
    enabled: true,
    updatedAt: "2026-06-21T10:00:00.000Z",
  },
];

const navItems = [
  { id: "general", label: "General", icon: House },
  { id: "providers", label: "Providers", icon: ServerCog },
  { id: "profiles", label: "Profiles", icon: SlidersHorizontal },
  { id: "dictionary", label: "Dictionary", icon: BookMarked },
  { id: "settings", label: "Settings", icon: Settings },
] satisfies Array<{ id: AppSection; label: string; icon: typeof Settings }>;

type AppNotice = { text: string; tone: "info" | "error" } | null;

function App() {
  const [activeSection, setActiveSection] = useState<AppSection>("general");
  const [providerFocus, setProviderFocus] = useState<{
    kind: ProviderConfiguration["kind"];
    configurationId: string;
    requestId: number;
  }>();
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [providerState, setProviderState] = useState<ProviderConfigurationState>(
    () => migrateProviderConfigurations(DEFAULT_APP_CONFIG.providers),
  );
  const [configurationKeyPresence, setConfigurationKeyPresence] =
    useState<ConfigurationKeyPresence>({});
  const [keyPresence, setKeyPresence] = useState<ApiKeyPresence>({
    groq: false,
    openai: false,
  });
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
      term_type: term.type,
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
      term_type: term.type,
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
    const importedConfig = applyStoredPreferences(DEFAULT_APP_CONFIG, {
        providers: JSON.stringify(payload.data.providers),
        hotkey: JSON.stringify(payload.data.hotkey),
        privacy: JSON.stringify(payload.data.privacy),
        performance: JSON.stringify(payload.data.performance),
        app_routing: JSON.stringify(payload.data.appRouting),
        active_profile_id: payload.data.activeProfileId,
      });
    const importedProvidersJson = JSON.stringify(payload.data.providers);
    const importedProviderState = parseStoredProviderState(
      importedProvidersJson,
      importedConfig.providers,
    );
    if (!storedProviderState(importedProvidersJson)) {
      await migrateLegacyConfigurationKeys(importedProviderState);
    }
    const activeProviders = activeProviderPair(importedProviderState);
    const importedPresence = await loadConfigurationKeyPresence(importedProviderState);
    const legacyPresence = await checkProviderKeys();
    setProviderState(importedProviderState);
    setConfigurationKeyPresence(importedPresence);
    setKeyPresence(
      mergeActiveConfigurationPresence(
        legacyPresence,
        importedProviderState,
        importedPresence,
      ),
    );
    setConfig({
      ...importedConfig,
      providers: {
        stt: {
          providerId: activeProviders.stt.providerId,
          model: activeProviders.stt.model,
          ...(activeProviders.stt.baseUrl !== undefined
            ? { baseUrl: activeProviders.stt.baseUrl }
            : {}),
        },
        rewrite: {
          providerId: activeProviders.rewrite.providerId,
          model: activeProviders.rewrite.model,
        },
      },
    });
    setProfiles(payload.data.promptProfiles);
    setDictionaryTerms(
      payload.data.dictionaryTerms.map((term) => ({
        ...term,
        type: term.type ?? "other",
      })),
    );
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
        stt_config_id: providerState.activeAsrConfigId,
        stt_base_url: config.providers.stt.baseUrl ?? null,
        stt_model: config.providers.stt.model,
        rewrite_provider: config.providers.rewrite.providerId,
        rewrite_config_id: providerState.activeRewriteConfigId,
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
      const existingProviderState = storedProviderState(preferences.providers);
      const parsedProviderState = parseStoredProviderState(
        preferences.providers,
        nextConfig.providers,
      );
      const nextProviderState = existingProviderState
        ? parsedProviderState
        : addLegacyCredentialConfigurations(
            parsedProviderState,
            storedKeyPresence,
          );
      if (!existingProviderState) {
        await migrateLegacyConfigurationKeys(nextProviderState);
      }
      const nextConfigurationKeyPresence = await loadConfigurationKeyPresence(
        nextProviderState,
      );
      if (disposed) return;
      const activeProviders = activeProviderPair(nextProviderState);
      const configWithActiveProviders: AppConfig = {
        ...nextConfig,
        providers: {
          stt: {
            providerId: activeProviders.stt.providerId,
            model: activeProviders.stt.model,
            ...(activeProviders.stt.baseUrl !== undefined
              ? { baseUrl: activeProviders.stt.baseUrl }
              : {}),
          },
          rewrite: {
            providerId: activeProviders.rewrite.providerId,
            model: activeProviders.rewrite.model,
          },
        },
      };
      if (hasLegacyStreamingPreference(preferences.performance)) {
        await Promise.all([
          persistPreference(
            "providers",
            providerPreference(nextProviderState),
          ),
          persistPreference("performance", nextConfig.performance),
        ]);
      }
      if (!existingProviderState) {
        await persistPreference("providers", providerPreference(nextProviderState));
      }
      setProviderState(nextProviderState);
      setConfigurationKeyPresence(nextConfigurationKeyPresence);
      setKeyPresence(
        mergeActiveConfigurationPresence(
          storedKeyPresence,
          nextProviderState,
          nextConfigurationKeyPresence,
        ),
      );
      setConfig({
        ...configWithActiveProviders,
        activeProfileId: resolveActiveProfileId(
          configWithActiveProviders.activeProfileId,
          enabledProfileIds(mappedProfiles),
        ),
      });
      if (configWithActiveProviders.hotkey.binding !== DEFAULT_APP_CONFIG.hotkey.binding) {
        await updateGlobalShortcut(
          configWithActiveProviders.hotkey.binding,
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
    await persistPreference("active_profile_id", profileId);
    setConfig((current) => ({ ...current, activeProfileId: profileId }));
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

  function openActiveProvider(kind: ProviderConfiguration["kind"]) {
    const active = activeProviderPair(providerState);
    setProviderFocus({
      kind,
      configurationId: kind === "stt" ? active.stt.id : active.rewrite.id,
      requestId: Date.now(),
    });
    navigate("providers");
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

  async function persistProviderState(next: ProviderConfigurationState) {
    const active = activeProviderPair(next);
    const providers: AppConfig["providers"] = {
      stt: {
        providerId: active.stt.providerId,
        model: active.stt.model,
        ...(active.stt.baseUrl !== undefined ? { baseUrl: active.stt.baseUrl } : {}),
      },
      rewrite: {
        providerId: active.rewrite.providerId,
        model: active.rewrite.model,
      },
    };
    await persistPreference("providers", providerPreference(next));
    setProviderState(next);
    setConfig((current) => ({ ...current, providers }));
  }

  async function refreshProviderConfigurationKeys(
    state = providerState,
    announce = true,
  ) {
    const presence = await loadConfigurationKeyPresence(state);
    const legacyPresence = await checkProviderKeys();
    setConfigurationKeyPresence(presence);
    setKeyPresence(
      mergeActiveConfigurationPresence(legacyPresence, state, presence),
    );
    if (announce) {
      setNotice({
        text: "Local Provider status refreshed without exposing key values.",
        tone: "info",
      });
    }
  }

  async function saveProviderConfiguration(
    configuration: ProviderConfiguration,
    apiKey?: string,
  ) {
    const existing = providerState.configurations.find(
      (item) => item.id === configuration.id,
    );
    const next = upsertProviderConfiguration(providerState, configuration);
    const credentialProvider = credentialProviderForConfiguration(configuration);
    if (existing && existing.providerId !== configuration.providerId) {
      const oldProvider = credentialProviderForConfiguration(existing);
      if (oldProvider) {
        await removeProviderConfigurationApiKey(configuration.id, oldProvider);
      }
    }
    if (apiKey && credentialProvider) {
      await saveProviderConfigurationApiKey(
        configuration.id,
        credentialProvider,
        apiKey,
      );
    }
    await persistProviderState(next);
    await refreshProviderConfigurationKeys(next, false);
    setNotice({ text: `Provider configuration saved: ${configuration.name}`, tone: "info" });
  }

  async function activateConfiguration(configurationId: string) {
    const next = activateProviderConfiguration(providerState, configurationId);
    await persistProviderState(next);
    await refreshProviderConfigurationKeys(next, false);
    setNotice({ text: "Active Provider configuration updated.", tone: "info" });
  }

  async function removeProviderConfigurationKey(configuration: ProviderConfiguration) {
    const provider = credentialProviderForConfiguration(configuration);
    if (provider) {
      await removeProviderConfigurationApiKey(configuration.id, provider);
    }
    await refreshProviderConfigurationKeys(providerState, false);
    setNotice({ text: `Saved key removed from ${configuration.name}.`, tone: "info" });
  }

  async function deleteConfiguration(configuration: ProviderConfiguration) {
    const next = deleteProviderConfiguration(providerState, configuration.id);
    const provider = credentialProviderForConfiguration(configuration);
    if (provider) {
      await removeProviderConfigurationApiKey(configuration.id, provider);
    }
    try {
      await persistProviderState(next);
    } catch (error) {
      await refreshProviderConfigurationKeys(providerState, false);
      throw error;
    }
    await refreshProviderConfigurationKeys(next, false);
    setNotice({ text: `Provider configuration deleted: ${configuration.name}`, tone: "info" });
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
    providerState,
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
              onOpenProviders={openActiveProvider}
            />
          ) : null}

          {activeSection === "providers" ? (
            <ProvidersPage
              focus={providerFocus}
              keyPresence={configurationKeyPresence}
              onActivate={activateConfiguration}
              onDelete={deleteConfiguration}
              onRefresh={() => refreshProviderConfigurationKeys()}
              onRemoveKey={removeProviderConfigurationKey}
              onSave={saveProviderConfiguration}
              state={providerState}
            />
          ) : null}

          {activeSection === "settings" ? (
            <SettingsPage
              config={config}
              onChangeHotkey={(next) => void changeHotkey(next)}
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
              onDeleteProfile={deleteProfile}
              onDeleteRule={deleteAppRule}
              onDirtyChange={setProfileDirty}
              onSaveProfile={saveProfile}
              onSaveRule={saveAppRule}
              onSetActive={changeActiveProfile}
              profiles={profiles}
            />
          ) : null}

          {activeSection === "dictionary" ? (
            <DictionaryPage
              onDeleteTerm={deleteDictionaryTerm}
              onSaveTerm={saveDictionaryTerm}
              onToggleTerm={toggleDictionaryTerm}
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
    type: record.term_type ?? "other",
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

function hasLegacyStreamingPreference(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.prototype.hasOwnProperty.call(parsed, "streamingMode");
  } catch {
    return false;
  }
}

type StoredProviderPreference = AppConfig["providers"] &
  Partial<ProviderConfigurationState>;

function storedProviderState(value: string | undefined): ProviderConfigurationState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredProviderPreference>;
    if (
      !Array.isArray(parsed.configurations) ||
      typeof parsed.activeAsrConfigId !== "string" ||
      typeof parsed.activeRewriteConfigId !== "string" ||
      parsed.activeAsrConfigId === parsed.activeRewriteConfigId ||
      parsed.configurations.some(
        (configuration) =>
          !configuration ||
          typeof configuration !== "object" ||
          typeof configuration.id !== "string" ||
          !configuration.id.trim(),
      ) ||
      new Set(parsed.configurations.map((configuration) => configuration.id)).size !==
        parsed.configurations.length
    ) {
      return null;
    }
    const state = {
      configurations: parsed.configurations,
      activeAsrConfigId: parsed.activeAsrConfigId,
      activeRewriteConfigId: parsed.activeRewriteConfigId,
    };
    activeProviderPair(state);
    return state;
  } catch {
    return null;
  }
}

function parseStoredProviderState(
  value: string | undefined,
  providers: AppConfig["providers"],
) {
  const stored = storedProviderState(value);
  return stored ?? migrateProviderConfigurations(providers);
}

function providerPreference(state: ProviderConfigurationState): StoredProviderPreference {
  const active = activeProviderPair(state);
  return {
    stt: {
      providerId: active.stt.providerId,
      model: active.stt.model,
      ...(active.stt.baseUrl !== undefined ? { baseUrl: active.stt.baseUrl } : {}),
    },
    rewrite: {
      providerId: active.rewrite.providerId,
      model: active.rewrite.model,
    },
    ...state,
  };
}

function credentialProviderForConfiguration(
  configuration: ProviderConfiguration,
): CredentialProviderId | null {
  if (configuration.providerId === "qwen-local") return null;
  if (configuration.providerId === "openai-realtime") return "openai";
  return configuration.providerId as CredentialProviderId;
}

async function loadConfigurationKeyPresence(state: ProviderConfigurationState) {
  return checkProviderConfigurationKeys(
    state.configurations.flatMap((configuration) => {
      const provider = credentialProviderForConfiguration(configuration);
      return provider ? [{ configId: configuration.id, provider }] : [];
    }),
  );
}

async function migrateLegacyConfigurationKeys(state: ProviderConfigurationState) {
  const byProvider = new Map<CredentialProviderId, string[]>();
  for (const configuration of state.configurations) {
    const provider = credentialProviderForConfiguration(configuration);
    if (!provider) continue;
    byProvider.set(provider, [...(byProvider.get(provider) ?? []), configuration.id]);
  }
  await Promise.all(
    [...byProvider].map(async ([provider, configIds]) => {
      await Promise.all(
        configIds.map((configId) => migrateProviderConfigurationApiKey(configId, provider)),
      );
      await removeProviderApiKey(provider);
    }),
  );
}

function mergeActiveConfigurationPresence(
  _legacy: ApiKeyPresence,
  state: ProviderConfigurationState,
  configurationPresence: ConfigurationKeyPresence,
): ApiKeyPresence {
  const active = activeProviderPair(state);
  const next: ApiKeyPresence = {};
  for (const configuration of [active.stt, active.rewrite]) {
    const provider = credentialProviderForConfiguration(configuration);
    if (provider && configurationPresence[configuration.id]) {
      next[provider] = true;
    }
  }
  return next;
}

export default App;
