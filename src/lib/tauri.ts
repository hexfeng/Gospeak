import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type {
  ApiKeyPresence,
  AppProfileRule,
  ConfigExportPayload,
  ForegroundAppContext,
} from "../domain/config";

export type ProviderRuntimeConfig = {
  stt_provider: "groq";
  stt_model: string;
  rewrite_provider: "openai";
  rewrite_model: string;
};

export type AudioFilePipelineRequest = {
  audio_path: string;
  profile_id: string;
  stt_model: string;
  rewrite_model: string;
  selected_text: string | null;
  skip_rewrite: boolean;
};

export type PipelineResult = {
  text: string;
  profile_id: string;
  rewrite_fallback_used: boolean;
  stt_latency_ms: number;
  rewrite_latency_ms?: number | null;
  audio_seconds?: number | null;
  audio_file_bytes?: number | null;
  fast_path_used?: boolean;
  rewrite_input_tokens?: number | null;
  rewrite_output_tokens?: number | null;
};

export type StreamingPipelineRequest = AudioFilePipelineRequest & {
  streaming_insert: boolean;
};

export type StreamingPipelineResult = PipelineResult & {
  streaming_used: boolean;
  inserted_streaming: boolean;
  first_stt_delta_ms?: number | null;
  first_rewrite_delta_ms?: number | null;
  first_insert_ms?: number | null;
  warning?: string | null;
};

export type ClipboardResult = {
  copied: boolean;
  paste_attempted?: boolean;
  pasteAttempted?: boolean;
  message: string;
};

export type ProfileRecord = {
  id: string;
  name: string;
  mode: string;
  system_prompt: string;
  user_prompt_template: string;
  target_language?: string | null;
  enabled: boolean;
  updated_at: string;
  deleted_at?: string | null;
};

export type DictionaryRecord = {
  id: string;
  spoken: string;
  written: string;
  aliases_json: string;
  tags_json: string;
  enabled: boolean;
  updated_at: string;
  deleted_at?: string | null;
};

export type PreferenceRecord = {
  key: string;
  value: string;
  updated_at: string;
};

export type AppProfileRuleRecord = {
  id: string;
  appId: string;
  windowTitlePattern?: string | null;
  profileId: string;
  priority: number;
  enabled: boolean;
  updatedAt: string;
  deletedAt?: string | null;
};

export type UsageEventRecord = {
  id: string;
  stt_provider: string;
  stt_model: string;
  llm_provider: string;
  llm_model: string;
  profile_id: string;
  audio_seconds?: number | null;
  stt_latency_ms: number;
  rewrite_latency_ms?: number | null;
  rewrite_fallback_used: boolean;
  stt_estimated_cost?: number | null;
  rewrite_estimated_cost?: number | null;
  estimated_cost?: number | null;
  created_at: string;
};

export type ForegroundAppContextRecord = {
  appId?: string | null;
  windowTitle?: string | null;
};

function hasTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export async function checkProviderKeys(): Promise<ApiKeyPresence> {
  if (!hasTauriRuntime()) {
    return { groq: false, openai: false };
  }

  return invoke<ApiKeyPresence>("check_provider_keys");
}

export async function saveProviderApiKey(
  provider: "groq" | "openai",
  apiKey: string,
): Promise<ApiKeyPresence> {
  if (!hasTauriRuntime()) {
    return {
      groq: provider === "groq",
      openai: provider === "openai",
    };
  }

  return invoke<ApiKeyPresence>("save_provider_api_key", {
    provider,
    apiKey,
  });
}

export async function startRecording(): Promise<string> {
  if (!hasTauriRuntime()) {
    return "browser-preview-gospeak.wav";
  }

  return invoke<string>("start_recording");
}

export async function startStreamingRecording(): Promise<string> {
  if (!hasTauriRuntime()) {
    return "browser-preview-gospeak.wav";
  }

  return invoke<string>("start_streaming_recording");
}

