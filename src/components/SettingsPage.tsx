import { Download, Upload } from "lucide-react";
import type { AppConfig } from "../domain/config";
import { Button, Card, PageHeader } from "./ui";

type SettingsPageProps = {
  config: AppConfig;
  onChangeHotkey: (next: Partial<AppConfig["hotkey"]>) => void;
  onChangePrivacy: (key: keyof AppConfig["privacy"], enabled: boolean) => void;
  onChangeFastMode: (enabled: boolean) => void;
  onChangeSpeakToEdit: (enabled: boolean) => void;
  onChangeAppRouting: (enabled: boolean) => void;
  onExport: () => void;
  onImport: () => void;
};

export function SettingsPage(props: SettingsPageProps) {
  return (
    <section className="module-panel settings-page" aria-labelledby="settings-title">
      <PageHeader
        description="Dictation behavior, privacy, data, and advanced options."
        title="Settings"
        titleId="settings-title"
      />

      <div className="settings-sections">
        <SettingsSection
          description="Control how Gospeak starts and processes dictation."
          title="Dictation"
        >
          <div className="compact-form">
            <label>
              Hotkey binding
              <input
                defaultValue={props.config.hotkey.binding}
                key={props.config.hotkey.binding}
                onBlur={(event) => props.onChangeHotkey({ binding: event.target.value })}
              />
            </label>
            <label>
              Hotkey mode
              <select
                onChange={(event) => props.onChangeHotkey({ mode: event.target.value as AppConfig["hotkey"]["mode"] })}
                value={props.config.hotkey.mode}
              >
                <option value="push-to-talk">Push-to-talk</option>
                <option value="toggle">Toggle</option>
              </select>
            </label>
            <Toggle
              checked={props.config.performance.fastMode}
              label="Fast dictation"
              onChange={props.onChangeFastMode}
            />
            <Toggle
              checked={props.config.performance.speakToEdit}
              label="Speak to Edit"
              onChange={props.onChangeSpeakToEdit}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          description="Raw audio is local. Configuration exports never include Provider keys."
          title="Privacy & Data"
        >
          <div className="privacy-list">
            <Toggle
              checked={props.config.privacy.saveRawAudio}
              label="Save raw audio"
              onChange={(enabled) => props.onChangePrivacy("saveRawAudio", enabled)}
            />
          </div>
          <div className="button-row">
            <Button onClick={props.onExport} type="button"><Download size={15} /> Export configuration</Button>
            <Button onClick={props.onImport} type="button"><Upload size={15} /> Import configuration</Button>
          </div>
        </SettingsSection>

        <SettingsSection
          description="Use the foreground application to select a Profile rule."
          title="Advanced"
        >
          <div className="privacy-list">
            <Toggle
              checked={props.config.appRouting.enabled}
              label="Enable app-aware routing"
              onChange={props.onChangeAppRouting}
            />
          </div>
        </SettingsSection>
      </div>
    </section>
  );
}

function SettingsSection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card className="settings-section">
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </Card>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <label className="privacy-line">
      <span>{label}</span>
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}
