import type { ProviderConfigurationState } from "./providerConfigurations";

export type ProviderKind = "stt" | "rewrite";

export type SttProviderId =
  | "groq"
  | "qwen-local"
  | "qwen-api"
  | "doubao"
  | "openai-realtime";

export type RewriteProviderId = "openai" | "deepseek";

export type CredentialProviderId =
  | "groq"
  | "openai"
  | "qwen-api"
  | "doubao"
  | "deepseek";

export type SttProviderConfig = {
  providerId: SttProviderId;
  model: string;
  baseUrl?: string;
};

export type RewriteProviderConfig = {
  providerId: RewriteProviderId;
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
  type: DictionaryTermType;
  aliases: string[];
  tags: string[];
  enabled: boolean;
  updatedAt: string;
};

export type DictionaryTermType =
  | "person"
  | "organization"
  | "brand-product"
  | "technical-term"
  | "acronym"
  | "other";

export const DICTIONARY_TERM_TYPES: Array<{
  id: DictionaryTermType;
  label: string;
}> = [
  { id: "person", label: "Person" },
  { id: "organization", label: "Organization" },
  { id: "brand-product", label: "Brand / Product" },
  { id: "technical-term", label: "Technical term" },
  { id: "acronym", label: "Acronym" },
  { id: "other", label: "Other" },
];

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
  providers: {
    stt: SttProviderConfig;
    rewrite: RewriteProviderConfig;
  };
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
    speakToEdit: boolean;
  };
  appRouting: {
    enabled: boolean;
  };
  activeProfileId: string;
  promptProfiles: PromptProfile[];
};

export type ApiKeyPresence = Partial<Record<CredentialProviderId, boolean>>;

export const STT_PROVIDER_OPTIONS: Array<{
  id: SttProviderId;
  label: string;
  models: string[];
  defaultBaseUrl?: string;
}> = [
  {
    id: "groq",
    label: "Groq Whisper",
    models: ["whisper-large-v3-turbo", "whisper-large-v3"],
  },
  {
    id: "qwen-local",
    label: "Qwen Local",
    models: ["Qwen/Qwen3-ASR-0.6B"],
    defaultBaseUrl: "http://127.0.0.1:8000/v1",
  },
  {
    id: "qwen-api",
    label: "Qwen API",
    models: ["Qwen/Qwen3-ASR-1.7B"],
    defaultBaseUrl: "",
  },
  { id: "doubao", label: "Doubao ASR", models: ["bigmodel"] },
  {
    id: "openai-realtime",
    label: "OpenAI Realtime",
    models: ["gpt-realtime-2"],
  },
];

export const REWRITE_PROVIDER_OPTIONS: Array<{
  id: RewriteProviderId;
  label: string;
  models: string[];
}> = [
  { id: "openai", label: "OpenAI", models: ["gpt-5-nano", "gpt-5-mini"] },
  {
    id: "deepseek",
    label: "DeepSeek",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
  },
];

export type TranscriptHistoryItem = {
  rawTranscript: string;
  polishedText: string;
};

export type StoredProviderConfiguration = AppConfig["providers"] &
  Partial<ProviderConfigurationState>;

export type ConfigExportPayload = {
  schemaVersion: 2;
  exportedAt: string;
  data: {
    providers: StoredProviderConfiguration;
    hotkey: AppConfig["hotkey"];
    privacy: Pick<AppConfig["privacy"], "saveRawAudio">;
    performance: AppConfig["performance"];
    appRouting: AppConfig["appRouting"];
    activeProfileId: string;
    promptProfiles: PromptProfile[];
    dictionaryTerms: DictionaryTerm[];
    appRules: AppProfileRule[];
  };
};

