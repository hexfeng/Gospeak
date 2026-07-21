import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  {
    id: "rule_deleted",
    appId: "legacy.exe",
    windowTitlePattern: null,
    profileId: "email",
    priority: 0,
    enabled: false,
    updatedAt: "2026-07-10T00:00:00.000Z",
    deletedAt: "2026-07-10T01:00:00.000Z",
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

function createDeferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = () => resolvePromise();
    reject = (reason) => rejectPromise(reason);
  });
  return { promise, reject, resolve };
}

describe("ProfilesPage", () => {
  it("opens on the active Profile and shows only its App Rules", () => {
    render(<ProfilesPage {...profileProps} activeProfileId="email" />);

    expect(screen.getByLabelText("Selected Profile")).toHaveTextContent("Email");
    expect(screen.getByText("outlook.exe")).toBeInTheDocument();
    expect(screen.queryByText("code.exe")).not.toBeInTheDocument();
    expect(screen.queryByText("legacy.exe")).not.toBeInTheDocument();
  });

  it("opens a Profile card in an edit dialog and keeps its App Rules selected", async () => {
    const user = userEvent.setup();
    render(<ProfilesPage {...profileProps} activeProfileId="normal" />);

    await user.click(screen.getByRole("button", { name: "Email" }));

    expect(screen.getByRole("dialog", { name: "Edit Email Profile" })).toHaveClass("profile-dialog");
    expect(screen.getByLabelText("Profile name")).toHaveValue("Email");
    expect(screen.getByText("outlook.exe")).toBeInTheDocument();
    expect(screen.queryByText("code.exe")).not.toBeInTheDocument();
  });

  it("creates a Profile through the shared Profile dialog", async () => {
    const user = userEvent.setup();
    const onSaveProfile = vi.fn();
    render(<ProfilesPage {...profileProps} activeProfileId="normal" onSaveProfile={onSaveProfile} />);

    await user.click(screen.getByRole("button", { name: "New Profile" }));
    expect(screen.getByRole("dialog", { name: "New Profile" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Profile name"), "Meeting Notes");
    await user.click(screen.getByRole("button", { name: "Save Profile" }));

    expect(onSaveProfile).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.stringMatching(/^profile_/),
      name: "Meeting Notes",
      mode: "normal",
      enabled: true,
    }));
    expect(screen.queryByRole("dialog", { name: "New Profile" })).not.toBeInTheDocument();
  });

  it("keeps a rejected Profile save open with its dirty draft", async () => {
    const user = userEvent.setup();
    const failedSave = Promise.reject(new Error("Profile storage is unavailable"));
    failedSave.catch(() => undefined);
    const onSaveProfile = vi.fn(() => failedSave);
    const onDirtyChange = vi.fn();
    render(<ProfilesPage {...profileProps} activeProfileId="normal" onDirtyChange={onDirtyChange} onSaveProfile={onSaveProfile} />);

    await user.click(screen.getByRole("button", { name: "Email" }));
    await user.clear(screen.getByLabelText("Profile name"));
    await user.type(screen.getByLabelText("Profile name"), "Changed Email");
    await user.click(screen.getByRole("button", { name: "Save Profile" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save Profile. Try again.");
    expect(screen.getByRole("dialog", { name: "Edit Email Profile" })).toBeInTheDocument();
    expect(screen.getByLabelText("Profile name")).toHaveValue("Changed Email");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("keeps a rejected Profile duplicate open", async () => {
    const user = userEvent.setup();
    const failedSave = Promise.reject(new Error("Profile storage is unavailable"));
    failedSave.catch(() => undefined);
    const onSaveProfile = vi.fn(() => failedSave);
    render(<ProfilesPage {...profileProps} activeProfileId="normal" onSaveProfile={onSaveProfile} />);

    await user.click(screen.getByRole("button", { name: "Email" }));
    await user.click(screen.getByRole("button", { name: "Duplicate Email" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't duplicate Profile. Try again.");
    expect(screen.getByRole("dialog", { name: "Edit Email Profile" })).toBeInTheDocument();
  });

  it("blocks Profile dialog actions while saving and allows retry after rejection", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred();
    const onSaveProfile = vi.fn()
      .mockImplementationOnce(() => deferred.promise)
      .mockResolvedValueOnce(undefined);
    render(<ProfilesPage {...profileProps} activeProfileId="normal" onSaveProfile={onSaveProfile} />);

    await user.click(screen.getByRole("button", { name: "Email" }));
    await user.clear(screen.getByLabelText("Profile name"));
    await user.type(screen.getByLabelText("Profile name"), "Changed Email");
    await user.click(screen.getByRole("button", { name: "Save Profile" }));

    const dialog = screen.getByRole("dialog", { name: "Edit Email Profile" });
    expect(screen.getByRole("button", { name: "Save Profile" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Set Active" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Duplicate Email" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Email" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save Profile" }));
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(onSaveProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Edit Email Profile" })).toBeInTheDocument();

    deferred.reject(new Error("Profile storage is unavailable"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save Profile. Try again.");
    expect(screen.getByRole("button", { name: "Save Profile" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save Profile" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit Email Profile" })).not.toBeInTheDocument());
    expect(onSaveProfile).toHaveBeenCalledTimes(2);
  });

  it("blocks Profile duplication until its persistence resolves", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred();
    const onSaveProfile = vi.fn(() => deferred.promise);
    render(<ProfilesPage {...profileProps} activeProfileId="normal" onSaveProfile={onSaveProfile} />);

    await user.click(screen.getByRole("button", { name: "Email" }));
    await user.click(screen.getByRole("button", { name: "Duplicate Email" }));

    const dialog = screen.getByRole("dialog", { name: "Edit Email Profile" });
    expect(screen.getByRole("button", { name: "Duplicate Email" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Duplicate Email" }));
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(onSaveProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Edit Email Profile" })).toBeInTheDocument();

    deferred.resolve();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit Email Profile" })).not.toBeInTheDocument());
  });

  it("locks Profile fields while saving and restores them after rejection", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred();
    const onSaveProfile = vi.fn()
      .mockImplementationOnce(() => deferred.promise)
      .mockResolvedValueOnce(undefined);
    render(<ProfilesPage {...profileProps} activeProfileId="normal" onSaveProfile={onSaveProfile} />);

    await user.click(screen.getByRole("button", { name: "Email" }));
    const name = screen.getByLabelText("Profile name");
    await user.clear(name);
    await user.type(name, "Saved Email");
    await user.click(screen.getByRole("button", { name: "Save Profile" }));

    expect(name).toBeDisabled();
    expect(screen.getByLabelText("Profile mode")).toBeDisabled();
    expect(screen.getByLabelText("Target language")).toBeDisabled();
    expect(screen.getByLabelText("Enabled")).toBeDisabled();
    expect(screen.getByLabelText("Profile system prompt")).toBeDisabled();
    expect(screen.getByLabelText("User prompt template")).toBeDisabled();
    await user.type(name, " Changed");
    expect(name).toHaveValue("Saved Email");
    expect(onSaveProfile).toHaveBeenCalledWith(expect.objectContaining({ name: "Saved Email" }));

    deferred.reject(new Error("Profile storage is unavailable"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save Profile. Try again.");
    expect(name).toBeEnabled();
    await user.type(name, " Retry");
    await user.click(screen.getByRole("button", { name: "Save Profile" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit Email Profile" })).not.toBeInTheDocument());
    expect(onSaveProfile).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Saved Email Retry" }));
  });

  it("confirms before cancelling a dirty Profile dialog", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ProfilesPage {...profileProps} activeProfileId="normal" />);

    await user.click(screen.getByRole("button", { name: "Email" }));
    await user.clear(screen.getByLabelText("Profile name"));
    await user.type(screen.getByLabelText("Profile name"), "Changed Email");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(confirm).toHaveBeenCalledWith("Discard unsaved Profile changes?");
    expect(screen.getByRole("dialog", { name: "Edit Email Profile" })).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("does not offer deletion for the Normal fallback", async () => {
    const user = userEvent.setup();
    render(<ProfilesPage {...profileProps} activeProfileId="normal" />);

    await user.click(screen.getByRole("button", { name: "Normal" }));

    expect(screen.queryByRole("button", { name: "Delete Normal" })).not.toBeInTheDocument();
  });

  it("keeps the normal id undeletable even when its editable mode changes", async () => {
    const user = userEvent.setup();
    render(
      <ProfilesPage
        {...profileProps}
        activeProfileId="normal"
        profiles={profiles.map((profile) =>
          profile.id === "normal" ? { ...profile, mode: "email" } : profile,
        )}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Normal" }));

    expect(screen.queryByRole("button", { name: "Delete Normal" })).not.toBeInTheDocument();
  });

  it("shows enabled, active, and App Rule count for every Profile card", () => {
    render(<ProfilesPage {...profileProps} activeProfileId="normal" />);

    const normal = screen.getByRole("button", { name: "Normal" });
    const email = screen.getByRole("button", { name: "Email" });
    expect(normal).toHaveTextContent("Enabled");
    expect(normal).toHaveTextContent("Active");
    expect(normal).toHaveTextContent("1 App Rule");
    expect(email).toHaveTextContent("Enabled");
    expect(email).toHaveTextContent("Inactive");
    expect(email).toHaveTextContent("1 App Rule");
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

    await user.click(screen.getByRole("button", { name: "Email" }));
    await user.click(screen.getByRole("button", { name: "Duplicate Email" }));

    expect(onSaveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^profile_/),
        name: "Email Copy",
      }),
    );
    expect(onSaveRule).not.toHaveBeenCalled();
  });

  it("opens Add Rule in a dialog and saves it for the selected Profile", async () => {
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
    await user.click(screen.getByRole("button", { name: "Add Rule" }));
    expect(screen.getByRole("dialog", { name: "Add App Rule" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("App id"), "teams.exe");
    await user.click(screen.getByRole("button", { name: "Save App Rule" }));

    expect(onSaveRule).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "teams.exe",
        profileId: "email",
        enabled: true,
        deletedAt: null,
      }),
    );
  });

  it("treats a new Profile as dirty before selecting another Profile", async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    render(
      <ProfilesPage
        {...profileProps}
        activeProfileId="normal"
        onDirtyChange={onDirtyChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "New Profile" }));

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("returns to the active Profile after discarding a new Profile", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProfilesPage {...profileProps} activeProfileId="normal" />);

    const newProfile = screen.getByRole("button", { name: "New Profile" });
    await user.click(newProfile);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "New Profile" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Selected Profile")).toHaveTextContent("Normal");
    expect(screen.getByRole("button", { name: "Add Rule" })).toBeEnabled();
    expect(newProfile).toHaveFocus();
  });

  it("disables Add Rule until a new Profile is saved", async () => {
    const user = userEvent.setup();
    render(<ProfilesPage {...profileProps} activeProfileId="normal" />);

    await user.click(screen.getByRole("button", { name: "New Profile" }));

    expect(screen.getByRole("button", { name: "Add Rule" })).toBeDisabled();
    expect(screen.queryByLabelText("App id")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Duplicate/i })).not.toBeInTheDocument();
  });

  it("edits an existing App Rule without changing its id", async () => {
    const user = userEvent.setup();
    const onSaveRule = vi.fn();
    render(
      <ProfilesPage
        {...profileProps}
        activeProfileId="email"
        onSaveRule={onSaveRule}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit rule for outlook.exe" }));
    expect(screen.getByRole("dialog", { name: "Edit App Rule" })).toBeInTheDocument();
    expect(screen.getByLabelText("App id")).toHaveValue("outlook.exe");
    await user.type(screen.getByLabelText("Title contains"), "Inbox");
    await user.click(screen.getByRole("button", { name: "Save App Rule" }));

    expect(onSaveRule).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "rule_outlook",
        appId: "outlook.exe",
        windowTitlePattern: "Inbox",
        profileId: "email",
        enabled: true,
      }),
    );
  });

  it("searches App Rules by app id and window title", async () => {
    const user = userEvent.setup();
    render(
      <ProfilesPage
        {...profileProps}
        activeProfileId="email"
        appRules={[
          ...rules,
          {
            ...rules[0],
            id: "rule_teams",
            appId: "teams.exe",
            windowTitlePattern: "Meeting",
          },
        ]}
      />,
    );

    const search = screen.getByRole("searchbox", { name: "Search App Rules" });
    await user.type(search, "meeting");

    expect(screen.getByText("teams.exe")).toBeInTheDocument();
    expect(screen.queryByText("outlook.exe")).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "TEAMS.EXE");

    expect(screen.getByText("teams.exe")).toBeInTheDocument();
    expect(screen.queryByText("outlook.exe")).not.toBeInTheDocument();
  });

  it("toggles an existing App Rule through the same rule callback", async () => {
    const user = userEvent.setup();
    const onSaveRule = vi.fn();
    render(
      <ProfilesPage
        {...profileProps}
        activeProfileId="email"
        onSaveRule={onSaveRule}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Enable rule for outlook.exe" }));

    expect(onSaveRule).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "rule_outlook",
        enabled: false,
        deletedAt: null,
      }),
    );
  });

  it("keeps dirty edits when duplicate confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onSaveProfile = vi.fn();
    render(
      <ProfilesPage
        {...profileProps}
        activeProfileId="email"
        onSaveProfile={onSaveProfile}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Email" }));
    await user.clear(screen.getByLabelText("Profile name"));
    await user.type(screen.getByLabelText("Profile name"), "Changed Email");
    await user.click(screen.getByRole("button", { name: "Duplicate Email" }));

    expect(confirm).toHaveBeenCalledWith("Discard unsaved Profile changes?");
    expect(onSaveProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Edit Email Profile" })).toBeInTheDocument();
    expect(screen.getByLabelText("Profile name")).toHaveValue("Changed Email");
    confirm.mockRestore();
  });
});
