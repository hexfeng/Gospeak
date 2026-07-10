import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppProfileRule, PromptProfile } from "../domain/config";
import { ProfilesPage } from "./ProfilesPage";

const profiles: PromptProfile[] = [
  {
    id: "normal",
    name: "Normal",
    mode: "normal",
    systemPrompt: "Clean the transcript.",
    userPromptTemplate: "{{transcript}}",
    enabled: true,
    updatedAt: "2026-07-10T00:00:00.000Z",
  },
  {
    id: "email",
    name: "Email",
    mode: "email",
    systemPrompt: "Write an email.",
    userPromptTemplate: "{{transcript}}",
    enabled: true,
    updatedAt: "2026-07-10T00:00:00.000Z",
  },
];

const rules: AppProfileRule[] = [
  {
    id: "rule_outlook",
    appId: "outlook.exe",
    windowTitlePattern: null,
    profileId: "email",
    priority: 0,
    enabled: true,
    updatedAt: "2026-07-10T00:00:00.000Z",
    deletedAt: null,
  },
  {
    id: "rule_code",
    appId: "code.exe",
    windowTitlePattern: null,
    profileId: "normal",
    priority: 0,
    enabled: true,
    updatedAt: "2026-07-10T00:00:00.000Z",
    deletedAt: null,
  },
];

const profileProps = {
  profiles,
  appRules: rules,
  foregroundContext: null,
  onSaveProfile: vi.fn(),
  onDeleteProfile: vi.fn(),
  onSaveRule: vi.fn(),
  onDeleteRule: vi.fn(),
  onSetActive: vi.fn(),
  onDirtyChange: vi.fn(),
};

describe("ProfilesPage", () => {
  it("opens on the active Profile and shows only its App Rules", () => {
    render(<ProfilesPage {...profileProps} activeProfileId="email" />);

    expect(screen.getByRole("heading", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByText("outlook.exe")).toBeInTheDocument();
    expect(screen.queryByText("code.exe")).not.toBeInTheDocument();
  });

  it("does not offer deletion for the Normal fallback", () => {
    render(<ProfilesPage {...profileProps} activeProfileId="normal" />);

    expect(
      screen.queryByRole("button", { name: "Delete Normal" }),
    ).not.toBeInTheDocument();
  });

  it("saves a new Profile through the profile callback", async () => {
    const user = userEvent.setup();
    const onSaveProfile = vi.fn();
    render(
      <ProfilesPage
        {...profileProps}
        activeProfileId="normal"
        onSaveProfile={onSaveProfile}
      />,
    );

    await user.click(screen.getByRole("button", { name: "New Profile" }));
    await user.type(screen.getByLabelText("Profile name"), "Meeting Notes");
    await user.click(screen.getByRole("button", { name: "Save Profile" }));

    expect(onSaveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^profile_/),
        name: "Meeting Notes",
        mode: "normal",
        enabled: true,
      }),
    );
  });

  it("duplicates a Profile without duplicating its App Rules", async () => {
    const user = userEvent.setup();
    const onSaveProfile = vi.fn();
    const onSaveRule = vi.fn();
    render(
      <ProfilesPage
        {...profileProps}
        activeProfileId="email"
        onSaveProfile={onSaveProfile}
        onSaveRule={onSaveRule}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Duplicate Email" }));

    expect(onSaveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^profile_/),
        name: "Email Copy",
      }),
    );
    expect(onSaveRule).not.toHaveBeenCalled();
  });

  it("keeps the selected Profile when discarding edits is cancelled", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ProfilesPage {...profileProps} activeProfileId="email" />);

    await user.clear(screen.getByLabelText("Profile name"));
    await user.type(screen.getByLabelText("Profile name"), "Changed Email");
    await user.click(screen.getByRole("button", { name: "Normal" }));

    expect(confirm).toHaveBeenCalledWith("Discard unsaved Profile changes?");
    expect(screen.getByRole("heading", { name: "Changed Email" })).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("saves App Rules for the selected Profile without a profile picker", async () => {
    const user = userEvent.setup();
    const onSaveRule = vi.fn();
    render(
      <ProfilesPage
        {...profileProps}
        activeProfileId="email"
        onSaveRule={onSaveRule}
      />,
    );

    expect(screen.queryByLabelText("Rule profile")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("App id"), "teams.exe");
    await user.click(screen.getByRole("button", { name: "Save app rule" }));

    expect(onSaveRule).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "teams.exe",
        profileId: "email",
        enabled: true,
        deletedAt: null,
      }),
    );
  });
});
