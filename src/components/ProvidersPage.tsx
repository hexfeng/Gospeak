import { useEffect, useRef, useState } from "react";
import { ArrowRight, KeyRound, Plus, RefreshCw } from "lucide-react";
import {
  REWRITE_PROVIDER_OPTIONS,
  STT_PROVIDER_OPTIONS,
  type CredentialProviderId,
  type RewriteProviderId,
  type SttProviderId,
} from "../domain/config";
import {
  activeProviderPair,
  configurationStatus,
  type ConfigurationKeyPresence,
  type ProviderConfiguration,
  type ProviderConfigurationState,
  type ProviderConfigurationStatus,
} from "../domain/providerConfigurations";

type ProvidersPageProps = {
  state: ProviderConfigurationState;
  keyPresence: ConfigurationKeyPresence;
  onSave: (configuration: ProviderConfiguration, apiKey?: string) => Promise<void>;
  onActivate: (configurationId: string) => Promise<void>;
  onDelete: (configuration: ProviderConfiguration) => Promise<void>;
  onRemoveKey: (configuration: ProviderConfiguration) => Promise<void>;
  onRefresh: () => Promise<void>;
  focus?: { kind: ProviderConfiguration["kind"]; configurationId: string; requestId: number };
};

type DialogState =
  | {
      mode: "new";
      kind: ProviderConfiguration["kind"];
      providerId?: ProviderConfiguration["providerId"];
    }
  | { mode: "preview" | "edit"; configuration: ProviderConfiguration }
  | null;

const statusCopy: Record<ProviderConfigurationStatus, string> = {
  configured: "Configured",
  "missing-key": "Missing key",
  "missing-endpoint": "Missing endpoint",
  "invalid-endpoint": "Invalid endpoint",
  incomplete: "Incomplete",
};

