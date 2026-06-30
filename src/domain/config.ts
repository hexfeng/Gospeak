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

export type ForegroundAppContext = {
  appId?: string | null;
  windowTitle?: string | null;
};

export type AppProfileRule = {
  id: string;
  appId: string;
  windowTitlePattern?: string | null;
  profileId: string;
  priority: number;
  enabled: boolean;
  updatedAt: string;
  deletedAt?: string | null;
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
  performance: {
    fastMode: boolean;
  };
  appRouting: {
    enabled: boolean;
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
    performance: AppConfig["performance"];
    appRouting: AppConfig["appRouting"];
    activeProfileId: string;
    promptProfiles: PromptProfile[];
    dictionaryTerms: DictionaryTerm[];
    appRules: AppProfileRule[];
  };
};

export type ProviderPricingRow =
  | {
      providerId: "groq";
      model: string;
      kind: "stt";
      pricePerHourUsd: number;
      sourceLabel: string;
    }
  | {
      providerId: "openai";
      model: string;
      kind: "rewrite";
      inputPerMillionUsd: number;
      outputPerMillionUsd: number;
      sourceLabel: string;
    };

export const PRICING_SNAPSHOT_DATE = "2026-06-30";

export const PROVIDER_PRICING: ProviderPricingRow[] = [
  {
    providerId: "groq",
    model: "whisper-large-v3-turbo",
    kind: "stt",
    pricePerHourUsd: 0.04,
    sourceLabel: "Groq pricing",
  },
  {
    providerId: "groq",
    model: "whisper-large-v3",
    kind: "stt",
    pricePerHourUsd: 0.111,
    sourceLabel: "Groq pricing",
  },
  {
    providerId: "openai",
    model: "gpt-5-nano",
    kind: "rewrite",
    inputPerMillionUsd: 0.05,
    outputPerMillionUsd: 0.4,
    sourceLabel: "OpenAI pricing",
  },
  {
    providerId: "openai",
    model: "gpt-5-mini",
    kind: "rewrite",
    inputPerMillionUsd: 0.25,
    outputPerMillionUsd: 2,
    sourceLabel: "OpenAI pricing",
  },
];

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
  performance: {
    fastMode: false,
  },
  appRouting: {
    enabled: false,
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
  appRules?: AppProfileRule[];
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
      performance: input.config.performance,
      appRouting: input.config.appRouting,
      activeProfileId: input.config.activeProfileId,
      promptProfiles: input.config.promptProfiles,
      dictionaryTerms: input.dictionaryTerms,
      appRules: input.appRules ?? [],
    },
  };
}

export function resolveProfileForContext(input: {
  activeProfileId: string;
  enabledProfileIds?: string[];
  context: ForegroundAppContext | null | undefined;
  rules: AppProfileRule[];
}): { profileId: string; matchedRuleId: string | null } {
  const fallbackProfileId = resolveActiveProfileId(
    input.activeProfileId,
    input.enabledProfileIds,
  );
  const appId = normalize(input.context?.appId);
  const windowTitle = normalize(input.context?.windowTitle);
  const matchedRule = input.rules
    .filter((rule) => rule.enabled && !rule.deletedAt)
    .filter(
      (rule) =>
        !input.enabledProfileIds ||
        input.enabledProfileIds.includes(rule.profileId),
    )
    .filter((rule) => {
      const ruleAppId = normalize(rule.appId);
      const ruleTitle = normalize(rule.windowTitlePattern);
      if (!ruleAppId) {
        return false;
      }
      const appMatches = ruleAppId === appId;
      const titleMatches = !ruleTitle || windowTitle.includes(ruleTitle);
      return appMatches && titleMatches;
    })
    .sort((left, right) => right.priority - left.priority)[0];

  return matchedRule
    ? { profileId: matchedRule.profileId, matchedRuleId: matchedRule.id }
    : { profileId: fallbackProfileId, matchedRuleId: null };
}

export function resolveActiveProfileId(
  activeProfileId: string,
  enabledProfileIds?: string[],
): string {
  if (!enabledProfileIds) {
    return activeProfileId;
  }
  return enabledProfileIds.includes(activeProfileId) ? activeProfileId : "normal";
}

export function estimateGroqSttCost(model: string, minutes: number): string {
  const pricing = PROVIDER_PRICING.find(
    (row) => row.kind === "stt" && row.model === model,
  );
  if (!pricing || pricing.kind !== "stt") {
    return "N/A";
  }
  return formatUsd((pricing.pricePerHourUsd / 60) * minutes);
}

export function estimateOpenAiRewriteCost(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): string {
  const pricing = PROVIDER_PRICING.find(
    (row) => row.kind === "rewrite" && row.model === model,
  );
  if (!pricing || pricing.kind !== "rewrite") {
    return "N/A";
  }
  const inputCost = (pricing.inputPerMillionUsd / 1_000_000) * usage.inputTokens;
  const outputCost =
    (pricing.outputPerMillionUsd / 1_000_000) * usage.outputTokens;
  return formatUsd(inputCost + outputCost);
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

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function formatUsd(value: number) {
  return `$${value.toFixed(4)}`;
}
