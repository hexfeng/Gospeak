import { Download, Upload } from "lucide-react";
import {
  REWRITE_PROVIDER_OPTIONS,
  STT_PROVIDER_OPTIONS,
  type ApiKeyPresence,
  type AppConfig,
  type CredentialProviderId,
  type RewriteProviderId,
  type SttProviderId,
} from "../domain/config";
import type { SettingsTab } from "../domain/navigation";

type SettingsPageProps = {
  activeTab: SettingsTab;
  config: AppConfig;
  keyPresence: ApiKeyPresence;
  keyDrafts: Partial<Record<CredentialProviderId, string>>;
  onTabChange: (tab: SettingsTab) => void;
  onKeyDraftChange: (provider: CredentialProviderId, value: string) => void;
  onSaveKey: (provider: CredentialProviderId, key: string) => void;
  onRefreshKeys: () => void;
  onChangeHotkey: (next: Partial<AppConfig["hotkey"]>) => void;
  onChangeProviderModel: (kind: "stt" | "rewrite", model: string) => void;
  onChangeSttProvider: (provider: SttProviderId) => void;
  onChangeRewriteProvider: (provider: RewriteProviderId) => void;
  onChangeSttBaseUrl: (baseUrl: string) => void;
  onChangePrivacy: (
    key: keyof AppConfig["privacy"],
    enabled: boolean,
  ) => void;
  onChangeFastMode: (enabled: boolean) => void;
  onChangeSpeakToEdit: (enabled: boolean) => void;
  onChangeAppRouting: (enabled: boolean) => void;
  onExport: () => void;
  onImport: () => void;
};

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "dictation", label: "Dictation" },
  { id: "providers", label: "Providers" },
  { id: "privacy-data", label: "Privacy & Data" },
  { id: "advanced", label: "Advanced" },
];

