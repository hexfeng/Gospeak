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

  it("labels stacked App Rule fields for narrow screens", () => {
    render(<ProfilesPage {...profileProps} activeProfileId="email" />);

    expect(screen.getByText("outlook.exe").closest("td")).toHaveAttribute("data-label", "App");
    expect(screen.getByText("Any title").closest("td")).toHaveAttribute("data-label", "Window title");
    expect(screen.getByText("0").closest("td")).toHaveAttribute("data-label", "Priority");
    expect(screen.getByRole("checkbox", { name: "Enable rule for outlook.exe, any title, priority 0" }).closest("td")).toHaveAttribute("data-label", "Enabled");
    expect(screen.getByRole("button", { name: "Edit rule for outlook.exe, any title, priority 0" }).closest("td")).toHaveAttribute("data-label", "Actions");
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

  it("keeps a rejected Set Active operation open and retryable", async () => {
    const user = userEvent.setup();
    const failedActivation = Promise.reject(new Error("Profile storage is unavailable"));
    failedActivation.catch(() => undefined);
    const onSetActive = vi.fn(() => failedActivation);
    render(<ProfilesPage {...profileProps} activeProfileId="normal" onSetActive={onSetActive} />);

    await user.click(screen.getByRole("button", { name: "Email" }));
    await user.clear(screen.getByLabelText("Profile name"));
    await user.type(screen.getByLabelText("Profile name"), "Changed Email");
    await user.click(screen.getByRole("button", { name: "Set Active" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't set active Profile. Try again.");
    expect(screen.getByRole("dialog", { name: "Edit Email Profile" })).toBeInTheDocument();
    expect(screen.getByLabelText("Profile name")).toHaveValue("Changed Email");
    expect(screen.getByLabelText("Selected Profile")).toHaveTextContent("Email");
    expect(screen.getByRole("button", { name: "Set Active" })).toBeEnabled();
  });

  it("blocks duplicate Set Active submissions and cancellation while pending", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred();
    const onSetActive = vi.fn(() => deferred.promise);
    render(<ProfilesPage {...profileProps} activeProfileId="normal" onSetActive={onSetActive} />);

    await user.click(screen.getByRole("button", { name: "Email" }));
    await user.click(screen.getByRole("button", { name: "Set Active" }));

    const dialog = screen.getByRole("dialog", { name: "Edit Email Profile" });
    expect(screen.getByRole("button", { name: "Set Active" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Set Active" }));
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(onSetActive).toHaveBeenCalledTimes(1);
    expect(dialog).toBeInTheDocument();

    deferred.resolve();
    await waitFor(() => expect(screen.getByRole("button", { name: "Set Active" })).toBeEnabled());
  });

  it("keeps a rejected Profile deletion open and retryable", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const failedDelete = Promise.reject(new Error("Profile storage is unavailable"));
    failedDelete.catch(() => undefined);
    const onDeleteProfile = vi.fn(() => failedDelete);
    render(<ProfilesPage {...profileProps} activeProfileId="normal" onDeleteProfile={onDeleteProfile} />);

    await user.click(screen.getByRole("button", { name: "Email" }));
    await user.click(screen.getByRole("button", { name: "Delete Email" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete Profile. Try again.");
    expect(screen.getByRole("dialog", { name: "Edit Email Profile" })).toBeInTheDocument();
    expect(screen.getByLabelText("Selected Profile")).toHaveTextContent("Email");
    expect(screen.getByRole("button", { name: "Delete Email" })).toBeEnabled();
    confirm.mockRestore();
  });

  it("blocks duplicate Profile deletion and cancellation while pending", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const deferred = createDeferred();
    const onDeleteProfile = vi.fn(() => deferred.promise);
    render(<ProfilesPage {...profileProps} activeProfileId="normal" onDeleteProfile={onDeleteProfile} />);

    await user.click(screen.getByRole("button", { name: "Email" }));
    await user.click(screen.getByRole("button", { name: "Delete Email" }));

    const dialog = screen.getByRole("dialog", { name: "Edit Email Profile" });
    expect(screen.getByRole("button", { name: "Delete Email" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Delete Email" }));
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(onDeleteProfile).toHaveBeenCalledTimes(1);
    expect(dialog).toBeInTheDocument();

    deferred.resolve();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit Email Profile" })).not.toBeInTheDocument());
    expect(screen.getByLabelText("Selected Profile")).toHaveTextContent("Normal");
    confirm.mockRestore();
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

  it("falls back to the persisted Normal Profile after deleting a custom normal-mode Profile", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const customNormal = { ...profiles[1], id: "custom_normal", name: "Custom Normal", mode: "normal" as const };
    render(
      <ProfilesPage
        {...profileProps}
        activeProfileId="normal"
        profiles={[customNormal, ...profiles]}
        onDeleteProfile={vi.fn(async () => undefined)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Custom Normal" }));
    await user.click(screen.getByRole("button", { name: "Delete Custom Normal" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit Custom Normal Profile" })).not.toBeInTheDocument());
    expect(screen.getByLabelText("Selected Profile")).toHaveTextContent("Normal");
    expect(screen.getByRole("button", { name: "Normal" })).toHaveAttribute("aria-pressed", "true");
    confirm.mockRestore();
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

  it("keeps a rejected App Rule addition open with its draft", async () => {
    const user = userEvent.setup();
    const failedSave = Promise.reject(new Error("Rule storage is unavailable"));
    failedSave.catch(() => undefined);
    const onSaveRule = vi.fn(() => failedSave);
    render(<ProfilesPage {...profileProps} activeProfileId="email" onSaveRule={onSaveRule} />);

    await user.click(screen.getByRole("button", { name: "Add Rule" }));
    await user.type(screen.getByLabelText("App id"), "teams.exe");
    await user.type(screen.getByLabelText("Title contains"), "Meeting");
    await user.click(screen.getByRole("button", { name: "Save App Rule" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save App Rule. Try again.");
    expect(screen.getByRole("dialog", { name: "Add App Rule" })).toBeInTheDocument();
    expect(screen.getByLabelText("App id")).toHaveValue("teams.exe");
    expect(screen.getByLabelText("Title contains")).toHaveValue("Meeting");
  });

  it("locks an App Rule dialog and blocks duplicate saves and native cancellation while pending", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred();
    const onSaveRule = vi.fn(() => deferred.promise);
    render(<ProfilesPage {...profileProps} activeProfileId="email" onSaveRule={onSaveRule} />);

    await user.click(screen.getByRole("button", { name: "Add Rule" }));
    await user.type(screen.getByLabelText("App id"), "teams.exe");
    await user.click(screen.getByRole("button", { name: "Save App Rule" }));

    const dialog = screen.getByRole("dialog", { name: "Add App Rule" });
    expect(screen.getByLabelText("App id")).toBeDisabled();
    expect(screen.getByLabelText("Title contains")).toBeDisabled();
    expect(screen.getByLabelText("Priority")).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Enabled" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save App Rule" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save App Rule" }));
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(onSaveRule).toHaveBeenCalledTimes(1);
    expect(dialog).toBeInTheDocument();

    deferred.resolve();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add App Rule" })).not.toBeInTheDocument());
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
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProfilesPage {...profileProps} activeProfileId="normal" />);

    const newProfile = screen.getByRole("button", { name: "New Profile" });
    await user.click(newProfile);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "New Profile" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Selected Profile")).toHaveTextContent("Normal");
    expect(screen.getByRole("button", { name: "Add Rule" })).toBeEnabled();
    expect(newProfile).toHaveFocus();
    confirm.mockRestore();
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

    await user.click(screen.getByRole("button", { name: "Edit rule for outlook.exe, any title, priority 0" }));
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

    await user.click(screen.getByRole("checkbox", { name: "Enable rule for outlook.exe, any title, priority 0" }));

    expect(onSaveRule).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "rule_outlook",
        enabled: false,
        deletedAt: null,
      }),
    );
  });

  it("keeps a failed inline App Rule toggle retryable and blocks duplicate mutation", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred();
    const onSaveRule = vi.fn(() => deferred.promise);
    render(<ProfilesPage {...profileProps} activeProfileId="email" onSaveRule={onSaveRule} />);

    const toggle = screen.getByRole("checkbox", { name: "Enable rule for outlook.exe, any title, priority 0" });
    await user.click(toggle);

    expect(toggle).toBeDisabled();
    await user.click(toggle);
    expect(onSaveRule).toHaveBeenCalledTimes(1);

    deferred.reject(new Error("Rule storage is unavailable"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't update App Rule. Try again.");
    expect(toggle).toBeEnabled();
    expect(toggle).toBeChecked();
    expect(screen.getByText("outlook.exe")).toBeInTheDocument();
  });

  it("keeps a failed inline App Rule deletion retryable and blocks duplicate mutation", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const deferred = createDeferred();
    const onDeleteRule = vi.fn(() => deferred.promise);
    render(<ProfilesPage {...profileProps} activeProfileId="email" onDeleteRule={onDeleteRule} />);

    const deleteRule = screen.getByRole("button", { name: "Delete rule for outlook.exe, any title, priority 0" });
    await user.click(deleteRule);

    expect(deleteRule).toBeDisabled();
    await user.click(deleteRule);
    expect(onDeleteRule).toHaveBeenCalledTimes(1);

    deferred.reject(new Error("Rule storage is unavailable"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete App Rule. Try again.");
    expect(deleteRule).toBeEnabled();
    expect(screen.getByText("outlook.exe")).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("gives same-app App Rule actions distinct accessible names", () => {
    render(
      <ProfilesPage
        {...profileProps}
        activeProfileId="email"
        appRules={[
          rules[0],
          { ...rules[0], id: "rule_outlook_inbox", windowTitlePattern: "Inbox", priority: 10 },
        ]}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Enable rule for outlook.exe, any title, priority 0" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Enable rule for outlook.exe, title Inbox, priority 10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit rule for outlook.exe, any title, priority 0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit rule for outlook.exe, title Inbox, priority 10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete rule for outlook.exe, any title, priority 0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete rule for outlook.exe, title Inbox, priority 10" })).toBeInTheDocument();
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
