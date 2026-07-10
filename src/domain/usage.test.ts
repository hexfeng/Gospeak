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
