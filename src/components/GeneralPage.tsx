import {
  ChevronRight,
  Cloud,
  Clock3,
  DollarSign,
  FileText,
  Mic,
  UserRound,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import {
  getProviderReadiness,
  type ApiKeyPresence,
  type AppConfig,
  type PromptProfile,
} from "../domain/config";
import { summarizeUsage } from "../domain/usage";
import type { QwenLocalStatus, UsageEventRecord } from "../lib/tauri";

type GeneralPageProps = {
  config: AppConfig;
  keyPresence: ApiKeyPresence;
  profiles: PromptProfile[];
  usageEvents: UsageEventRecord[];
  qwenLocalStatus?: QwenLocalStatus["status"];
  onOpenProfiles: () => void;
  onOpenProviders: (kind: "stt" | "rewrite") => void;
};

export function GeneralPage({
  config,
  keyPresence,
  profiles,
  usageEvents,
  qwenLocalStatus,
  onOpenProfiles,
  onOpenProviders,
}: GeneralPageProps) {
  const readiness = getProviderReadiness(config, keyPresence, qwenLocalStatus);
  const usage = summarizeUsage(usageEvents);
  const activeProfile = profiles.find((profile) => profile.id === config.activeProfileId);
  const hotkeyReady = Boolean(config.hotkey.binding.trim());
  const activeProfileReady = activeProfile?.enabled === true;
  const chartDays = buildWeeklyActivity(usageEvents);
  const usageMode = !readiness.stt.ready
    ? "Not Set"
    : config.providers.stt.providerId === "qwen-local"
      ? "Local"
      : "Cloud";

  return (
    <section className="module-panel general-page" aria-labelledby="general-title">
      <section className="general-hero" aria-label="Dictation readiness">
        <header className="general-header">
          <h1 id="general-title">Gospeak</h1>
          <p>
            {hotkeyReady ? (
              <>
                Press <Hotkey binding={config.hotkey.binding} /> to start dictating.
              </>
            ) : (
              "Set a shortcut to start dictating."
            )}
          </p>
        </header>

        <span className="general-hero-divider" aria-hidden="true" />

        <div className="general-readiness">
          <span className="general-hero-icon" aria-hidden="true">
            <Mic size={34} strokeWidth={1.9} />
          </span>
          <div className="general-hero-copy">
            <h2>{readiness.allReady ? "Ready to dictate" : "Setup required"}</h2>
            <p>
              {readiness.allReady
                ? "Gospeak is ready when you are."
                : "Configure Providers before dictating."}
            </p>
            <span className={`general-hero-pill ${readiness.allReady ? "is-ready" : "is-not-ready"}`}>
              <span aria-hidden="true" />
              {readiness.label}
            </span>
          </div>
        </div>
      </section>

      <section className="general-metrics" aria-label="All-time usage">
        <Metric
          icon={Clock3}
          label="Total dictation time"
          value={formatDuration(usage.totalAudioSeconds)}
        />
        <Metric icon={FileText} label="Total characters" value={usage.totalCharacterCount.toLocaleString()} />
        <Metric icon={Cloud} label="Usage mode" value={usageMode} />
        <Metric icon={DollarSign} label="Total cost" value={formatCost(usage.totalCost)} />
      </section>

      <section className="activity-panel" aria-labelledby="activity-title">
        <div className="activity-panel-header">
          <h2 id="activity-title">Dictation activity (7 days)</h2>
          <button type="button">7 Days</button>
        </div>
        <ActivityChart days={chartDays} />
      </section>

      <section className="general-status-grid" aria-label="Configuration status">
        <StatusCard
          description="Speech recognition provider used before rewrite."
          icon={Mic}
          label="ASR model"
          value={readiness.stt.ready ? config.providers.stt.model : "Not Set"}
          ready={readiness.stt.ready}
          onClick={() => onOpenProviders("stt")}
        />
        <StatusCard
          description="Writing model that cleans up the recognized text."
          icon={WandSparkles}
          label="Rewrite model"
          value={readiness.rewrite.ready ? config.providers.rewrite.model : "Not Set"}
          ready={readiness.rewrite.ready}
          onClick={() => onOpenProviders("rewrite")}
        />
        <StatusCard
          description="Current writing behavior used for new dictation."
          icon={UserRound}
          label="Active Profile"
          value={activeProfileReady ? activeProfile.name : "Not Set"}
          ready={activeProfileReady}
          onClick={onOpenProfiles}
        />
      </section>
    </section>
  );
}

function Hotkey({ binding }: { binding: string }) {
  const parts = binding.split("+").map((part) => part.trim()).filter(Boolean);
  return (
    <span className="hotkey-combo" aria-label={binding}>
      {parts.map((part, index) => (
        <span className="hotkey-part" key={`${part}-${index}`}>
          {index > 0 ? <span className="hotkey-separator" aria-hidden="true">+</span> : null}
          <kbd className="hotkey-key">{part}</kbd>
        </span>
      ))}
    </span>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <article className="general-metric">
      <span className="general-metric-icon" aria-hidden="true">
        <Icon size={22} strokeWidth={1.9} />
      </span>
      <span className="general-metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
      </span>
    </article>
  );
}

function StatusCard({
  description,
  icon: Icon,
  label,
  value,
  ready,
  onClick,
}: {
  description: string;
  icon: LucideIcon;
  label: string;
  value: string;
  ready: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={`${label}: ${value}`}
      className={`general-status-card ${ready ? "is-ready" : "is-not-ready"}`}
      onClick={onClick}
      type="button"
    >
      <span className="general-status-main">
        <span className="general-status-icon" aria-hidden="true">
          <Icon size={22} strokeWidth={1.9} />
        </span>
        <span className="general-status-copy">
          <strong className="general-status-title">{label}</strong>
          <span className="general-status-description">{description}</span>
        </span>
      </span>
      <span className="general-status-divider" aria-hidden="true" />
      <span className="general-status-value">{value}</span>
      <ChevronRight className="general-status-chevron" size={18} strokeWidth={1.9} aria-hidden="true" />
    </button>
  );
}

function ActivityChart({ days }: { days: ActivityDay[] }) {
  const maxMinutes = Math.max(30, ...days.map((day) => day.minutes));
  const points = days.map((day, index) => {
    const x = 44 + index * 130;
    const y = 150 - (day.minutes / maxMinutes) * 120;
    return { ...day, x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const lastPoint = points[points.length - 1];
  const area = `${path} L ${lastPoint?.x ?? 824} 150 L ${points[0]?.x ?? 44} 150 Z`;

  return (
    <div className="activity-chart" aria-label="Minutes dictated over the last 7 days">
      <svg viewBox="0 0 870 190" role="img" aria-labelledby="activity-chart-title">
        <title id="activity-chart-title">Last 7 days of dictation minutes</title>
        {[30, 20, 10, 0].map((tick) => {
          const y = 150 - (tick / maxMinutes) * 120;
          return (
            <g key={tick}>
              <text x="0" y={y + 4}>{tick}m</text>
              <line x1="42" x2="852" y1={y} y2={y} />
            </g>
          );
        })}
        <path className="activity-chart-area" d={area} />
        <path className="activity-chart-line" d={path} />
        {points.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="4" />
            <text className="activity-chart-label" x={point.x - 24} y="178">{point.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

type ActivityDay = {
  label: string;
  minutes: number;
};

function buildWeeklyActivity(events: UsageEventRecord[], now = new Date()): ActivityDay[] {
  const formatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const next = new Date(date);
    next.setDate(date.getDate() + 1);
    const seconds = events.reduce((total, event) => {
      const createdAt = new Date(event.created_at).getTime();
      if (createdAt >= date.getTime() && createdAt < next.getTime()) {
        return total + (event.audio_seconds ?? 0);
      }
      return total;
    }, 0);
    return {
      label: formatter.format(date),
      minutes: Math.round(seconds / 60),
    };
  });
}

function formatDuration(seconds: number): string {
  const value = Math.max(0, Math.round(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = value % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}
