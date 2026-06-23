export type ProviderKind = "stt" | "rewrite";

export type ProviderId = "groq" | "openai";

export type ProviderConfig = {
  providerId: ProviderId;
  model: string;
};

export type PromptProfile = {
  id: string;
  name: string;
  mode: "normal" | "email" | "prompt" | "translate";
  systemPrompt: string;
  userPromptTemplate: string;
  targetLanguage?: string;
  enabled: boolean;
  updatedAt: string;
};

export type DictionaryTerm = {
  id: string;
  spoken: string;
  written: string;
  aliases: string[];
  tags: string[];
  enabled: boolean;
  updatedAt: string;
};

export type AppConfig = {
  providers: Record<ProviderKind, ProviderConfig>;
  hotkey: {
    binding: string;
    mode: "push-to-talk" | "toggle";
  };
  privacy: {
    saveRawAudio: boolean;
    saveTranscriptHistory: boolean;
    syncTranscriptHistory: boolean;
    crashReportIncludesTranscript: boolean;
  };
  activeProfileId: string;
  promptProfiles: PromptProfile[];
};

export type ApiKeyPresence = Partial<Record<ProviderId, boolean>>;

export type TranscriptHistoryItem = {
  rawTranscript: string;
  polishedText: string;
};

export type ConfigExportPayload = {
  schemaVersion: 1;
  exportedAt: string;
  data: {
    providers: AppConfig["providers"];
    hotkey: AppConfig["hotkey"];
    privacy: AppConfig["privacy"];
    activeProfileId: string;
    promptProfiles: PromptProfile[];
    dictionaryTerms: DictionaryTerm[];
  };
};

const now = "2026-06-21T00:00:00.000Z";

export const DEFAULT_APP_CONFIG: AppConfig = {
  providers: {
    stt: {
      providerId: "groq",
      model: "whisper-large-v3-turbo",
    },
    rewrite: {
      providerId: "openai",
      model: "gpt-5-nano",
    },
  },
  hotkey: {
    binding: "Alt+Space",
    mode: "push-to-talk",
  },
  privacy: {
    saveRawAudio: false,
    saveTranscriptHistory: false,
    syncTranscriptHistory: false,
    crashReportIncludesTranscript: false,
  },
  activeProfileId: "normal",
  promptProfiles: [
    {
      id: "normal",
      name: "Normal",
      mode: "normal",
      systemPrompt:
        "Clean the transcript into natural written text without adding facts.",
      userPromptTemplate:
        "Transcript:\n{{transcript}}\n\nDictionary terms:\n{{dictionaryTerms}}",
      enabled: true,
      updatedAt: now,
    },
    {
      id: "email",
      name: "Email",
      mode: "email",
      systemPrompt: "Rewrite the transcript as a concise professional email.",
      userPromptTemplate:
        "Transcript:\n{{transcript}}\n\nKeep factual details intact.",
      enabled: true,
      updatedAt: now,
    },
    {
      id: "prompt",
      name: "Prompt",
      mode: "prompt",
      systemPrompt:
        "Convert the transcript into a clear instruction for an AI assistant.",
      userPromptTemplate:
        "Transcript:\n{{transcript}}\n\nStructure the output with goal, context, constraints, and expected output.",
      enabled: true,
      updatedAt: now,
    },
    {
      id: "translate",
      name: "Translate",
      mode: "translate",
      systemPrompt:
        "Translate the transcript into the target language while preserving proper nouns.",
      userPromptTemplate:
        "Target language: {{targetLanguage}}\nTranscript:\n{{transcript}}",
      targetLanguage: "English",
      enabled: true,
      updatedAt: now,
    },
  ],
};

export function updateProviderModel(
  config: AppConfig,
  kind: ProviderKind,
  model: string,
): AppConfig {
  return {
    ...config,
    providers: {
      ...config.providers,
      [kind]: {
        ...config.providers[kind],
        model,
      },
    },
  };
}

export function buildExportPayload(input: {
  config: AppConfig;
  dictionaryTerms: DictionaryTerm[];
  apiKeyPresence?: ApiKeyPresence;
  transcriptHistory?: TranscriptHistoryItem[];
}): ConfigExportPayload {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {
      providers: input.config.providers,
      hotkey: input.config.hotkey,
      privacy: input.config.privacy,
      activeProfileId: input.config.activeProfileId,
      promptProfiles: input.config.promptProfiles,
      dictionaryTerms: input.dictionaryTerms,
    },
  };
}

export function getProviderReadiness(
  config: AppConfig,
  keyPresence: ApiKeyPresence,
) {
  const sttKey = keyPresence[config.providers.stt.providerId] === true;
  const rewriteKey = keyPresence[config.providers.rewrite.providerId] === true;

  return {
    stt: sttKey
      ? { ready: true as const }
      : {
          ready: false as const,
          reason: "Groq API key is missing. Configure it before live STT.",
        },
    rewrite: rewriteKey
      ? { ready: true as const }
      : {
          ready: false as const,
          reason:
            "OpenAI API key is missing. Configure it before live rewrite.",
        },
  };
}