export async function stopRecording(): Promise<string> {
  if (!hasTauriRuntime()) {
    return "browser-preview-gospeak.wav";
  }

  return invoke<string>("stop_recording");
}

export async function runAudioFileDictation(
  request: AudioFilePipelineRequest,
): Promise<PipelineResult> {
  if (!hasTauriRuntime()) {
    return {
      text: "Browser preview dictation text.",
      profile_id: request.profile_id,
      rewrite_fallback_used: false,
      stt_latency_ms: 100,
      rewrite_latency_ms: 80,
      audio_seconds: 1,
      audio_file_bytes: 32000,
      fast_path_used: request.skip_rewrite,
    };
  }

  return invoke<PipelineResult>("run_audio_file_dictation", { request });
}

export async function runStreamingDictation(
  request: StreamingPipelineRequest,
): Promise<StreamingPipelineResult> {
  if (!hasTauriRuntime()) {
    return {
      text: "Browser preview streaming dictation text.",
      profile_id: request.profile_id,
      rewrite_fallback_used: false,
      stt_latency_ms: 80,
      rewrite_latency_ms: 60,
      audio_seconds: 1,
      audio_file_bytes: 32000,
      fast_path_used: request.skip_rewrite,
      streaming_used: true,
      inserted_streaming: request.streaming_insert,
      first_stt_delta_ms: 120,
      first_rewrite_delta_ms: 180,
      first_insert_ms: request.streaming_insert ? 220 : null,
    };
  }

  return invoke<StreamingPipelineResult>("run_streaming_dictation", { request });
}

export async function typeTextChunk(text: string): Promise<void> {
  if (!hasTauriRuntime()) {
    return;
  }

  return invoke<void>("type_text_chunk", { text });
}

export async function readSelectedTextForEdit(): Promise<string> {
  if (!hasTauriRuntime()) {
    return "Browser preview selected text.";
  }

  return invoke<string>("read_selected_text_for_edit");
}

export async function copyTextForPaste(text: string): Promise<ClipboardResult> {
  if (!hasTauriRuntime()) {
    return {
      copied: true,
      pasteAttempted: false,
      message: "Text copied to clipboard.",
    };
  }

  return invoke<ClipboardResult>("copy_text_for_paste", { text });
}

export async function cleanupTempAudioFile(path: string): Promise<boolean> {
  if (!hasTauriRuntime()) {
    return true;
  }

  return invoke<boolean>("cleanup_temp_audio_file", { path });
}

export async function listenForGlobalShortcut(
  handler: (state: "pressed" | "released") => void,
): Promise<() => void> {
  if (!hasTauriRuntime()) {
    return () => {};
  }

  return listen<{ state: "pressed" | "released" }>(
    "gospeak://global-shortcut",
    (event) => handler(event.payload.state),
  );
}

export async function updateGlobalShortcut(
  binding: string,
  previousBinding?: string,
): Promise<void> {
  if (!hasTauriRuntime()) {
    return;
  }
  return invoke<void>("update_global_shortcut", { binding, previousBinding });
}

export async function listPreferences(): Promise<PreferenceRecord[]> {
  if (!hasTauriRuntime()) {
    return [];
  }
  return invoke<PreferenceRecord[]>("list_preferences");
}

export async function upsertPreference(record: PreferenceRecord): Promise<void> {
  if (!hasTauriRuntime()) {
    return;
  }
  return invoke<void>("upsert_preference", { record });
}

export async function getForegroundAppContext(): Promise<ForegroundAppContext> {
  if (!hasTauriRuntime()) {
    return {
      appId: "browser-preview.exe",
      windowTitle: document.title || "Gospeak browser preview",
    };
  }

  const record = await invoke<ForegroundAppContextRecord>(
    "get_foreground_app_context",
  );
  return foregroundAppContextRecordToContext(record);
}

export async function listAppProfileRules(): Promise<AppProfileRule[]> {
  if (!hasTauriRuntime()) {
    return [];
  }

  const records = await invoke<AppProfileRuleRecord[]>("list_app_profile_rules");
  return records.map(appProfileRuleRecordToRule);
}

