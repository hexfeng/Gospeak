import { describe, expect, it } from "vitest";
import { DEFAULT_APP_CONFIG } from "./config";
import {
  activateProviderConfiguration,
  activeProviderPair,
  addLegacyCredentialConfigurations,
  configurationStatus,
  migrateProviderConfigurations,
  upsertProviderConfiguration,
  type ProviderConfiguration,
} from "./providerConfigurations";

const now = "2026-07-15T12:00:00.000Z";

describe("named Provider configurations", () => {
  it("migrates the legacy active pair into named configurations", () => {
    const state = migrateProviderConfigurations(DEFAULT_APP_CONFIG.providers, now);
    const active = activeProviderPair(state);

    expect(state.configurations).toHaveLength(2);
    expect(active.stt.providerId).toBe("groq");
    expect(active.rewrite.providerId).toBe("openai");
  });

  it("creates inactive configurations for unused legacy credentials", () => {
    const state = addLegacyCredentialConfigurations(
      migrateProviderConfigurations(DEFAULT_APP_CONFIG.providers, now),
      { doubao: true, openai: true },
      now,
    );

    expect(state.configurations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerId: "doubao", kind: "stt" }),
        expect.objectContaining({ providerId: "openai-realtime", kind: "stt" }),
        expect.objectContaining({ providerId: "openai", kind: "rewrite" }),
      ]),
    );
  });

  it("uses deterministic readiness precedence without network checks", () => {
    const configuration: ProviderConfiguration = {
      id: "provider_qwen_api_work",
      name: "Work Qwen",
      kind: "stt",
      providerId: "qwen-api",
      model: "Qwen/Qwen3-ASR-1.7B",
      baseUrl: "http://example.com/v1",
      createdAt: now,
      updatedAt: now,
    };

    expect(configurationStatus(configuration, {})).toBe("invalid-endpoint");
    expect(configurationStatus({ ...configuration, baseUrl: "" }, {})).toBe(
      "missing-endpoint",
    );
  });

  it("rejects duplicate names within one Provider case-insensitively", () => {
    const state = migrateProviderConfigurations(DEFAULT_APP_CONFIG.providers, now);
    const candidate: ProviderConfiguration = {
      ...state.configurations[0],
      id: "provider_groq_work",
      name: ` ${state.configurations[0].name.toUpperCase()} `,
    };

    expect(() => upsertProviderConfiguration(state, candidate)).toThrow(
      "Configuration name already exists",
    );
  });

  it("activates exactly one configuration for each pipeline kind", () => {
    const state = addLegacyCredentialConfigurations(
      migrateProviderConfigurations(DEFAULT_APP_CONFIG.providers, now),
      { doubao: true },
      now,
    );
    const doubao = state.configurations.find(
      (configuration) => configuration.providerId === "doubao",
    )!;
    const next = activateProviderConfiguration(state, doubao.id);

    expect(activeProviderPair(next).stt.id).toBe(doubao.id);
    expect(activeProviderPair(next).rewrite.id).toBe(
      state.activeRewriteConfigId,
    );
  });
});
