import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_CONFIG } from "../domain/config";
import { addLegacyCredentialConfigurations, migrateProviderConfigurations } from "../domain/providerConfigurations";
import { ProvidersPage } from "./ProvidersPage";

function renderProviders(keyPresence: Record<string, boolean> = {}) {
  const state = migrateProviderConfigurations(
    DEFAULT_APP_CONFIG.providers,
    "2026-07-15T12:00:00.000Z",
  );
  const props = {
    state,
    keyPresence,
    onSave: vi.fn(async () => undefined),
    onActivate: vi.fn(async () => undefined),
    onDelete: vi.fn(async () => undefined),
    onRemoveKey: vi.fn(async () => undefined),
    onRefresh: vi.fn(async () => undefined),
  };
  render(<ProvidersPage {...props} />);
  return props;
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

  it("keeps new configurations inactive and saves explicitly", async () => {
    const user = userEvent.setup();
    const props = renderProviders();

    await user.click(screen.getByRole("button", { name: "Add configuration" }));
    await user.type(screen.getByLabelText("Configuration name"), "Work Groq");
    await user.type(screen.getByLabelText("API key"), "gsk-test");
    await user.click(screen.getByRole("button", { name: "Save configuration" }));

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Work Groq",
        kind: "stt",
        providerId: "groq",
      }),
      "gsk-test",
    );
    expect(props.onActivate).not.toHaveBeenCalled();
  });

  it("previews an existing configuration without exposing its key", async () => {
    const user = userEvent.setup();
    renderProviders({ provider_default_groq_stt: true });

    await user.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByRole("dialog", { name: "Provider configuration" })).toBeInTheDocument();
    expect(screen.getByText("Credential is available in the OS credential store.")).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toHaveValue("");
    expect(screen.getByText(/Created/)).toBeInTheDocument();
  });

  it("keeps Provider fixed during edit", async () => {
    const user = userEvent.setup();
    const props = renderProviders();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Provider")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("permits explicit activation of an incomplete configuration", async () => {
    const user = userEvent.setup();
    const state = addLegacyCredentialConfigurations(
      migrateProviderConfigurations(DEFAULT_APP_CONFIG.providers, "2026-07-15T12:00:00.000Z"),
      { doubao: true },
      "2026-07-15T12:00:00.000Z",
    );
    const props = {
      state,
      keyPresence: {},
      onSave: vi.fn(async () => undefined),
      onActivate: vi.fn(async () => undefined),
      onDelete: vi.fn(async () => undefined),
      onRemoveKey: vi.fn(async () => undefined),
      onRefresh: vi.fn(async () => undefined),
    };
    render(<ProvidersPage {...props} />);
    const doubaoCard = screen.getByRole("heading", { name: "Doubao ASR" }).closest("section")!;

    await user.click(within(doubaoCard).getByRole("button", { name: "Use configuration" }));
    expect(props.onActivate).toHaveBeenCalledWith("provider_default_doubao_stt");
  });

  it("reports activation failure without claiming the configuration is active", async () => {
    const user = userEvent.setup();
    const state = addLegacyCredentialConfigurations(
      migrateProviderConfigurations(DEFAULT_APP_CONFIG.providers, "2026-07-15T12:00:00.000Z"),
      { doubao: true },
      "2026-07-15T12:00:00.000Z",
    );
    render(
      <ProvidersPage
        keyPresence={{}}
        onActivate={vi.fn(async () => { throw new Error("disk full"); })}
        onDelete={vi.fn(async () => undefined)}
        onRefresh={vi.fn(async () => undefined)}
        onRemoveKey={vi.fn(async () => undefined)}
        onSave={vi.fn(async () => undefined)}
        state={state}
      />,
    );
    const doubaoGroup = screen.getByRole("heading", { name: "Doubao ASR" }).closest("section")!;

    await user.click(within(doubaoGroup).getByRole("button", { name: "Use configuration" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("previous active configuration was kept");
    expect(within(doubaoGroup).queryByText("Active")).not.toBeInTheDocument();
  });
});
