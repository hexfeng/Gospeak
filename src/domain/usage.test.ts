import { describe, expect, it } from "vitest";
import type { UsageEventRecord } from "../lib/tauri";
import { recentUsageEvents, summarizeUsage } from "./usage";

function event(
  id: string,
  createdAt: string,
  overrides: Partial<UsageEventRecord> = {},
): UsageEventRecord {
  return {
    id,
    stt_provider: "groq",
    stt_model: "whisper-large-v3-turbo",
    llm_provider: "openai",
    llm_model: "gpt-5-nano",
    profile_id: "normal",
    audio_seconds: 30,
    stt_latency_ms: 100,
    rewrite_latency_ms: 50,
    rewrite_fallback_used: false,
    stt_estimated_cost: 0.001,
    rewrite_estimated_cost: 0.002,
    estimated_cost: 0.003,
    output_character_count: 20,
    created_at: createdAt,
    ...overrides,
  };
}

describe("summarizeUsage", () => {
  it("separates today's activity from current-month cost", () => {
    const now = new Date(2026, 6, 10, 12, 0, 0);
    const events = [
      event("today", new Date(2026, 6, 10, 9, 0, 0).toISOString()),
      event("month", new Date(2026, 6, 2, 9, 0, 0).toISOString(), {
        audio_seconds: 90,
        stt_estimated_cost: 0.004,
        rewrite_estimated_cost: 0.005,
      }),
      event("old", new Date(2026, 5, 30, 9, 0, 0).toISOString()),
    ];

    expect(summarizeUsage(events, now)).toEqual({
      todayCount: 1,
      todayAudioSeconds: 30,
      todayAverageLatencyMs: 150,
      todayFallbackCount: 0,
      monthSttCost: 0.005,
      monthRewriteCost: 0.007,
      monthTotalCost: 0.012,
      totalAudioSeconds: 150,
      totalCharacterCount: 60,
      totalCost: 0.015,
    });
  });

  it("aggregates all-time General metrics", () => {
    const events = [
      event("current", "2026-07-10T09:00:00.000Z", {
        audio_seconds: 30,
        output_character_count: 20,
        stt_estimated_cost: 0.001,
        rewrite_estimated_cost: 0.002,
      }),
      event("old", "2025-01-10T09:00:00.000Z", {
        audio_seconds: 90,
        output_character_count: 80,
        stt_estimated_cost: 0.004,
        rewrite_estimated_cost: null,
      }),
    ];

    expect(summarizeUsage(events, new Date(2026, 6, 10, 12))).toMatchObject({
      totalAudioSeconds: 120,
      totalCharacterCount: 100,
      totalCost: 0.007,
    });
  });

  it("returns zero all-time metrics for empty input", () => {
    expect(summarizeUsage([])).toMatchObject({
      totalAudioSeconds: 0,
      totalCharacterCount: 0,
      totalCost: 0,
    });
  });

  it("treats omitted and null legacy usage fields as zero", () => {
    const omittedOutputCount = event("legacy-omitted", "2026-07-10T09:00:00.000Z", {
      audio_seconds: null,
      stt_estimated_cost: null,
      rewrite_estimated_cost: null,
    });
    delete omittedOutputCount.output_character_count;
    const nullFields = event("legacy-null", "2026-07-10T10:00:00.000Z", {
      audio_seconds: null,
      output_character_count: null,
      stt_estimated_cost: null,
      rewrite_estimated_cost: null,
    });

    expect(
      summarizeUsage(
        [omittedOutputCount, nullFields],
        new Date(2026, 6, 10, 12),
      ),
    ).toMatchObject({
      todayAudioSeconds: 0,
      monthSttCost: 0,
      monthTotalCost: 0,
      totalAudioSeconds: 0,
      totalCharacterCount: 0,
      totalCost: 0,
    });
  });

  it("returns null average latency when today has no events", () => {
    const events = [event("old", "2026-06-30T12:00:00.000Z")];
    expect(summarizeUsage(events, new Date(2026, 6, 10))).toMatchObject({
      todayCount: 0,
      todayAverageLatencyMs: null,
    });
  });

  it("returns the newest privacy-safe events without mutating input", () => {
    const events = [
      event("older", "2026-07-09T10:00:00.000Z"),
      event("newer", "2026-07-10T10:00:00.000Z"),
    ];
    expect(recentUsageEvents(events, 1).map((item) => item.id)).toEqual([
      "newer",
    ]);
    expect(events.map((item) => item.id)).toEqual(["older", "newer"]);
  });
});
