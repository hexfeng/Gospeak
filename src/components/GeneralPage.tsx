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
              Press <kbd>{config.hotkey.binding}</kbd> to start dictating.
            </>
          ) : (
            "Set a shortcut to start dictating."
          )}
        </p>
      </header>

      <section className="general-metrics" aria-label="All-time usage">
        <Metric label="Total dictation time" value={formatDuration(usage.totalAudioSeconds)} />
        <Metric label="Total characters" value={usage.totalCharacterCount.toLocaleString()} />
        <Metric label="Usage mode" value={readiness.stt.ready ? "Cloud" : "Not Set"} />
        <Metric label="Total cost" value={formatCost(usage.totalCost)} />
      </section>

      <section className="general-status-grid" aria-label="Configuration status">
        <StatusCard
          label="ASR"
          value={readiness.stt.ready ? config.providers.stt.model : "Not Set"}
          ready={readiness.stt.ready}
          onClick={() => onOpenSettings("providers")}
        />
        <StatusCard
          label="Rewrite"
          value={readiness.rewrite.ready ? config.providers.rewrite.model : "Not Set"}
          ready={readiness.rewrite.ready}
          onClick={() => onOpenSettings("providers")}
        />
        <StatusCard
          label="Active Profile"
          value={activeProfileReady ? activeProfile.name : "Not Set"}
          ready={activeProfileReady}
          onClick={onOpenProfiles}
        />
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="general-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function StatusCard({
  label,
  value,
  ready,
  onClick,
}: {
  label: string;
  value: string;
  ready: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`general-status-card ${ready ? "is-ready" : "is-not-ready"}`}
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
      <strong>{value}</strong>
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
