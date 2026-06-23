import { invoke } from "@tauri-apps/api/core";
import type { ApiKeyPresence, ConfigExportPayload } from "../domain/config";

export type ProviderRuntimeConfig = {
  stt_provider: "groq";
  stt_model: string;
  rewrite_provider: "openai";
  rewrite_model: string;
};

export type AudioFilePipelineRequest = {
  config: ProviderRuntimeConfig;
  audio_path: string;
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
): Promise<string> {
  if (!hasTauriRuntime()) {
    return "Browser preview dictation text.";
  }

  return invoke<string>("run_audio_file_dictation", { request });
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
  handler: () => void,
): Promise<() => void> {
  if (!hasTauriRuntime()) {
    return () => {};
  }

  const { listen } = await import("@tauri-apps/api/event");
  return listen("gospeak://global-shortcut", () => handler());
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