export function ProvidersPage(props: ProvidersPageProps) {
  const [kind, setKind] = useState<ProviderConfiguration["kind"]>(props.focus?.kind ?? "stt");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pageError, setPageError] = useState("");
  const active = activeProviderPair(props.state);
  const options = kind === "stt" ? STT_PROVIDER_OPTIONS : REWRITE_PROVIDER_OPTIONS;

  useEffect(() => {
    if (!props.focus) return;
    requestAnimationFrame(() => {
      document.getElementById(`provider-configuration-${props.focus?.configurationId}`)?.focus();
    });
  }, [props.focus]);

  return (
    <section className="module-panel providers-page" aria-labelledby="providers-title">
      <header className="page-heading">
        <div>
          <h1 id="providers-title">Providers</h1>
          <p>Manage named ASR and Rewrite configurations. Availability is evaluated locally.</p>
        </div>
        <button className="primary-action" onClick={() => setDialog({ mode: "new", kind })} type="button">
          <Plus size={16} /> Add configuration
        </button>
      </header>

      <section className="pipeline-summary" aria-label="Current dictation pipeline">
        <PipelineStep label="ASR" configuration={active.stt} presence={props.keyPresence} onSelect={() => {
          setKind("stt");
          requestAnimationFrame(() => document.getElementById(`provider-configuration-${active.stt.id}`)?.focus());
        }} />
        <ArrowRight aria-hidden="true" size={20} />
        <PipelineStep label="Rewrite" configuration={active.rewrite} presence={props.keyPresence} onSelect={() => {
          setKind("rewrite");
          requestAnimationFrame(() => document.getElementById(`provider-configuration-${active.rewrite.id}`)?.focus());
        }} />
      </section>

      <div className="provider-toolbar">
        <div className="segmented-control" aria-label="Provider type" role="tablist">
          <button aria-selected={kind === "stt"} onClick={() => setKind("stt")} role="tab" type="button">ASR</button>
          <button aria-selected={kind === "rewrite"} onClick={() => setKind("rewrite")} role="tab" type="button">Rewrite</button>
        </div>
        <button onClick={() => void props.onRefresh()} type="button">
          <RefreshCw size={15} /> Refresh local status
        </button>
      </div>

      {pageError ? <p className="app-message" role="alert">{pageError}</p> : null}

      <div className="provider-groups">
        {options.map((option) => {
          const configurations = props.state.configurations.filter(
            (item) => item.kind === kind && item.providerId === option.id,
          );
          return (
            <section className="provider-group" key={option.id}>
              <header>
                <div>
                  <h2>{option.label}</h2>
                  <p>{configurations.length} saved configuration{configurations.length === 1 ? "" : "s"}</p>
                </div>
                <button
                  onClick={() => setDialog({ mode: "new", kind, providerId: option.id })}
                  type="button"
                >
                  <Plus size={14} /> Add
                </button>
              </header>
              {configurations.length ? (
                <div className="provider-config-list">
                  {configurations.map((configuration) => {
                    const status = configurationStatus(configuration, props.keyPresence);
                    const isActive =
                      configuration.id === props.state.activeAsrConfigId ||
                      configuration.id === props.state.activeRewriteConfigId;
                    return (
                      <article className="provider-config-card" id={`provider-configuration-${configuration.id}`} key={configuration.id} tabIndex={-1}>
                        <div>
                          <strong>{configuration.name}</strong>
                          <span>{configuration.model}</span>
                          {configuration.baseUrl ? <span>{configuration.baseUrl}</span> : null}
                          <span>Updated {formatDate(configuration.updatedAt)}</span>
                        </div>
                        <span className={`configuration-status status-${status}`}>{statusCopy[status]}</span>
                        <div className="provider-config-actions">
                          {isActive ? (
                            <span className="active-config-label">Active</span>
                          ) : (
                            <button
                              onClick={() => {
                                setPageError("");
                                void props.onActivate(configuration.id).catch(() => {
                                  setPageError("Could not activate this configuration. The previous active configuration was kept.");
                                });
                              }}
                              type="button"
                            >
                              Use configuration
                            </button>
                          )}
                          <button onClick={() => setDialog({ mode: "preview", configuration })} type="button">Preview</button>
                          <button onClick={() => setDialog({ mode: "edit", configuration })} type="button">Edit</button>
                          <button
                            disabled={isActive}
                            onClick={() => {
                              if (window.confirm(`Delete ${configuration.name}?`)) {
                                setPageError("");
                                void props.onDelete(configuration).catch(() => {
                                  setPageError("Could not delete this configuration. It remains available to retry.");
                                });
                              }
                            }}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="empty-note">No saved configurations for this Provider.</p>
              )}
            </section>
          );
        })}
      </div>

      {dialog ? (
        <ProviderDialog
          key={dialog.mode === "new" ? `${dialog.mode}-${dialog.kind}` : `${dialog.mode}-${dialog.configuration.id}`}
          keyPresence={props.keyPresence}
          onClose={() => setDialog(null)}
          onEdit={(configuration) => setDialog({ mode: "edit", configuration })}
          onRemoveKey={props.onRemoveKey}
          onSave={props.onSave}
          state={dialog}
        />
      ) : null}
    </section>
  );
}

function PipelineStep({
  label,
  configuration,
  presence,
  onSelect,
}: {
  label: string;
  configuration: ProviderConfiguration;
  presence: ConfigurationKeyPresence;
  onSelect: () => void;
}) {
  const status = configurationStatus(configuration, presence);
  return (
    <button className="pipeline-step" onClick={onSelect} type="button">
      <span>{label}</span>
      <strong>{configuration.name}</strong>
      <small>{providerLabel(configuration.providerId)} · {configuration.model}</small>
      <span className={`configuration-status status-${status}`}>{statusCopy[status]}</span>
    </button>
  );
}

function ProviderDialog(props: {
  state: Exclude<DialogState, null>;
  keyPresence: ConfigurationKeyPresence;
  onClose: () => void;
  onEdit: (configuration: ProviderConfiguration) => void;
  onSave: ProvidersPageProps["onSave"];
  onRemoveKey: ProvidersPageProps["onRemoveKey"];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const original = props.state.mode === "new" ? undefined : props.state.configuration;
  const readOnly = props.state.mode === "preview";
  const kind = props.state.mode === "new" ? props.state.kind : props.state.configuration.kind;
  const providerOptions = kind === "stt" ? STT_PROVIDER_OPTIONS : REWRITE_PROVIDER_OPTIONS;
  const initialProvider =
    original?.providerId ??
    (props.state.mode === "new" ? props.state.providerId : undefined) ??
    providerOptions[0].id;
  const [providerId, setProviderId] = useState(initialProvider);
  const selectedOption = providerOptions.find((option) => option.id === providerId)!;
  const [name, setName] = useState(original?.name ?? "");
  const [model, setModel] = useState(original?.model ?? selectedOption.models[0]);
  const [baseUrl, setBaseUrl] = useState(
    original?.baseUrl ?? optionDefaultBaseUrl(selectedOption),
  );
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const credentialProvider = credentialProviderFor(providerId);
  const hasKey = original ? Boolean(props.keyPresence[original.id]) : false;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const title = props.state.mode === "new"
    ? `Add ${kind === "stt" ? "ASR" : "Rewrite"} configuration`
    : props.state.mode === "edit"
      ? "Edit Provider configuration"
      : "Provider configuration";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    if (!name.trim()) {
      setError("Configuration name is required.");
      return;
    }
    const now = new Date().toISOString();
    setSaving(true);
    try {
      await props.onSave(
        {
          id: original?.id ?? `provider_${crypto.randomUUID()}`,
          name: name.trim(),
          kind,
          providerId: providerId as SttProviderId | RewriteProviderId,
          model,
          ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
          createdAt: original?.createdAt ?? now,
          updatedAt: now,
        },
        apiKey.trim() || undefined,
      );
      props.onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save configuration.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog aria-label={title} onClose={props.onClose} ref={dialogRef}>
      <form onSubmit={submit}>
        <h2>{title}</h2>
        <label>
          Configuration name
          <input disabled={readOnly} onChange={(event) => setName(event.target.value)} value={name} />
        </label>
        <label>
          Provider
          <select
            disabled={readOnly || Boolean(original)}
            onChange={(event) => {
              const nextProvider = event.target.value;
              const nextOption = providerOptions.find((option) => option.id === nextProvider)!;
              setProviderId(nextProvider as typeof providerId);
              setModel(nextOption.models[0]);
              setBaseUrl(optionDefaultBaseUrl(nextOption));
            }}
            value={providerId}
          >
            {providerOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Model
          <select disabled={readOnly} onChange={(event) => setModel(event.target.value)} value={model}>
            {selectedOption.models.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        {providerId === "qwen-local" || providerId === "qwen-api" ? (
          <label>
            Base URL
            <input disabled={readOnly} onChange={(event) => setBaseUrl(event.target.value)} value={baseUrl} />
          </label>
        ) : null}
        {credentialProvider ? (
          <label>
            API key
            <input
              autoComplete="off"
              disabled={readOnly}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={hasKey ? "Saved key · leave blank to keep" : "Enter API key"}
              type="password"
              value={apiKey}
            />
          </label>
        ) : null}
        {readOnly ? (
          <>
            <p>Created {formatDate(original?.createdAt ?? "")} · Updated {formatDate(original?.updatedAt ?? "")}</p>
            <p className="credential-note"><KeyRound size={14} /> {hasKey ? "Credential is available in the OS credential store." : "No credential is available."}</p>
          </>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        <div className="button-row">
          {readOnly && original ? <button onClick={() => props.onEdit(original)} type="button">Edit</button> : null}
          {!readOnly ? <button disabled={saving} type="submit">Save configuration</button> : null}
          {!readOnly && original && hasKey ? (
            <button
              onClick={() => {
                if (window.confirm("Remove the saved credential from this configuration?")) {
                  setSaving(true);
                  setError("");
                  void props.onRemoveKey(original)
                    .then(props.onClose)
                    .catch(() => setError("Could not remove the saved key."))
                    .finally(() => setSaving(false));
                }
              }}
              type="button"
            >
              Remove saved key
            </button>
          ) : null}
          <button onClick={props.onClose} type="button">{readOnly ? "Close" : "Cancel"}</button>
        </div>
      </form>
    </dialog>
  );
}

function credentialProviderFor(providerId: string): CredentialProviderId | null {
  if (providerId === "qwen-local") return null;
  if (providerId === "openai-realtime") return "openai";
  return providerId as CredentialProviderId;
}

function providerLabel(providerId: string) {
  return STT_PROVIDER_OPTIONS.find((option) => option.id === providerId)?.label ??
    REWRITE_PROVIDER_OPTIONS.find((option) => option.id === providerId)?.label ??
    providerId;
}

function optionDefaultBaseUrl(option: object) {
  return "defaultBaseUrl" in option && typeof option.defaultBaseUrl === "string"
    ? option.defaultBaseUrl
    : "";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString();
}