export function SettingsPage(props: SettingsPageProps) {
  return (
    <section className="panel module-panel settings-page" aria-labelledby="settings-title">
      <header className="page-heading">
        <div>
          <h1 id="settings-title">Settings</h1>
          <p>Low-frequency Gospeak configuration.</p>
        </div>
      </header>
      <div aria-label="Settings sections" className="settings-tabs" role="tablist">
        {tabs.map((tab, index) => (
          <button
            aria-controls="settings-content"
            aria-selected={props.activeTab === tab.id}
            className={
              props.activeTab === tab.id ? "settings-tab-active" : undefined
            }
            id={`settings-tab-${tab.id}`}
            key={tab.id}
            onClick={() => props.onTabChange(tab.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const delta = event.key === "ArrowRight" ? 1 : -1;
              const nextIndex = (index + delta + tabs.length) % tabs.length;
              props.onTabChange(tabs[nextIndex].id);
              const tabButtons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                "[role='tab']",
              );
              tabButtons?.[nextIndex]?.focus();
            }}
            role="tab"
            tabIndex={props.activeTab === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <section
        aria-labelledby={`settings-tab-${props.activeTab}`}
        className="settings-content"
        id="settings-content"
        role="tabpanel"
      >
        {props.activeTab === "dictation" ? <DictationSettings {...props} /> : null}
        {props.activeTab === "providers" ? <ProviderSettings {...props} /> : null}
        {props.activeTab === "privacy-data" ? <PrivacyDataSettings {...props} /> : null}
        {props.activeTab === "advanced" ? <AdvancedSettings {...props} /> : null}
      </section>
    </section>
  );
}

function DictationSettings(props: SettingsPageProps) {
  return (
    <div className="compact-form">
      <label>
        Hotkey binding
        <input
          defaultValue={props.config.hotkey.binding}
          key={props.config.hotkey.binding}
          onBlur={(event) =>
            props.onChangeHotkey({ binding: event.target.value })
          }
        />
      </label>
      <label>
        Hotkey mode
        <select
          value={props.config.hotkey.mode}
          onChange={(event) =>
            props.onChangeHotkey({
              mode: event.target.value as AppConfig["hotkey"]["mode"],
            })
          }
        >
          <option value="push-to-talk">Push-to-talk</option>
          <option value="toggle">Toggle</option>
        </select>
      </label>
      <label className="checkbox-line">
        <span>Fast dictation</span>
        <input
          checked={props.config.performance.fastMode}
          onChange={(event) => props.onChangeFastMode(event.target.checked)}
          type="checkbox"
        />
      </label>
      <label className="checkbox-line">
        <span>Speak to Edit</span>
        <input
          checked={props.config.performance.speakToEdit}
          onChange={(event) => props.onChangeSpeakToEdit(event.target.checked)}
          type="checkbox"
        />
      </label>
    </div>
  );
}

function ProviderSettings(props: SettingsPageProps) {
  const sttOption = STT_PROVIDER_OPTIONS.find(
    (option) => option.id === props.config.providers.stt.providerId,
  )!;
  const rewriteOption = REWRITE_PROVIDER_OPTIONS.find(
    (option) => option.id === props.config.providers.rewrite.providerId,
  )!;
  const credentialProviders = providerCredentials(props.config);

  return (
    <div className="providers-panel">
      <div className="provider-row">
        <div>
          <h3>Speech recognition</h3>
          <p>{sttOption.label}</p>
        </div>
        <label>
          ASR provider
          <select
            value={props.config.providers.stt.providerId}
            onChange={(event) =>
              props.onChangeSttProvider(event.target.value as SttProviderId)
            }
          >
            {STT_PROVIDER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          STT model
          <select
            value={props.config.providers.stt.model}
            onChange={(event) => props.onChangeProviderModel("stt", event.target.value)}
          >
            {sttOption.models.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </label>
      </div>
      {props.config.providers.stt.providerId === "qwen-local" ||
      props.config.providers.stt.providerId === "qwen-api" ? (
        <label>
          ASR base URL
          <input
            aria-label="ASR base URL"
            onChange={(event) => props.onChangeSttBaseUrl(event.target.value)}
            placeholder={sttOption.defaultBaseUrl}
            value={props.config.providers.stt.baseUrl ?? ""}
          />
        </label>
      ) : null}
      <div className="provider-row">
        <div>
          <h3>Rewrite</h3>
          <p>{rewriteOption.label}</p>
        </div>
        <label>
          Rewrite provider
          <select
            value={props.config.providers.rewrite.providerId}
            onChange={(event) =>
              props.onChangeRewriteProvider(
                event.target.value as RewriteProviderId,
              )
            }
          >
            {REWRITE_PROVIDER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          Rewrite model
          <select
            value={props.config.providers.rewrite.model}
            onChange={(event) =>
              props.onChangeProviderModel("rewrite", event.target.value)
            }
          >
            {rewriteOption.models.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </label>
      </div>
      {credentialProviders.map((provider) => {
        const value = props.keyDrafts[provider] ?? "";
        const label = credentialLabel(provider);
        return (
          <div className="key-row" key={provider}>
            <input
              aria-label={`${label} API key`}
              onChange={(event) =>
                props.onKeyDraftChange(provider, event.target.value)
              }
              placeholder={`${label} API key`}
              type="password"
              value={value}
            />
            <button
              disabled={!value.trim()}
              onClick={() => props.onSaveKey(provider, value)}
              type="button"
            >
              Save {label} key
            </button>
            <span>{props.keyPresence[provider] ? "Key ready" : "Key missing"}</span>
          </div>
        );
      })}
      <div className="message-row">
        <span>Keys stay in the OS credential store.</span>
        <button onClick={props.onRefreshKeys} type="button">
          Refresh key status
        </button>
      </div>
    </div>
  );
}

function PrivacyDataSettings(props: SettingsPageProps) {
  const privacyControls: Array<{
    key: keyof AppConfig["privacy"];
    label: string;
  }> = [
    { key: "saveRawAudio", label: "Save raw audio" },
  ];

  return (
    <>
      <div className="privacy-list">
        {privacyControls.map((control) => (
          <label className="privacy-line" key={control.key}>
            <span>{control.label}</span>
            <input
              checked={props.config.privacy[control.key]}
              onChange={(event) =>
                props.onChangePrivacy(control.key, event.target.checked)
              }
              type="checkbox"
            />
          </label>
        ))}
      </div>
      <div className="button-row">
        <button onClick={props.onExport} type="button">
          <Download size={15} />
          Export configuration
        </button>
        <button onClick={props.onImport} type="button">
          <Upload size={15} />
          Import configuration
        </button>
      </div>
    </>
  );
}

function AdvancedSettings(props: SettingsPageProps) {
  return (
    <div className="privacy-list">
      <label className="privacy-line">
        <span>Enable app-aware routing</span>
        <input
          checked={props.config.appRouting.enabled}
          onChange={(event) => props.onChangeAppRouting(event.target.checked)}
          type="checkbox"
        />
      </label>
    </div>
  );
}

function providerCredentials(config: AppConfig): CredentialProviderId[] {
  const providers: CredentialProviderId[] = [];
  const sttCredential: CredentialProviderId | null =
    config.providers.stt.providerId === "openai-realtime"
      ? "openai"
      : config.providers.stt.providerId === "qwen-local"
        ? null
        : config.providers.stt.providerId;
  if (sttCredential) providers.push(sttCredential);
  if (!providers.includes(config.providers.rewrite.providerId)) {
    providers.push(config.providers.rewrite.providerId);
  }
  return providers;
}

function credentialLabel(provider: CredentialProviderId): string {
  return {
    groq: "Groq",
    openai: "OpenAI",
    "qwen-api": "Qwen",
    doubao: "Doubao",
    deepseek: "DeepSeek",
  }[provider];
}
