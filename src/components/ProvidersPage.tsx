import { useEffect, useRef, useState } from "react";
import { ArrowRight, Pencil, Plus, Trash2 } from "lucide-react";
import groqIcon from "../assets/providers/groq.svg";
import openaiIcon from "../assets/providers/openai.svg";
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
import { Button, Card, PageHeader } from "./ui";

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
  | { mode: "new"; kind: ProviderConfiguration["kind"] }
  | { mode: "edit"; configuration: ProviderConfiguration }
  | null;

const PAGE_SIZE = 5;

const statusCopy: Record<ProviderConfigurationStatus, string> = {
  configured: "Configured",
  "missing-key": "Missing key",
  "missing-endpoint": "Missing endpoint",
  "invalid-endpoint": "Invalid endpoint",
  incomplete: "Incomplete",
};

export function ProvidersPage(props: ProvidersPageProps) {
  const initialFocusIndex = props.focus
    ? props.state.configurations.findIndex((item) => item.id === props.focus?.configurationId)
    : 0;
  const [page, setPage] = useState(
    Math.floor(Math.max(0, initialFocusIndex) / PAGE_SIZE) + 1,
  );
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pageError, setPageError] = useState("");
  const openerRef = useRef<HTMLElement | null>(null);
  const active = activeProviderPair(props.state);
  const pageCount = Math.max(1, Math.ceil(props.state.configurations.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleConfigurations = props.state.configurations.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const focusConfigurationId = props.focus?.configurationId;
  const focusRequestId = props.focus?.requestId;

  useEffect(() => {
    if (!focusConfigurationId) return;
    focusConfigurationRow(focusConfigurationId);
  }, [focusConfigurationId, focusRequestId]);

  useEffect(() => {
    if (!dialog) openerRef.current?.focus();
  }, [dialog]);

  function openDialog(state: Exclude<DialogState, null>, target: HTMLElement) {
    openerRef.current = target;
    setDialog(state);
  }

  function focusConfiguration(configurationId: string) {
    setPage(pageForConfiguration(props.state.configurations, configurationId));
    focusConfigurationRow(configurationId);
  }

  function activate(configurationId: string) {
    setPageError("");
    void props.onActivate(configurationId).catch(() => {
      setPageError(
        "Could not activate this configuration. The previous active configuration was kept.",
      );
    });
  }

  function remove(configuration: ProviderConfiguration) {
    if (!window.confirm(`Delete ${configuration.name}?`)) return;
    setPageError("");
    void props.onDelete(configuration).catch(() => {
      setPageError(
        "Could not delete this configuration. It remains available to retry.",
      );
    });
  }

  return (
    <section className="module-panel providers-page" aria-labelledby="providers-title">
      <PageHeader
        description="Manage named ASR and Rewrite configurations. Availability is evaluated locally."
        title="Providers"
        titleId="providers-title"
      />

      <Card className="pipeline-summary" aria-label="Current dictation pipeline">
        <PipelineStep
          configuration={active.stt}
          label="ASR"
          onSelect={() => focusConfiguration(active.stt.id)}
          presence={props.keyPresence}
        />
        <span className="pipeline-arrow" data-testid="pipeline-arrow">
          <ArrowRight aria-hidden="true" size={20} />
        </span>
        <PipelineStep
          configuration={active.rewrite}
          label="Rewrite"
          onSelect={() => focusConfiguration(active.rewrite.id)}
          presence={props.keyPresence}
        />
      </Card>

      {pageError ? <p className="app-message" role="alert">{pageError}</p> : null}

      <Card className="provider-configurations" aria-labelledby="provider-configurations-title">
        <header>
          <div>
            <h2 id="provider-configurations-title">Configurations</h2>
            <p>{props.state.configurations.length} saved</p>
          </div>
          <Button onClick={(event) => openDialog({ mode: "new", kind: "stt" }, event.currentTarget)} type="button" variant="primary">
            <Plus size={14} /> Add configuration
          </Button>
        </header>

        <div className="provider-config-list">
          {visibleConfigurations.map((configuration) => {
            const status = configurationStatus(configuration, props.keyPresence);
            const isActive =
              configuration.id === props.state.activeAsrConfigId ||
              configuration.id === props.state.activeRewriteConfigId;
            const endpoint =
              (configuration.providerId === "qwen-local" || configuration.providerId === "qwen-api") && configuration.baseUrl
                ? shortEndpoint(configuration.baseUrl)
                : null;
            const icon = providerIcon(configuration.providerId);
            return (
              <article
                className="provider-config-row"
                data-testid="provider-configuration-row"
                id={`provider-configuration-${configuration.id}`}
                key={configuration.id}
                tabIndex={-1}
              >
                <div className="provider-config-identity">
                  {icon ? (
                    <span className="provider-icon-tile">
                      <img alt={providerLabel(configuration.providerId)} src={icon} />
                    </span>
                  ) : null}
                  <div className="provider-config-copy">
                    <div className="provider-config-title">
                      <strong>{configuration.name}</strong>
                      <span className="provider-kind-label">
                        {configuration.kind === "stt" ? "ASR" : "Rewrite"}
                      </span>
                    </div>
                    <small>{providerLabel(configuration.providerId)}</small>
                    {endpoint ? <small>{endpoint}</small> : null}
                  </div>
                </div>
                <span className="provider-config-model">{configuration.model}</span>
                <span className={`configuration-status status-${status}`}>{statusCopy[status]}</span>
                <small>Updated {formatDate(configuration.updatedAt)}</small>
                <div className="provider-config-actions">
                  {isActive ? (
                    <span className="active-config-label">Active</span>
                  ) : (
                    <Button onClick={() => activate(configuration.id)} type="button">
                      Use for {configuration.kind === "stt" ? "ASR" : "Rewrite"}
                    </Button>
                  )}
                  <Button
                    className="provider-edit-button"
                    onClick={(event) => openDialog({ mode: "edit", configuration }, event.currentTarget)}
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={14} /> Edit
                  </Button>
                  <Button
                    className="provider-delete-button"
                    disabled={isActive}
                    onClick={() => remove(configuration)}
                    type="button"
                    variant="danger"
                  >
                    <Trash2 aria-hidden="true" size={14} /> Delete
                  </Button>
                </div>
              </article>
            );
          })}
        </div>

        {pageCount > 1 ? (
          <footer className="provider-pagination">
            <Button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} type="button">Previous</Button>
            <span>Page {currentPage} of {pageCount}</span>
            <Button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} type="button">Next</Button>
          </footer>
        ) : null}
      </Card>

      {dialog ? (
        <ProviderDialog
          key={dialog.mode === "new" ? `${dialog.mode}-${dialog.kind}` : `${dialog.mode}-${dialog.configuration.id}`}
          keyPresence={props.keyPresence}
          onClose={() => setDialog(null)}
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
  onSave: ProvidersPageProps["onSave"];
  onRemoveKey: ProvidersPageProps["onRemoveKey"];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const original = props.state.mode === "edit" ? props.state.configuration : undefined;
  const initialKind = props.state.mode === "edit"
    ? props.state.configuration.kind
    : props.state.kind;
  const [kind, setKind] = useState<ProviderConfiguration["kind"]>(initialKind);
  const providerOptions = kind === "stt" ? STT_PROVIDER_OPTIONS : REWRITE_PROVIDER_OPTIONS;
  const initialProvider = original?.providerId ?? providerOptions[0].id;
  const [providerId, setProviderId] = useState<ProviderConfiguration["providerId"]>(initialProvider);
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

  const title = original
    ? "Edit Provider configuration"
    : `Add ${kind === "stt" ? "ASR" : "Rewrite"} configuration`;

  function changeKind(nextKind: ProviderConfiguration["kind"]) {
    const nextOptions = nextKind === "stt" ? STT_PROVIDER_OPTIONS : REWRITE_PROVIDER_OPTIONS;
    const nextProvider = nextOptions[0];
    setKind(nextKind);
    setProviderId(nextProvider.id);
    setModel(nextProvider.models[0]);
    setBaseUrl(optionDefaultBaseUrl(nextProvider));
  }

  function closeDialog() {
    dialogRef.current?.close();
    props.onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
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
      closeDialog();
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
          Type
          <select
            disabled={Boolean(original)}
            onChange={(event) => changeKind(event.target.value as ProviderConfiguration["kind"])}
            value={kind}
          >
            <option value="stt">ASR</option>
            <option value="rewrite">Rewrite</option>
          </select>
        </label>
        <label>
          Configuration name
          <input onChange={(event) => setName(event.target.value)} value={name} />
        </label>
        <label>
          Provider
          <select
            disabled={Boolean(original)}
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
          <select onChange={(event) => setModel(event.target.value)} value={model}>
            {selectedOption.models.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        {providerId === "qwen-local" || providerId === "qwen-api" ? (
          <label>
            Base URL
            <input onChange={(event) => setBaseUrl(event.target.value)} value={baseUrl} />
          </label>
        ) : null}
        {credentialProvider ? (
          <label>
            API key
            <input
              autoComplete="off"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={hasKey ? "Saved key · leave blank to keep" : "Enter API key"}
              type="password"
              value={apiKey}
            />
          </label>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        <div className="button-row">
          <Button disabled={saving} type="submit" variant="primary">Save configuration</Button>
          {original && hasKey ? (
            <Button
              onClick={() => {
                if (window.confirm("Remove the saved credential from this configuration?")) {
                  setSaving(true);
                  setError("");
                  void props.onRemoveKey(original)
                    .then(closeDialog)
                    .catch(() => setError("Could not remove the saved key."))
                    .finally(() => setSaving(false));
                }
              }}
              type="button"
            >
              Remove saved key
            </Button>
          ) : null}
          <Button onClick={closeDialog} type="button">Cancel</Button>
        </div>
      </form>
    </dialog>
  );
}

function pageForConfiguration(
  configurations: ProviderConfiguration[],
  configurationId: string,
) {
  const index = configurations.findIndex((item) => item.id === configurationId);
  return Math.floor(Math.max(0, index) / PAGE_SIZE) + 1;
}

function focusConfigurationRow(configurationId: string) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.getElementById(`provider-configuration-${configurationId}`)?.focus();
    });
  });
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

function providerIcon(providerId: string) {
  if (providerId === "groq") return groqIcon;
  if (providerId === "openai") return openaiIcon;
  return null;
}

function optionDefaultBaseUrl(option: object) {
  return "defaultBaseUrl" in option && typeof option.defaultBaseUrl === "string"
    ? option.defaultBaseUrl
    : "";
}

function shortEndpoint(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString();
}
