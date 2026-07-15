import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_CONFIG } from "../domain/config";
import { SettingsPage } from "./SettingsPage";

const settingsProps = {
  config: DEFAULT_APP_CONFIG,
  onChangeHotkey: vi.fn(),
  onChangePrivacy: vi.fn(),
  onChangeFastMode: vi.fn(),
  onChangeSpeakToEdit: vi.fn(),
  onChangeAppRouting: vi.fn(),
  onExport: vi.fn(),
  onImport: vi.fn(),
};

describe("SettingsPage", () => {
  it("shows Dictation, Privacy & Data, and Advanced in one vertical page", () => {
    render(<SettingsPage {...settingsProps} />);

    expect(screen.getByRole("heading", { name: "Dictation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Privacy & Data" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Advanced" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("ASR provider")).not.toBeInTheDocument();
  });

  it("shows only the implemented raw-audio privacy control", () => {
    render(<SettingsPage {...settingsProps} />);

    expect(screen.getByLabelText("Save raw audio")).toBeInTheDocument();
    expect(screen.queryByLabelText("Save transcript history")).not.toBeInTheDocument();
  });

  it("saves a changed hotkey when the field loses focus", async () => {
    const user = userEvent.setup();
    const onChangeHotkey = vi.fn();
    render(<SettingsPage {...settingsProps} onChangeHotkey={onChangeHotkey} />);

    const hotkey = screen.getByLabelText("Hotkey binding");
    await user.clear(hotkey);
    await user.type(hotkey, "Ctrl+Space");
    expect(onChangeHotkey).not.toHaveBeenCalled();
    await user.tab();
    expect(onChangeHotkey).toHaveBeenCalledWith({ binding: "Ctrl+Space" });
  });
});
