import type { UsageEventRecord } from "../lib/tauri";

export type UsageSummary = {
  todayCount: number;
  todayAudioSeconds: number;
  todayAverageLatencyMs: number | null;
  todayFallbackCount: number;
  monthSttCost: number;
  monthRewriteCost: number;
  monthTotalCost: number;
  totalAudioSeconds: number;
  totalCharacterCount: number;
  totalCost: number;
};

export function summarizeUsage(
  events: UsageEventRecord[],
  now = new Date(),
): UsageSummary {
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let todayCount = 0;
  let todayAudioSeconds = 0;
  let todayLatencyMs = 0;
  let todayFallbackCount = 0;
  let monthSttCost = 0;
  let monthRewriteCost = 0;
  let totalAudioSeconds = 0;
  let totalCharacterCount = 0;
  let totalCost = 0;

  for (const event of events) {
    const createdAt = new Date(event.created_at).getTime();
    totalAudioSeconds += event.audio_seconds ?? 0;
    totalCharacterCount += event.output_character_count ?? 0;
    totalCost +=
      (event.stt_estimated_cost ?? 0) + (event.rewrite_estimated_cost ?? 0);
    if (createdAt >= monthStart && createdAt <= now.getTime()) {
      monthSttCost += event.stt_estimated_cost ?? 0;
      monthRewriteCost += event.rewrite_estimated_cost ?? 0;
    }
    if (createdAt >= todayStart && createdAt <= now.getTime()) {
      todayCount += 1;
      todayAudioSeconds += event.audio_seconds ?? 0;
      todayLatencyMs += event.stt_latency_ms + (event.rewrite_latency_ms ?? 0);
      todayFallbackCount += event.rewrite_fallback_used ? 1 : 0;
    }
  }

  return {
    todayCount,
    todayAudioSeconds,
    todayAverageLatencyMs:
      todayCount === 0 ? null : Math.round(todayLatencyMs / todayCount),
    todayFallbackCount,
    monthSttCost,
    monthRewriteCost,
    monthTotalCost: monthSttCost + monthRewriteCost,
    totalAudioSeconds,
    totalCharacterCount,
    totalCost,
  };
}

export function recentUsageEvents(
  events: UsageEventRecord[],
  limit = 5,
): UsageEventRecord[] {
  return [...events]
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    )
    .slice(0, limit);
}
