import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { ApiKeyPresence, ConfigExportPayload } from "../domain/config";

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