export async function listUsageEvents(): Promise<UsageEventRecord[]> {
  if (!hasTauriRuntime()) {
    return [];
  }

  return invoke<UsageEventRecord[]>("list_usage_events");
}

export async function upsertAppProfileRule(input: {
  record: AppProfileRule;
}): Promise<void> {
  if (!hasTauriRuntime()) {
    return;
  }

  return invoke<void>("upsert_app_profile_rule", {
    record: appProfileRuleToRecord(input.record),
  });
}

export function appProfileRuleRecordToRule(
  record: AppProfileRuleRecord,
): AppProfileRule {
  return {
    id: record.id,
    appId: record.appId,
    windowTitlePattern: record.windowTitlePattern ?? null,
    profileId: record.profileId,
    priority: record.priority,
    enabled: record.enabled,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt ?? null,
  };
}

export function appProfileRuleToRecord(
  rule: AppProfileRule,
): AppProfileRuleRecord {
  return {
    id: rule.id,
    appId: rule.appId,
    windowTitlePattern: rule.windowTitlePattern ?? null,
    profileId: rule.profileId,
    priority: rule.priority,
    enabled: rule.enabled,
    updatedAt: rule.updatedAt,
    deletedAt: rule.deletedAt ?? null,
  };
}

export function foregroundAppContextRecordToContext(
  record: ForegroundAppContextRecord,
): ForegroundAppContext {
  return {
    appId: record.appId ?? null,
    windowTitle: record.windowTitle ?? null,
  };
}

export async function listProfiles(): Promise<ProfileRecord[]> {
  if (!hasTauriRuntime()) {
    return [];
  }

  return invoke<ProfileRecord[]>("list_profiles");
}

export async function upsertProfile(record: ProfileRecord): Promise<void> {
  if (!hasTauriRuntime()) {
    return;
  }

  return invoke<void>("upsert_profile", { record });
}

export async function listDictionaryTerms(): Promise<DictionaryRecord[]> {
  if (!hasTauriRuntime()) {
    return [];
  }

  return invoke<DictionaryRecord[]>("list_dictionary_terms");
}

export async function upsertDictionaryTerm(
  record: DictionaryRecord,
): Promise<void> {
  if (!hasTauriRuntime()) {
    return;
  }

  return invoke<void>("upsert_dictionary_term", { record });
}

export async function exportConfigToFile(
  path: string,
  payload: ConfigExportPayload,
): Promise<void> {
  if (!hasTauriRuntime()) {
    return;
  }

  return invoke<void>("export_config_to_file", { path, payload });
}

export async function importConfigFromFile(
  path: string,
): Promise<ConfigExportPayload> {
  if (!hasTauriRuntime()) {
    throw new Error("Import is only available in the Tauri runtime.");
  }

  return invoke<ConfigExportPayload>("import_config_from_file", { path });
}

export async function selectExportPath(): Promise<string | null> {
  if (!hasTauriRuntime()) {
    return null;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    defaultPath: "gospeak-config.json",
    filters: [{ name: "JSON configuration", extensions: ["json"] }],
  });
}

export async function selectImportPath(): Promise<string | null> {
  if (!hasTauriRuntime()) {
    return null;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "JSON configuration", extensions: ["json"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function publishRecorderState(payload: {
  status: string;
  message: string;
}): Promise<void> {
  if (!hasTauriRuntime()) {
    return;
  }
  await emit("gospeak://recorder-state", payload);
  const recorder = await WebviewWindow.getByLabel("recorder");
  if (!recorder) {
    return;
  }
  if (payload.status === "idle" || payload.status === "done") {
    await recorder.hide();
  } else {
    await recorder.show();
  }
}

export async function listenForTrayAction(
  handler: (action: string) => void,
): Promise<() => void> {
  if (!hasTauriRuntime()) {
    return () => {};
  }
  return listen<string>("gospeak://tray-action", (event) =>
    handler(event.payload),
  );
}
