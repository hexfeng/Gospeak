import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_APP_CONFIG,
  updateSttProvider,
} from "../domain/config";
import { SettingsPage } from "./SettingsPage";

const settingsProps = {
  activeTab: "dictation" as const,
  config: DEFAULT_APP_CONFIG,
  keyPresence: { groq: false, openai: false },
  onTabChange: vi.fn(),
  keyDrafts: {},
  onKeyDraftChange: vi.fn(),
  onSaveKey: vi.fn(),
  onRefreshKeys: vi.fn(),
  onChangeHotkey: vi.fn(),
  onChangeProviderModel: vi.fn(),
  onChangeSttProvider: vi.fn(),
  onChangeRewriteProvider: vi.fn(),
  onChangeSttBaseUrl: vi.fn(),
  onChangePrivacy: vi.fn(),
  onChangeFastMode: vi.fn(),
  onChangeSpeakToEdit: vi.fn(),
  onChangeAppRouting: vi.fn(),
  onExport: vi.fn(),
  onImport: vi.fn(),
};

describe("SettingsPage", () => {
  it("shows four settings tabs and routes controls to their owner", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    const { rerender } = render(
      <SettingsPage {...settingsProps} onTabChange={onTabChange} />,
    );

    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByRole("region", { name: "Settings" })).toHaveClass(
      "panel",
      "module-panel",
      "settings-page",
    );
    await user.click(screen.getByRole("tab", { name: "Providers" }));
    expect(onTabChange).toHaveBeenCalledWith("providers");
    rerender(
      <SettingsPage
        {...settingsProps}
        activeTab="providers"
        onTabChange={onTabChange}
      />,
    );
    expect(screen.getByRole("tab", { name: "Providers" })).toHaveClass(
      "settings-tab-active",
    );
    expect(screen.getByRole("tab", { name: "Dictation" })).not.toHaveClass(
      "settings-tab-active",
    );
  });

  it("moves Settings tabs with arrow keys", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(<SettingsPage {...settingsProps} onTabChange={onTabChange} />);
    const dictation = screen.getByRole("tab", { name: "Dictation" });

    dictation.focus();
    await user.keyboard("{ArrowRight}");

    expect(onTabChange).toHaveBeenCalledWith("providers");
    expect(screen.getByRole("tab", { name: "Providers" })).toHaveFocus();
  });

  it("keeps API key save explicit", async () => {
    const user = userEvent.setup();
    const onSaveKey = vi.fn();
    render(
      <SettingsPage
        {...settingsProps}
        activeTab="providers"
        keyDrafts={{ groq: "gsk-test" }}
        onSaveKey={onSaveKey}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save Groq key" }));
    expect(onSaveKey).toHaveBeenCalledWith("groq", "gsk-test");
  });

  it("shows the minimum provider selectors without a streaming toggle", () => {
    render(<SettingsPage {...settingsProps} activeTab="providers" />);

    expect(screen.getByLabelText("ASR provider")).toHaveValue("groq");
    expect(screen.getByLabelText("Rewrite provider")).toHaveValue("openai");
    expect(screen.getByLabelText("ASR provider").querySelectorAll("option")).toHaveLength(5);
    expect(screen.getByLabelText("Rewrite provider").querySelectorAll("option")).toHaveLength(2);
    expect(screen.queryByLabelText("ASR base URL")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/experimental streaming dictation/i),
    ).not.toBeInTheDocument();
  });

  it("shows Qwen base URL conditionally and deduplicates OpenAI credentials", () => {
    const localConfig = updateSttProvider(DEFAULT_APP_CONFIG, "qwen-local");
    const { rerender } = render(
      <SettingsPage {...settingsProps} activeTab="providers" config={localConfig} />,
    );
    expect(screen.getByLabelText("ASR base URL")).toHaveValue(
      "http://127.0.0.1:8000/v1",
    );
    expect(screen.queryByLabelText("Qwen API key")).not.toBeInTheDocument();

    rerender(
      <SettingsPage
        {...settingsProps}
        activeTab="providers"
        config={updateSttProvider(DEFAULT_APP_CONFIG, "qwen-api")}
      />,
    );
    expect(screen.getByText("Optional key not set")).toBeInTheDocument();

    rerender(
      <SettingsPage
        {...settingsProps}
        activeTab="providers"
        config={updateSttProvider(DEFAULT_APP_CONFIG, "openai-realtime")}
      />,
    );
    expect(screen.getAllByLabelText("OpenAI API key")).toHaveLength(1);
  });

  it("shows only the implemented raw-audio privacy control", () => {
    render(<SettingsPage {...settingsProps} activeTab="privacy-data" />);

    expect(screen.getByLabelText("Save raw audio")).toBeInTheDocument();
    expect(screen.queryByLabelText("Save transcript history")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sync transcript history")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Crash report includes transcript"),
    ).not.toBeInTheDocument();
  });

  it("saves a changed hotkey when the field loses focus", async () => {
    const user = userEvent.setup();
    const onChangeHotkey = vi.fn();
    render(
      <SettingsPage
        {...settingsProps}
        onChangeHotkey={onChangeHotkey}
      />,
    );

    const hotkey = screen.getByLabelText("Hotkey binding");
    await user.clear(hotkey);
    await user.type(hotkey, "Ctrl+Space");
    expect(onChangeHotkey).not.toHaveBeenCalled();

    await user.tab();
    expect(onChangeHotkey).toHaveBeenCalledWith({ binding: "Ctrl+Space" });
  });
});
