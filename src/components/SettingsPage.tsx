import { Download, Upload } from "lucide-react";
import type { ApiKeyPresence, AppConfig } from "../domain/config";
import type { SettingsTab } from "../domain/navigation";

type SettingsPageProps = {
  activeTab: SettingsTab;
  config: AppConfig;
  keyPresence: ApiKeyPresence;
  groqKey: string;
  openAiKey: string;
  onTabChange: (tab: SettingsTab) => void;
  onGroqKeyChange: (value: string) => void;
  onOpenAiKeyChange: (value: string) => void;
  onSaveKey: (provider: "groq" | "openai", key: string) => void;
  onRefreshKeys: () => void;
  onChangeHotkey: (next: Partial<AppConfig["hotkey"]>) => void;
  onChangeProviderModel: (kind: "stt" | "rewrite", model: string) => void;
  onChangePrivacy: (
    key: keyof AppConfig["privacy"],
    enabled: boolean,
  ) => void;
  onChangeFastMode: (enabled: boolean) => void;
  onChangeSpeakToEdit: (enabled: boolean) => void;
  onChangeStreamingMode: (enabled: boolean) => void;
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
  return (
    <div className="providers-panel">
      <div className="provider-row">
        <div>
          <h3>Groq STT</h3>
          <p>{props.keyPresence.groq ? "Key ready" : "Key missing"}</p>
        </div>
        <label>
          STT model
          <select
            value={props.config.providers.stt.model}
            onChange={(event) => props.onChangeProviderModel("stt", event.target.value)}
          >
            <option value="whisper-large-v3-turbo">whisper-large-v3-turbo</option>
            <option value="whisper-large-v3">whisper-large-v3</option>
          </select>
        </label>
      </div>
      <div className="key-row">
        <input
          aria-label="Groq API key"
          onChange={(event) => props.onGroqKeyChange(event.target.value)}
          placeholder="Groq API key"
          type="password"
          value={props.groqKey}
        />
        <button
          disabled={!props.groqKey.trim()}
          onClick={() => props.onSaveKey("groq", props.groqKey)}
          type="button"
        >
          Save Groq key
        </button>
      </div>
      <div className="provider-row">
        <div>
          <h3>OpenAI Rewrite</h3>
          <p>{props.keyPresence.openai ? "Key ready" : "Key missing"}</p>
        </div>
        <label>
          Rewrite model
          <select
            value={props.config.providers.rewrite.model}
            onChange={(event) =>
              props.onChangeProviderModel("rewrite", event.target.value)
            }
          >
            <option value="gpt-5-nano">gpt-5-nano</option>
            <option value="gpt-5-mini">gpt-5-mini</option>
          </select>
        </label>
      </div>
      <div className="key-row">
        <input
          aria-label="OpenAI API key"
          onChange={(event) => props.onOpenAiKeyChange(event.target.value)}
          placeholder="OpenAI API key"
          type="password"
          value={props.openAiKey}
        />
        <button
          disabled={!props.openAiKey.trim()}
          onClick={() => props.onSaveKey("openai", props.openAiKey)}
          type="button"
        >
          Save OpenAI key
        </button>
      </div>
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
    { key: "saveTranscriptHistory", label: "Save transcript history" },
    { key: "syncTranscriptHistory", label: "Sync transcript history" },
    {
      key: "crashReportIncludesTranscript",
      label: "Crash report includes transcript",
    },
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
      <label className="privacy-line">
        <span>
          <strong>Experimental streaming dictation</strong>
          <small>Experimental</small>
        </span>
        <input
          checked={props.config.performance.streamingMode}
          onChange={(event) => props.onChangeStreamingMode(event.target.checked)}
          type="checkbox"
        />
      </label>
    </div>
  );
}
