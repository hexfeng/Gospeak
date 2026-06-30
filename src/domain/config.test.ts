import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_CONFIG,
  buildExportPayload,
  getProviderReadiness,
  updateProviderModel,
} from "./config";

describe("Gospeak provider configuration", () => {
  it("defaults to Groq STT and OpenAI rewrite providers", () => {
    expect(DEFAULT_APP_CONFIG.providers.stt.providerId).toBe("groq");
    expect(DEFAULT_APP_CONFIG.providers.stt.model).toBe("whisper-large-v3-turbo");
    expect(DEFAULT_APP_CONFIG.providers.rewrite.providerId).toBe("openai");
    expect(DEFAULT_APP_CONFIG.performance.fastMode).toBe(false);
  });

  it("updates provider models without mutating the existing config", () => {
    const next = updateProviderModel(
      DEFAULT_APP_CONFIG,
      "stt",
      "whisper-large-v3",
    );

    expect(next.providers.stt.model).toBe("whisper-large-v3");
    expect(DEFAULT_APP_CONFIG.providers.stt.model).toBe("whisper-large-v3-turbo");
  });

  it("exports local config without API keys or transcript history", () => {
    const payload = buildExportPayload({
      config: DEFAULT_APP_CONFIG,
      dictionaryTerms: [
        {
          id: "dict_agent",
          spoken: "agent security",
          written: "AI Agent Security",
          aliases: ["agent 安全"],
          tags: ["work"],
          enabled: true,
          updatedAt: "2026-06-21T10:00:00.000Z",
        },
      ],
      apiKeyPresence: {
        groq: true,
        openai: true,
      },
      transcriptHistory: [
        {
          rawTranscript: "private transcript",
          polishedText: "private polished text",
        },
      ],
    });

    const serialized = JSON.stringify(payload);

    expect(payload.schemaVersion).toBe(1);
    expect(payload.data.providers.stt.providerId).toBe("groq");
    expect(payload.data.performance.fastMode).toBe(false);
    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain("private transcript");
    expect(serialized).not.toContain("private polished text");
  });

  it("marks providers as not ready when required keys are missing", () => {
    const readiness = getProviderReadiness(DEFAULT_APP_CONFIG, {
      groq: false,
      openai: true,
    });

    expect(readiness.stt.ready).toBe(false);
    expect(readiness.stt.reason).toMatch(/Groq API key/i);
    expect(readiness.rewrite.ready).toBe(true);
  });
});
