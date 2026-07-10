import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_CONFIG } from "../domain/config";
import { SettingsPage } from "./SettingsPage";

const settingsProps = {
  activeTab: "dictation" as const,
  config: DEFAULT_APP_CONFIG,
  keyPresence: { groq: false, openai: false },
  groqKey: "",
  openAiKey: "",
  onTabChange: vi.fn(),
  onGroqKeyChange: vi.fn(),
  onOpenAiKeyChange: vi.fn(),
  onSaveKey: vi.fn(),
  onRefreshKeys: vi.fn(),
  onChangeHotkey: vi.fn(),
  onChangeProviderModel: vi.fn(),
  onChangePrivacy: vi.fn(),
  onChangeFastMode: vi.fn(),
  onChangeSpeakToEdit: vi.fn(),
  onChangeStreamingMode: vi.fn(),
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
        groqKey="gsk-test"
        onSaveKey={onSaveKey}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save Groq key" }));
    expect(onSaveKey).toHaveBeenCalledWith("groq", "gsk-test");
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