export type ConfigImportPayload = Omit<ConfigExportPayload, "schemaVersion" | "data"> & {
  schemaVersion: 1 | 2;
  data: Omit<ConfigExportPayload["data"], "privacy" | "performance"> & {
    privacy: Pick<AppConfig["privacy"], "saveRawAudio"> &
      Partial<Omit<AppConfig["privacy"], "saveRawAudio">>;
    performance: AppConfig["performance"] & { streamingMode?: boolean };
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
    speakToEdit: false,
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

export function updateSttProvider(
  config: AppConfig,
  providerId: SttProviderId,
): AppConfig {
  const option = STT_PROVIDER_OPTIONS.find((item) => item.id === providerId);
  if (!option) return config;
  return {
    ...config,
    providers: {
      ...config.providers,
      stt: {
        providerId,
        model: option.models[0],
        ...(option.defaultBaseUrl !== undefined
          ? { baseUrl: option.defaultBaseUrl }
          : {}),
      },
    },
  };
}

export function updateRewriteProvider(
  config: AppConfig,
  providerId: RewriteProviderId,
): AppConfig {
  const option = REWRITE_PROVIDER_OPTIONS.find((item) => item.id === providerId);
  if (!option) return config;
  return {
    ...config,
    providers: {
      ...config.providers,
      rewrite: { providerId, model: option.models[0] },
    },
  };
}

export function updateSttBaseUrl(config: AppConfig, baseUrl: string): AppConfig {
  return {
    ...config,
    providers: {
      ...config.providers,
      stt: { ...config.providers.stt, baseUrl },
    },
  };
}

export function validateSttBaseUrl(config: AppConfig): string | null {
  const provider = config.providers.stt.providerId;
  if (provider !== "qwen-local" && provider !== "qwen-api") return null;
  const baseUrl = config.providers.stt.baseUrl;
  const rawUrl = typeof baseUrl === "string" ? baseUrl.trim() : "";
  if (!rawUrl) return `${provider === "qwen-local" ? "Qwen Local" : "Qwen API"} base URL is required.`;
  try {
    const url = new URL(rawUrl);
    if (provider === "qwen-api" && url.protocol !== "https:") {
      return "Qwen API base URL must use HTTPS.";
    }
    if (
      provider === "qwen-local" &&
      !["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname)
    ) {
      return "Qwen Local base URL must use a loopback host.";
    }
  } catch {
    return "ASR base URL is invalid.";
  }
  return null;
}

export function applyStoredPreferences(
  base: AppConfig,
  preferences: Record<string, string>,
): AppConfig {
  const providers = parsePreference<Partial<AppConfig["providers"]>>(
    preferences.providers,
  );
  const performance = parsePreference<
    Partial<AppConfig["performance"]> & { streamingMode?: boolean }
  >(preferences.performance);
  const privacy = parsePreference<Partial<AppConfig["privacy"]>>(
    preferences.privacy,
  );
  const hotkey = parsePreference<Partial<AppConfig["hotkey"]>>(
    preferences.hotkey,
  );
  const appRouting = parsePreference<Partial<AppConfig["appRouting"]>>(
    preferences.app_routing,
  );
  const normalizedProviders = normalizeStoredProviders(base, providers);

  const next: AppConfig = {
    ...base,
    providers: normalizedProviders,
    hotkey: { ...base.hotkey, ...hotkey },
    privacy: {
      ...base.privacy,
      saveRawAudio: privacy?.saveRawAudio ?? base.privacy.saveRawAudio,
      saveTranscriptHistory: false,
      syncTranscriptHistory: false,
      crashReportIncludesTranscript: false,
    },
    performance: {
      fastMode: performance?.fastMode ?? base.performance.fastMode,
      speakToEdit: performance?.speakToEdit ?? base.performance.speakToEdit,
    },
    appRouting: { ...base.appRouting, ...appRouting },
    activeProfileId: preferences.active_profile_id ?? base.activeProfileId,
  };

  return performance?.streamingMode
    ? updateSttProvider(next, "openai-realtime")
    : next;
}

function normalizeStoredProviders(
  base: AppConfig,
  providers: Partial<AppConfig["providers"]> | undefined,
): AppConfig["providers"] {
  const sttOption = STT_PROVIDER_OPTIONS.find(
    (option) => option.id === providers?.stt?.providerId,
  );
  const storedStt = providers?.stt;
  let stt = base.providers.stt;
  if (sttOption && storedStt && sttOption.models.includes(storedStt.model)) {
    stt = { providerId: sttOption.id, model: storedStt.model };
    if (sttOption.id === "qwen-local" || sttOption.id === "qwen-api") {
      const candidate = {
        ...stt,
        baseUrl:
          typeof storedStt.baseUrl === "string" ? storedStt.baseUrl : "",
      };
      const candidateConfig: AppConfig = {
        ...base,
        providers: { ...base.providers, stt: candidate },
      };
      stt = validateSttBaseUrl(candidateConfig)
        ? {
            ...stt,
            baseUrl: sttOption.id === "qwen-local"
              ? sttOption.defaultBaseUrl
              : "",
          }
        : candidate;
    }
  }

  const rewriteOption = REWRITE_PROVIDER_OPTIONS.find(
    (option) => option.id === providers?.rewrite?.providerId,
  );
  const storedRewrite = providers?.rewrite;
  const rewrite =
    rewriteOption &&
    storedRewrite &&
    rewriteOption.models.includes(storedRewrite.model)
      ? { providerId: rewriteOption.id, model: storedRewrite.model }
      : base.providers.rewrite;

  return { stt, rewrite };
}

export function buildExportPayload(input: {
  config: AppConfig;
  dictionaryTerms: DictionaryTerm[];
  appRules?: AppProfileRule[];
  providerState?: ProviderConfigurationState;
  apiKeyPresence?: ApiKeyPresence;
  transcriptHistory?: TranscriptHistoryItem[];
}): ConfigExportPayload {
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    data: {
      providers: input.providerState
        ? { ...input.config.providers, ...input.providerState }
        : input.config.providers,
      hotkey: input.config.hotkey,
      privacy: { saveRawAudio: input.config.privacy.saveRawAudio },
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
  localAsrStatus?: "not-configured" | "stopped" | "starting" | "ready" | "failed",
) {
  const sttProvider = config.providers.stt.providerId;
  const sttCredential =
    sttProvider === "openai-realtime"
      ? "openai"
      : sttProvider === "qwen-local"
        ? null
        : sttProvider;
  const sttKey = sttCredential === null || sttProvider === "qwen-api"
    ? true
    : keyPresence[sttCredential] === true;
  const sttBaseUrlError = validateSttBaseUrl(config);
  const localAsrProblem = sttProvider === "qwen-local" &&
    localAsrStatus !== undefined &&
    localAsrStatus !== "ready";
  const rewriteKey = keyPresence[config.providers.rewrite.providerId] === true;
  const stt = sttKey && !sttBaseUrlError && !localAsrProblem
    ? { ready: true as const }
    : {
        ready: false as const,
        reason: sttBaseUrlError
          ? sttBaseUrlError
          : localAsrProblem
            ? `Qwen Local is ${localAsrStatus}.`
            : `${credentialName(sttCredential!)} API key is missing. Configure it before live STT.`,
      };
  const rewrite = rewriteKey
    ? { ready: true as const }
    : {
        ready: false as const,
        reason: `${credentialName(config.providers.rewrite.providerId)} API key is missing. Configure it before live rewrite.`,
      };
  const issues = [];
  if (!stt.ready) {
    issues.push(localAsrProblem && localAsrStatus !== "not-configured"
      ? `ASR ${localAsrStatus}`
      : "ASR missing");
  }
  if (!rewrite.ready) issues.push("Rewrite missing");

  return {
    stt,
    rewrite,
    allReady: issues.length === 0,
    label: issues.length === 0
      ? "All systems normal"
      : issues[0] === "ASR missing" && issues[1] === "Rewrite missing"
        ? "ASR and Rewrite missing"
      : issues.join(" and "),
  };
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function formatUsd(value: number) {
  return `$${value.toFixed(4)}`;
}

function parsePreference<T>(value: string | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function credentialName(provider: CredentialProviderId): string {
  return {
    groq: "Groq",
    openai: "OpenAI",
    "qwen-api": "Qwen",
    doubao: "Doubao",
    deepseek: "DeepSeek",
  }[provider];
}
