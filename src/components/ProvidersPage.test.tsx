import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_CONFIG } from "../domain/config";
import {
  addLegacyCredentialConfigurations,
  migrateProviderConfigurations,
  type ProviderConfiguration,
  type ProviderConfigurationState,
} from "../domain/providerConfigurations";
import { ProvidersPage } from "./ProvidersPage";

const timestamp = "2026-07-15T12:00:00.000Z";

function defaultState() {
  return migrateProviderConfigurations(DEFAULT_APP_CONFIG.providers, timestamp);
}

function paginatedState() {
  const base = defaultState();
  const extras: ProviderConfiguration[] = [
    { id: "groq-work", name: "Groq Work", kind: "stt", providerId: "groq", model: "whisper-large-v3", baseUrl: "https://should-not-render.example/v1", createdAt: timestamp, updatedAt: timestamp },
    { id: "qwen-local", name: "Local Qwen", kind: "stt", providerId: "qwen-local", model: "Qwen/Qwen3-ASR-0.6B", baseUrl: "http://127.0.0.1:8000/v1", createdAt: timestamp, updatedAt: timestamp },
    { id: "qwen-api", name: "Qwen Cloud", kind: "stt", providerId: "qwen-api", model: "Qwen/Qwen3-ASR-1.7B", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", createdAt: timestamp, updatedAt: timestamp },
    { id: "doubao", name: "Doubao", kind: "stt", providerId: "doubao", model: "bigmodel", createdAt: timestamp, updatedAt: timestamp },
    { id: "deepseek", name: "DeepSeek", kind: "rewrite", providerId: "deepseek", model: "deepseek-v4-flash", createdAt: timestamp, updatedAt: timestamp },
  ];
  return { ...base, configurations: [...base.configurations, ...extras] };
}

function renderProviders(
  keyPresence: Record<string, boolean> = {},
  state: ProviderConfigurationState = defaultState(),
) {
  const props = {
    state,
    keyPresence,
    onSave: vi.fn(async () => undefined),
    onActivate: vi.fn(async () => undefined),
    onDelete: vi.fn(async () => undefined),
    onRemoveKey: vi.fn(async () => undefined),
    onRefresh: vi.fn(async () => undefined),
  };
  const view = render(<ProvidersPage {...props} />);
  return { ...props, ...view };
}

function rows() {
  return within(screen.getByRole("region", { name: "Configurations" }))
    .getAllByTestId("provider-configuration-row");
}

describe("ProvidersPage", () => {
  it("shows the current ASR to Rewrite pipeline and local status", () => {
    const props = renderProviders({
      provider_default_groq_stt: true,
      provider_default_openai_rewrite: true,
    });

    const pipeline = screen.getByLabelText("Current dictation pipeline");
    expect(within(pipeline).getByText("ASR")).toBeInTheDocument();
    expect(within(pipeline).getByText("Rewrite")).toBeInTheDocument();
    expect(within(pipeline).getAllByText("Configured")).toHaveLength(2);
    expect(props.onRefresh).not.toHaveBeenCalled();
  });

  it("shows one mixed list with at most five configurations per page", async () => {
    const user = userEvent.setup();
    renderProviders({}, paginatedState());
    const list = screen.getByRole("region", { name: "Configurations" });

    expect(within(list).getByText("7 saved")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add configuration" })).toHaveLength(1);
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Groq Whisper" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh local status" })).not.toBeInTheDocument();
    expect(rows()).toHaveLength(5);
    expect(within(list).getAllByText(/^(ASR|Rewrite)$/)).toHaveLength(5);
    expect(within(list).getByText("127.0.0.1:8000")).toBeInTheDocument();
    expect(within(list).queryByText("should-not-render.example")).not.toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(rows()).toHaveLength(2);
    expect(rows()[1]).toHaveTextContent("DeepSeek");
  });

  it("clamps to the last valid page when configurations are removed", async () => {
    const user = userEvent.setup();
    const state = paginatedState();
    const view = renderProviders({}, state);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

    view.rerender(
      <ProvidersPage
        {...view}
        state={{ ...state, configurations: state.configurations.slice(0, 5) }}
      />,
    );

    expect(screen.queryByText(/Page 2/)).not.toBeInTheDocument();
    expect(rows()).toHaveLength(5);
    expect(rows()[0]).toHaveTextContent("Groq Whisper");
  });

  it("moves to and focuses the active configuration selected from the pipeline", async () => {
    const user = userEvent.setup();
    const state = { ...paginatedState(), activeRewriteConfigId: "deepseek" };
    renderProviders({}, state);

    await user.click(within(screen.getByLabelText("Current dictation pipeline")).getByRole("button", { name: /Rewrite/ }));

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    await waitFor(() => expect(rows()[1]).toHaveFocus());
  });

  it("returns focus to the Add or Edit opener whenever the dialog closes", async () => {
    const user = userEvent.setup();
    const props = renderProviders({ provider_default_groq_stt: true });
    const addButton = screen.getByRole("button", { name: "Add configuration" });

    await user.click(addButton);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(addButton).toHaveFocus());

    const editButton = within(rows()[0]).getByRole("button", { name: "Edit" });
    await user.click(editButton);
    await user.click(screen.getByRole("button", { name: "Save configuration" }));
    await waitFor(() => expect(editButton).toHaveFocus());

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(editButton);
    await user.click(screen.getByRole("button", { name: "Remove saved key" }));
    await waitFor(() => expect(editButton).toHaveFocus());
    expect(props.onRemoveKey).toHaveBeenCalled();
    confirm.mockRestore();

    await user.click(addButton);
    await user.click(screen.getByLabelText("Configuration name"));
    fireEvent(screen.getByRole("dialog"), new Event("close"));
    await waitFor(() => expect(addButton).toHaveFocus());
  });

  it("does not disclose a malformed Qwen endpoint in the compact row", () => {
    const state = paginatedState();
    state.configurations[3] = {
      ...state.configurations[3],
      baseUrl: "not-a-valid-url",
    };

    renderProviders({}, state);

    expect(rows()[3]).toHaveTextContent("Invalid endpoint");
    expect(within(rows()[3]).queryByText("not-a-valid-url")).not.toBeInTheDocument();
  });

  it("shows row information, explicit actions, and active delete protection", () => {
    const props = renderProviders({ provider_default_groq_stt: true }, paginatedState());
    const row = rows()[0];

    expect(row).toHaveTextContent("Groq Whisper");
    expect(within(row).getByText("ASR")).toBeInTheDocument();
    expect(within(row).getByText("whisper-large-v3-turbo")).toBeInTheDocument();
    expect(within(row).getByText("Configured")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(rows()[1]).toHaveTextContent("Rewrite");
    expect(within(rows()[2]).getByRole("button", { name: "Use for ASR" })).toBeInTheDocument();
    expect(props.onActivate).not.toHaveBeenCalled();
  });

  it("adds either type and resets dependent Provider fields", async () => {
    const user = userEvent.setup();
    const props = renderProviders();

    await user.click(screen.getByRole("button", { name: "Add configuration" }));
    await user.selectOptions(screen.getByLabelText("Provider"), "qwen-local");
    expect(screen.getByLabelText("Base URL")).toHaveValue("http://127.0.0.1:8000/v1");
    await user.clear(screen.getByLabelText("Base URL"));
    await user.type(screen.getByLabelText("Base URL"), "http://localhost:9000/v1");
    await user.selectOptions(screen.getByLabelText("Provider"), "qwen-api");
    expect(screen.getByLabelText("Model")).toHaveValue("Qwen/Qwen3-ASR-1.7B");
    expect(screen.getByLabelText("Base URL")).toHaveValue("");

    await user.selectOptions(screen.getByLabelText("Type"), "rewrite");
    expect(screen.getByLabelText("Provider")).toHaveValue("openai");
    expect(screen.getByLabelText("Model")).toHaveValue("gpt-5-nano");
    await user.selectOptions(screen.getByLabelText("Model"), "gpt-5-mini");
    await user.selectOptions(screen.getByLabelText("Provider"), "deepseek");
    expect(screen.getByLabelText("Model")).toHaveValue("deepseek-v4-flash");
    await user.type(screen.getByLabelText("Configuration name"), "Work rewrite");
    await user.type(screen.getByLabelText("API key"), "sk-test");
    await user.click(screen.getByRole("button", { name: "Save configuration" }));

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Work rewrite",
        kind: "rewrite",
        providerId: "deepseek",
        model: "deepseek-v4-flash",
      }),
      "sk-test",
    );
    expect(props.onActivate).not.toHaveBeenCalled();
  });

  it("keeps Type and Provider fixed and preserves a blank key while editing", async () => {
    const user = userEvent.setup();
    const props = renderProviders({ provider_default_groq_stt: true });

    await user.click(within(rows()[0]).getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Type")).toBeDisabled();
    expect(screen.getByLabelText("Provider")).toBeDisabled();
    expect(screen.getByLabelText("API key")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Save configuration" }));

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: "provider_default_groq_stt" }),
      undefined,
    );
  });

  it("permits explicit activation of an incomplete configuration", async () => {
    const user = userEvent.setup();
    const state = addLegacyCredentialConfigurations(defaultState(), { doubao: true }, timestamp);
    const props = renderProviders({}, state);
    const doubaoRow = rows().find((row) => row.textContent?.includes("Doubao ASR"))!;

    expect(within(doubaoRow).getByText("Missing key")).toBeInTheDocument();
    await user.click(within(doubaoRow).getByRole("button", { name: "Use for ASR" }));
    expect(props.onActivate).toHaveBeenCalledWith("provider_default_doubao_stt");
  });

  it("reports activation failure without claiming the configuration is active", async () => {
    const user = userEvent.setup();
    const state = addLegacyCredentialConfigurations(defaultState(), { doubao: true }, timestamp);
    const props = renderProviders({}, state);
    props.onActivate.mockRejectedValueOnce(new Error("disk full"));
    const doubaoRow = rows().find((row) => row.textContent?.includes("Doubao ASR"))!;

    await user.click(within(doubaoRow).getByRole("button", { name: "Use for ASR" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("previous active configuration was kept");
    expect(within(doubaoRow).queryByText("Active")).not.toBeInTheDocument();
  });
});
