import type { ReactNode } from "react";
import { Play } from "lucide-react";
import {
  getProviderReadiness,
  type ApiKeyPresence,
  type AppConfig,
  type PromptProfile,
} from "../domain/config";
import { recentUsageEvents, summarizeUsage } from "../domain/usage";
import type { SettingsTab } from "../domain/navigation";
import type { UsageEventRecord } from "../lib/tauri";

type GeneralPageProps = {
  config: AppConfig;
  keyPresence: ApiKeyPresence;
  profiles: PromptProfile[];
  usageEvents: UsageEventRecord[];
  isDictationBusy: boolean;
  dictationLabel: string;
  diagnostics: ReactNode;
  onStartDictation: () => void;
  onOpenProfiles: () => void;
  onOpenSettings: (tab: SettingsTab) => void;
};

export function GeneralPage(props: GeneralPageProps) {
  const readiness = getProviderReadiness(props.config, props.keyPresence);
  const usage = summarizeUsage(props.usageEvents);
  const recent = recentUsageEvents(props.usageEvents);
  const activeProfile = props.profiles.find(
    (profile) => profile.id === props.config.activeProfileId,
  );
  const hotkeyReady = Boolean(props.config.hotkey.binding.trim());
  const activeProfileReady = activeProfile?.enabled === true;
  const ready =
    readiness.stt.ready &&
    readiness.rewrite.ready &&
    hotkeyReady &&
    activeProfileReady;

  return (
    <section className="module-panel general-page" aria-labelledby="general-title">
      <header className="page-heading">
        <div>
          <h1 id="general-title">General</h1>
          <p>Current readiness, configuration, and private usage summary.</p>
        </div>
        <button
          className="primary-action"
          disabled={props.isDictationBusy}
          onClick={props.onStartDictation}
          type="button"
        >
          <Play size={16} />
          {props.dictationLabel}
        </button>
      </header>

      <strong className={ready ? "health-state good" : "health-state warn"}>
        {ready ? "Ready" : "Needs setup"}
      </strong>

      <section className="summary-grid" aria-label="Readiness">
        <Status label="STT" value={readiness.stt.ready ? "Ready" : readiness.stt.reason} onRepair={readiness.stt.ready ? undefined : () => props.onOpenSettings("providers")} repairLabel="Fix STT" />
        <Status label="Rewrite" value={readiness.rewrite.ready ? "Ready" : readiness.rewrite.reason} onRepair={readiness.rewrite.ready ? undefined : () => props.onOpenSettings("providers")} repairLabel="Fix Rewrite" />
        <Status label="Hotkey" value={hotkeyReady ? `${props.config.hotkey.binding} (${props.config.hotkey.mode})` : "A hotkey binding is required."} onRepair={hotkeyReady ? undefined : () => props.onOpenSettings("dictation")} repairLabel="Fix Hotkey" />
        <Status label="Active Profile" value={activeProfileReady ? activeProfile.name : "Choose an enabled Profile."} onRepair={activeProfileReady ? props.onOpenProfiles : () => props.onOpenProfiles()} repairLabel={activeProfileReady ? `Open Profiles for active profile: ${activeProfile.name}` : "Fix Active Profile"} />
      </section>

      <section aria-labelledby="current-setup-title" className="usage-section">
        <h2 id="current-setup-title">Current setup</h2>
        <div className="summary-grid">
          <button className="summary-item" onClick={() => props.onOpenSettings("providers")} type="button"><span>STT model</span><strong>{props.config.providers.stt.model}</strong></button>
          <button className="summary-item" onClick={() => props.onOpenSettings("providers")} type="button"><span>Rewrite model</span><strong>{props.config.providers.rewrite.model}</strong></button>
          <button className="summary-item" onClick={() => props.onOpenSettings("dictation")} type="button"><span>Dictation</span><strong>{props.config.performance.fastMode ? "Fast" : "Standard"}</strong></button>
          <button className="summary-item" onClick={() => props.onOpenSettings("dictation")} type="button"><span>Speak to Edit</span><strong>{props.config.performance.speakToEdit ? "On" : "Off"}</strong></button>
          <button className="summary-item" onClick={() => props.onOpenSettings("advanced")} type="button"><span>App routing</span><strong>{props.config.appRouting.enabled ? "On" : "Off"}</strong></button>
        </div>
      </section>

      <UsageSummary title="Today's usage" values={[
        ["Dictations", String(usage.todayCount)],
        ["Audio", `${Math.round(usage.todayAudioSeconds / 60)} min`],
        ["Average", usage.todayAverageLatencyMs === null ? "--" : `${usage.todayAverageLatencyMs} ms`],
        ["Fallbacks", String(usage.todayFallbackCount)],
      ]} />

      <UsageSummary title="This month's cost" values={[
        ["STT", `$${usage.monthSttCost.toFixed(4)}`],
        ["Rewrite", `$${usage.monthRewriteCost.toFixed(4)}`],
        ["Total", `$${usage.monthTotalCost.toFixed(4)}`],
      ]} />

      <section aria-labelledby="recent-activity-title">
        <h2 id="recent-activity-title">Recent activity</h2>
        {recent.length === 0 ? <p>No dictations recorded yet.</p> : recent.map((event) => (
          <article className="activity-row" key={event.id}>
            <strong>{event.profile_id}</strong>
            <span>{new Date(event.created_at).toLocaleString()}</span>
            <span>{event.stt_latency_ms + (event.rewrite_latency_ms ?? 0)} ms</span>
            <span>{event.rewrite_fallback_used ? "Raw fallback" : "Completed"}</span>
          </article>
        ))}
      </section>

      {props.diagnostics}
    </section>
  );
}

function Status({ label, value, onRepair, repairLabel }: { label: string; value: string; onRepair?: () => void; repairLabel?: string }) {
  const content = <><span>{label}</span><strong>{value}</strong></>;
  return onRepair ? <button aria-label={repairLabel} className="summary-item" onClick={onRepair} type="button">{content}</button> : <article className="summary-item">{content}</article>;
}

function UsageSummary({ title, values }: { title: string; values: string[][] }) {
  return <section className="usage-section"><h2>{title}</h2><div className="summary-grid">{values.map(([label, value]) => <Status key={label} label={label} value={value} />)}</div></section>;
}
