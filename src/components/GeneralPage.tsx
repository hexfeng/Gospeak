import {
  Activity,
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
import type { SettingsTab } from "../domain/navigation";
import type { UsageEventRecord } from "../lib/tauri";

type GeneralPageProps = {
  config: AppConfig;
  keyPresence: ApiKeyPresence;
  profiles: PromptProfile[];
  usageEvents: UsageEventRecord[];
  onOpenProfiles: () => void;
  onOpenSettings: (tab: SettingsTab) => void;
};

export function GeneralPage({
  config,
  keyPresence,
  profiles,
  usageEvents,
  onOpenProfiles,
  onOpenSettings,
}: GeneralPageProps) {
  const readiness = getProviderReadiness(config, keyPresence);
  const usage = summarizeUsage(usageEvents);
  const activeProfile = profiles.find((profile) => profile.id === config.activeProfileId);
  const hotkeyReady = Boolean(config.hotkey.binding.trim());
  const activeProfileReady = activeProfile?.enabled === true;

  return (
    <section className="module-panel general-page" aria-labelledby="general-title">
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

      <section className="general-metrics" aria-label="All-time usage">
        <Metric
          icon={Clock3}
          label="Total dictation time"
          value={formatDuration(usage.totalAudioSeconds)}
        />
        <Metric icon={FileText} label="Total characters" value={usage.totalCharacterCount.toLocaleString()} />
        <Metric icon={Cloud} label="Usage mode" value={readiness.stt.ready ? "Cloud" : "Not Set"} />
        <Metric icon={DollarSign} label="Total cost" value={formatCost(usage.totalCost)} />
      </section>

      <section className="general-status-grid" aria-label="Configuration status">
        <StatusCard
          description="Speech recognition provider used before rewrite."
          icon={Mic}
          label="Speech-to-text model - ASR"
          value={readiness.stt.ready ? config.providers.stt.model : "Not Set"}
          ready={readiness.stt.ready}
          onClick={() => onOpenSettings("providers")}
        />
        <StatusCard
          description="Writing model that cleans up the recognized text."
          icon={WandSparkles}
          label="Rewrite model"
          value={readiness.rewrite.ready ? config.providers.rewrite.model : "Not Set"}
          ready={readiness.rewrite.ready}
          onClick={() => onOpenSettings("providers")}
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
      <span className="general-status-chart" aria-hidden="true">
        <Activity size={18} strokeWidth={1.8} />
      </span>
      <span className="general-status-icon" aria-hidden="true">
        <Icon size={22} strokeWidth={1.9} />
      </span>
      <strong className="general-status-title">{label}</strong>
      <span className="general-status-description">{description}</span>
      <span className="general-status-value">{value}</span>
    </button>
  );
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
