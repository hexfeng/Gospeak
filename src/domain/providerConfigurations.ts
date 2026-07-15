import {
  REWRITE_PROVIDER_OPTIONS,
  STT_PROVIDER_OPTIONS,
  type ApiKeyPresence,
  type ProviderKind,
  type RewriteProviderConfig,
  type RewriteProviderId,
  type SttProviderConfig,
  type SttProviderId,
} from "./config";

export type ProviderConfiguration = {
  id: string;
  name: string;
  kind: ProviderKind;
  providerId: SttProviderId | RewriteProviderId;
  model: string;
  baseUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProviderConfigurationState = {
  configurations: ProviderConfiguration[];
  activeAsrConfigId: string;
  activeRewriteConfigId: string;
};

export type ProviderConfigurationStatus =
  | "configured"
  | "missing-key"
  | "missing-endpoint"
  | "invalid-endpoint"
  | "incomplete";

export type ConfigurationKeyPresence = Record<string, boolean>;

type LegacyProviders = {
  stt: SttProviderConfig;
  rewrite: RewriteProviderConfig;
};

export function migrateProviderConfigurations(
  providers: LegacyProviders,
  timestamp = new Date().toISOString(),
): ProviderConfigurationState {
  const stt = fromStt(providers.stt, timestamp);
  const rewrite = fromRewrite(providers.rewrite, timestamp);
  return {
    configurations: [stt, rewrite],
    activeAsrConfigId: stt.id,
    activeRewriteConfigId: rewrite.id,
  };
}

export function addLegacyCredentialConfigurations(
  state: ProviderConfigurationState,
  presence: ApiKeyPresence,
  timestamp = new Date().toISOString(),
): ProviderConfigurationState {
  const candidates: ProviderConfiguration[] = [];
  if (presence.groq) candidates.push(defaultStt("groq", timestamp));
  if (presence["qwen-api"]) candidates.push(defaultStt("qwen-api", timestamp));
  if (presence.doubao) candidates.push(defaultStt("doubao", timestamp));
  if (presence.openai) {
    candidates.push(defaultStt("openai-realtime", timestamp));
    candidates.push(defaultRewrite("openai", timestamp));
  }
  if (presence.deepseek) candidates.push(defaultRewrite("deepseek", timestamp));

  const configurations = [...state.configurations];
  for (const candidate of candidates) {
    if (
      !configurations.some(
        (item) =>
          item.kind === candidate.kind && item.providerId === candidate.providerId,
      )
    ) {
      configurations.push(candidate);
    }
  }
  return { ...state, configurations };
}

export function activeProviderPair(state: ProviderConfigurationState): {
  stt: ProviderConfiguration & { providerId: SttProviderId };
  rewrite: ProviderConfiguration & { providerId: RewriteProviderId };
} {
  const stt = state.configurations.find(
    (item) => item.id === state.activeAsrConfigId && item.kind === "stt",
  );
  const rewrite = state.configurations.find(
    (item) => item.id === state.activeRewriteConfigId && item.kind === "rewrite",
  );
  if (!stt || !isSttProvider(stt.providerId)) {
    throw new Error("Active ASR configuration is missing");
  }
  if (!rewrite || !isRewriteProvider(rewrite.providerId)) {
    throw new Error("Active Rewrite configuration is missing");
  }
  return {
    stt: stt as ProviderConfiguration & { providerId: SttProviderId },
    rewrite: rewrite as ProviderConfiguration & { providerId: RewriteProviderId },
  };
}

export function configurationStatus(
  configuration: ProviderConfiguration,
  presence: ConfigurationKeyPresence,
): ProviderConfigurationStatus {
  const endpointStatus = endpointProblem(configuration);
  if (endpointStatus) return endpointStatus;
  if (requiresKey(configuration) && !presence[configuration.id]) return "missing-key";
  return !configuration.name.trim() || !modelIsAllowed(configuration)
    ? "incomplete"
    : "configured";
}

export function upsertProviderConfiguration(
  state: ProviderConfigurationState,
  configuration: ProviderConfiguration,
): ProviderConfigurationState {
  const name = configuration.name.trim();
  if (!name || !configuration.id.trim()) {
    throw new Error("Configuration name and ID are required");
  }
  const duplicate = state.configurations.some(
    (item) =>
      item.id !== configuration.id &&
      item.kind === configuration.kind &&
      item.providerId === configuration.providerId &&
      normalize(item.name) === normalize(name),
  );
  if (duplicate) throw new Error("Configuration name already exists");

  const next = { ...configuration, name };
  const index = state.configurations.findIndex((item) => item.id === next.id);
  return {
    ...state,
    configurations:
      index === -1
        ? [...state.configurations, next]
        : state.configurations.map((item) => (item.id === next.id ? next : item)),
  };
}

export function activateProviderConfiguration(
  state: ProviderConfigurationState,
  configurationId: string,
): ProviderConfigurationState {
  const configuration = state.configurations.find(
    (item) => item.id === configurationId,
  );
  if (!configuration) throw new Error("Provider configuration is missing");
  return configuration.kind === "stt"
    ? { ...state, activeAsrConfigId: configuration.id }
    : { ...state, activeRewriteConfigId: configuration.id };
}

export function deleteProviderConfiguration(
  state: ProviderConfigurationState,
  configurationId: string,
): ProviderConfigurationState {
  if (
    configurationId === state.activeAsrConfigId ||
    configurationId === state.activeRewriteConfigId
  ) {
    throw new Error("Active Provider configuration cannot be deleted");
  }
  return {
    ...state,
    configurations: state.configurations.filter(
      (item) => item.id !== configurationId,
    ),
  };
}

export function requiresKey(configuration: ProviderConfiguration): boolean {
  return configuration.providerId !== "qwen-local" && configuration.providerId !== "qwen-api";
}

function fromStt(config: SttProviderConfig, timestamp: string): ProviderConfiguration {
  return {
    id: `provider_default_${safeId(config.providerId)}_stt`,
    name: providerLabel(config.providerId),
    kind: "stt",
    providerId: config.providerId,
    model: config.model,
    ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function fromRewrite(
  config: RewriteProviderConfig,
  timestamp: string,
): ProviderConfiguration {
  return {
    id: `provider_default_${safeId(config.providerId)}_rewrite`,
    name: providerLabel(config.providerId),
    kind: "rewrite",
    providerId: config.providerId,
    model: config.model,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function defaultStt(
  providerId: SttProviderId,
  timestamp: string,
): ProviderConfiguration {
  const option = STT_PROVIDER_OPTIONS.find((item) => item.id === providerId)!;
  return fromStt(
    {
      providerId,
      model: option.models[0],
      ...(option.defaultBaseUrl !== undefined
        ? { baseUrl: option.defaultBaseUrl }
        : {}),
    },
    timestamp,
  );
}

function defaultRewrite(
  providerId: RewriteProviderId,
  timestamp: string,
): ProviderConfiguration {
  const option = REWRITE_PROVIDER_OPTIONS.find((item) => item.id === providerId)!;
  return fromRewrite({ providerId, model: option.models[0] }, timestamp);
}

function endpointProblem(
  configuration: ProviderConfiguration,
): "missing-endpoint" | "invalid-endpoint" | null {
  if (configuration.providerId !== "qwen-local" && configuration.providerId !== "qwen-api") {
    return null;
  }
  const raw = configuration.baseUrl?.trim();
  if (!raw) return "missing-endpoint";
  try {
    const url = new URL(raw);
    if (configuration.providerId === "qwen-api" && url.protocol !== "https:") {
      return "invalid-endpoint";
    }
    if (
      configuration.providerId === "qwen-local" &&
      !["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname)
    ) {
      return "invalid-endpoint";
    }
  } catch {
    return "invalid-endpoint";
  }
  return null;
}

function modelIsAllowed(configuration: ProviderConfiguration): boolean {
  const options =
    configuration.kind === "stt" ? STT_PROVIDER_OPTIONS : REWRITE_PROVIDER_OPTIONS;
  return options.some(
    (option) =>
      option.id === configuration.providerId &&
      option.models.includes(configuration.model),
  );
}

function providerLabel(providerId: SttProviderId | RewriteProviderId): string {
  return (
    STT_PROVIDER_OPTIONS.find((item) => item.id === providerId)?.label ??
    REWRITE_PROVIDER_OPTIONS.find((item) => item.id === providerId)?.label ??
    providerId
  );
}

function isSttProvider(value: string): value is SttProviderId {
  return STT_PROVIDER_OPTIONS.some((option) => option.id === value);
}

function isRewriteProvider(value: string): value is RewriteProviderId {
  return REWRITE_PROVIDER_OPTIONS.some((option) => option.id === value);
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function safeId(value: string): string {
  return value.replaceAll(/[^a-z0-9]+/g, "_");
}
