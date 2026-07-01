import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_CONFIG,
  estimateGroqSttCost,
  estimateOpenAiRewriteCost,
  buildExportPayload,
  resolveProfileForContext,
  getProviderReadiness,
  updateProviderModel,
} from "./config";

describe("Gospeak provider configuration", () => {
  it("defaults to Groq STT and OpenAI rewrite providers", () => {
    expect(DEFAULT_APP_CONFIG.providers.stt.providerId).toBe("groq");
    expect(DEFAULT_APP_CONFIG.providers.stt.model).toBe("whisper-large-v3-turbo");
    expect(DEFAULT_APP_CONFIG.providers.rewrite.providerId).toBe("openai");
    expect(DEFAULT_APP_CONFIG.performance.fastMode).toBe(false);
    expect(DEFAULT_APP_CONFIG.performance.speakToEdit).toBe(false);
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
    const appRules = [
      {
        id: "rule_chrome_prompt",
        appId: "chrome.exe",
        windowTitlePattern: "ChatGPT",
        profileId: "prompt",
        priority: 10,
        enabled: true,
        updatedAt: "2026-06-30T10:00:00.000Z",
        deletedAt: null,
      },
    ];
    const payload = buildExportPayload({
      config: DEFAULT_APP_CONFIG,
      appRules,
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
    expect(payload.data.appRouting.enabled).toBe(false);
    expect(payload.data.appRules).toEqual(appRules);
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

  it("resolves the highest priority matching enabled app rule", () => {
    const resolved = resolveProfileForContext({
      activeProfileId: "email",
      context: {
        appId: "CHROME.EXE",
        windowTitle: "ChatGPT - Chrome",
      },
      rules: [
        {
          id: "rule_deleted",
          appId: "chrome.exe",
          windowTitlePattern: "ChatGPT",
          profileId: "normal",
          priority: 30,
          enabled: true,
          updatedAt: "2026-06-30T10:00:00.000Z",
          deletedAt: "2026-06-30T11:00:00.000Z",
        },
        {
          id: "rule_disabled",
          appId: "chrome.exe",
          windowTitlePattern: null,
          profileId: "translate",
          priority: 20,
          enabled: false,
          updatedAt: "2026-06-30T10:00:00.000Z",
          deletedAt: null,
        },
        {
          id: "rule_app",
          appId: "chrome.exe",
          windowTitlePattern: null,
          profileId: "normal",
          priority: 1,
          enabled: true,
          updatedAt: "2026-06-30T10:00:00.000Z",
          deletedAt: null,
        },
        {
          id: "rule_title",
          appId: "chrome.exe",
          windowTitlePattern: "chatgpt",
          profileId: "prompt",
          priority: 10,
          enabled: true,
          updatedAt: "2026-06-30T10:00:00.000Z",
          deletedAt: null,
        },
      ],
    });

    expect(resolved.profileId).toBe("prompt");
    expect(resolved.matchedRuleId).toBe("rule_title");
  });

  it("falls back to the active profile when no app rule matches", () => {
    expect(
      resolveProfileForContext({
        activeProfileId: "email",
        context: {
          appId: "notepad.exe",
          windowTitle: "Untitled - Notepad",
        },
        rules: [
          {
            id: "rule_chrome",
            appId: "chrome.exe",
            windowTitlePattern: "ChatGPT",
            profileId: "prompt",
            priority: 10,
            enabled: true,
            updatedAt: "2026-06-30T10:00:00.000Z",
            deletedAt: null,
          },
        ],
      }).profileId,
    ).toBe("email");
  });

  it("requires an app id before a title pattern rule can match", () => {
    const resolved = resolveProfileForContext({
      activeProfileId: "normal",
      context: {
        appId: "chrome.exe",
        windowTitle: "ChatGPT - Chrome",
      },
      rules: [
        {
          id: "rule_title_only",
          appId: "",
          windowTitlePattern: "ChatGPT",
          profileId: "prompt",
          priority: 50,
          enabled: true,
          updatedAt: "2026-06-30T10:00:00.000Z",
          deletedAt: null,
        },
      ],
    });

    expect(resolved.profileId).toBe("normal");
    expect(resolved.matchedRuleId).toBeNull();
  });

  it("falls back to normal when the active profile is not enabled", () => {
    expect(
      resolveProfileForContext({
        activeProfileId: "missing",
        enabledProfileIds: ["normal", "prompt"],
        context: {
          appId: "notepad.exe",
          windowTitle: "Notes",
        },
        rules: [],
      }).profileId,
    ).toBe("normal");
  });

  it("keeps the active profile fallback when it is enabled", () => {
    expect(
      resolveProfileForContext({
        activeProfileId: "email",
        enabledProfileIds: ["normal", "email"],
        context: {
          appId: "notepad.exe",
          windowTitle: "Notes",
        },
        rules: [],
      }).profileId,
    ).toBe("email");
  });

  it("ignores matching rules that point at missing or disabled profiles", () => {
    const resolved = resolveProfileForContext({
      activeProfileId: "email",
      enabledProfileIds: ["normal", "email"],
      context: {
        appId: "chrome.exe",
        windowTitle: "ChatGPT - Chrome",
      },
      rules: [
        {
          id: "rule_stale",
          appId: "chrome.exe",
          windowTitlePattern: "ChatGPT",
          profileId: "disabled_prompt",
          priority: 50,
          enabled: true,
          updatedAt: "2026-06-30T10:00:00.000Z",
          deletedAt: null,
        },
        {
          id: "rule_normal",
          appId: "chrome.exe",
          windowTitlePattern: null,
          profileId: "normal",
          priority: 1,
          enabled: true,
          updatedAt: "2026-06-30T10:00:00.000Z",
          deletedAt: null,
        },
      ],
    });

    expect(resolved.profileId).toBe("normal");
    expect(resolved.matchedRuleId).toBe("rule_normal");
  });

  it("formats Groq STT per-minute estimates from hourly prices", () => {
    expect(estimateGroqSttCost("whisper-large-v3-turbo", 1)).toBe("$0.0007");
    expect(estimateGroqSttCost("whisper-large-v3", 1)).toBe("$0.0019");
  });

  it("formats OpenAI rewrite per-1K token estimates", () => {
    expect(
      estimateOpenAiRewriteCost("gpt-5-nano", {
        inputTokens: 1000,
        outputTokens: 1000,
      }),
    ).toBe("$0.0005");
    expect(
      estimateOpenAiRewriteCost("gpt-5-mini", {
        inputTokens: 1000,
        outputTokens: 1000,
      }),
    ).toBe("$0.0023");
  });
});
