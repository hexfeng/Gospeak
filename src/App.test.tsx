import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  checkProviderKeys,
  copyTextForPaste,
  cleanupTempAudioFile,
  exportConfigToFile,
  importConfigFromFile,
  getForegroundAppContext,
  listAppProfileRules,
  listDictionaryTerms,
  listPreferences,
  listUsageEvents,
  runAudioFileDictation,
  runStreamingDictation,
  listenForGlobalShortcut,
  publishRecorderState,
  readSelectedTextForEdit,
  startRecording,
  startStreamingRecording,
  stopRecording,
  upsertDictionaryTerm,
  upsertAppProfileRule,
  upsertPreference,
  upsertProfile,
  selectExportPath,
  selectImportPath,
} from "./lib/tauri";

vi.mock("./lib/tauri", () => ({
  checkProviderKeys: vi.fn(async () => ({ groq: false, openai: false })),
  saveProviderApiKey: vi.fn(async () => ({ groq: true, openai: true })),
  startRecording: vi.fn(async () => "C:\\Temp\\gospeak-test.wav"),
  startStreamingRecording: vi.fn(async () => "C:\\Temp\\gospeak-test.wav"),
  stopRecording: vi.fn(async () => "C:\\Temp\\gospeak-test.wav"),
  runAudioFileDictation: vi.fn(async () => ({
    text: "Polished dictation text",
    profile_id: "normal",
    rewrite_fallback_used: false,
    stt_latency_ms: 120,
    rewrite_latency_ms: 80,
    audio_seconds: 1.5,
    audio_file_bytes: 32000,
    fast_path_used: false,
  })),
  runStreamingDictation: vi.fn(async () => ({
    text: "Streaming dictation text",
    profile_id: "normal",
    rewrite_fallback_used: false,
    stt_latency_ms: 90,
    rewrite_latency_ms: 70,
    audio_seconds: 1.4,
    audio_file_bytes: 30000,
    fast_path_used: false,
    streaming_used: true,
    inserted_streaming: true,
    first_stt_delta_ms: 35,
    first_rewrite_delta_ms: 55,
    first_insert_ms: 75,
  })),
  copyTextForPaste: vi.fn(async () => ({
    copied: true,
    pasteAttempted: false,
    message: "Text copied to clipboard.",
  })),
  cleanupTempAudioFile: vi.fn(async () => true),
  readSelectedTextForEdit: vi.fn(async () => "Selected draft text."),
  listenForGlobalShortcut: vi.fn(async () => vi.fn()),
  getForegroundAppContext: vi.fn(async () => ({
    appId: "browser-preview.exe",
    windowTitle: "Browser preview",
  })),
  listAppProfileRules: vi.fn(async () => []),
  upsertAppProfileRule: vi.fn(async () => undefined),
  listProfiles: vi.fn(async () => []),
  listPreferences: vi.fn(async () => []),
  listUsageEvents: vi.fn(async () => []),
  upsertPreference: vi.fn(async () => undefined),
  upsertProfile: vi.fn(async () => undefined),
  listDictionaryTerms: vi.fn(async () => []),
  upsertDictionaryTerm: vi.fn(async () => undefined),
  exportConfigToFile: vi.fn(async () => undefined),
  importConfigFromFile: vi.fn(async () => ({ data: null })),
  selectExportPath: vi.fn(async () => "C:\\Temp\\gospeak-export.json"),
  selectImportPath: vi.fn(async () => "C:\\Temp\\gospeak-import.json"),
  updateGlobalShortcut: vi.fn(async () => undefined),
  publishRecorderState: vi.fn(async () => undefined),
  listenForTrayAction: vi.fn(async () => vi.fn()),
}));

describe("Gospeak Alpha app shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function openSettingsTab(
    user: ReturnType<typeof userEvent.setup>,
    tab: "Dictation" | "Providers" | "Privacy & Data" | "Advanced",
  ) {
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("tab", { name: tab }));
  }

  it("renders one module at a time from sidebar navigation", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.queryByRole("heading", { name: /Gospeak Alpha/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /General/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/STT model/i)).not.toBeInTheDocument();

    await openSettingsTab(user, "Providers");

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /General/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/STT model/i)).toHaveValue(
      "whisper-large-v3-turbo",
    );
  });

  it("loads persisted provider key status on startup", async () => {
    vi.mocked(checkProviderKeys).mockResolvedValueOnce({
      groq: true,
      openai: true,
    });

    render(<App />);

    await waitFor(() => expect(checkProviderKeys).toHaveBeenCalledTimes(1));
    await openSettingsTab(userEvent.setup(), "Providers");
    expect(await screen.findAllByText("Key ready")).toHaveLength(2);
  });

  it("registers the global shortcut listener", async () => {
    render(<App />);

    await waitFor(() => expect(listenForGlobalShortcut).toHaveBeenCalledTimes(1));
  });

  it("handles quick push-to-talk release before recording state rerenders", async () => {
    let shortcutHandler: ((state: "pressed" | "released") => void) | undefined;
    let resolveStartRecording: ((path: string) => void) | undefined;
    vi.mocked(listenForGlobalShortcut).mockImplementationOnce(async (handler) => {
      shortcutHandler = handler;
      return () => undefined;
    });
    vi.mocked(startRecording).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStartRecording = resolve;
      }),
    );

    render(<App />);
    await waitFor(() => expect(shortcutHandler).toBeDefined());

    act(() => {
      shortcutHandler?.("pressed");
      shortcutHandler?.("released");
    });

    expect(startRecording).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveStartRecording?.("C:\\Temp\\gospeak-test.wav");
    });

    await waitFor(() => expect(stopRecording).toHaveBeenCalledTimes(1));
  });

  it("renders the final four-item navigation without standalone App Rules", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      within(screen.getByRole("navigation"))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["General", "Profiles", "Dictionary", "Settings"]);
    await openSettingsTab(user, "Dictation");
    expect(screen.getByLabelText(/Speak to Edit/i)).toBeInTheDocument();
    expect(screen.queryByText(/Sync Folder/i)).not.toBeInTheDocument();
  });

  it("renders experimental streaming dictation toggle", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openSettingsTab(user, "Advanced");
    expect(
      await screen.findByRole("checkbox", {
        name: /experimental streaming dictation/i,
      }),
    ).not.toBeChecked();
  });

  it("falls back to batch dictation when streaming dictation fails before insertion", async () => {
    const user = userEvent.setup();
    vi.mocked(runStreamingDictation).mockRejectedValueOnce(
      new Error("stream unavailable"),
    );
    render(<App />);

    await openSettingsTab(user, "Advanced");
    await user.click(
      await screen.findByRole("checkbox", {
        name: /experimental streaming dictation/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: "General" }));
    await user.click(screen.getByRole("button", { name: /Start Dictation/i }));
    expect(startStreamingRecording).toHaveBeenCalledTimes(1);
    await user.click(
      await screen.findByRole("button", { name: /Stop Dictation/i }),
    );

    await waitFor(() => expect(runStreamingDictation).toHaveBeenCalledTimes(1));
    expect(runStreamingDictation).toHaveBeenCalledWith(
      expect.objectContaining({
        stt_model: "gpt-realtime-whisper",
      }),
    );
    await waitFor(() => expect(runAudioFileDictation).toHaveBeenCalledTimes(1));
  });

  it("shows streaming first-token diagnostics after streaming output completes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openSettingsTab(user, "Advanced");
    await user.click(
      await screen.findByRole("checkbox", {
        name: /experimental streaming dictation/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: "General" }));
    await user.click(screen.getByRole("button", { name: /Start Dictation/i }));
    await user.click(screen.getByRole("button", { name: /Stop Dictation/i }));

    const diagnostics = await screen.findByLabelText(
      /Last dictation diagnostics/i,
    );
    expect(within(diagnostics).getByText("First STT")).toBeInTheDocument();
    expect(within(diagnostics).getByText("35 ms")).toBeInTheDocument();
    expect(within(diagnostics).getByText("First rewrite")).toBeInTheDocument();
    expect(within(diagnostics).getByText("55 ms")).toBeInTheDocument();
    expect(within(diagnostics).getByText("First insert")).toBeInTheDocument();
    expect(within(diagnostics).getByText("75 ms")).toBeInTheDocument();
  });

  it("drives the manual dictation flow from the primary button", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Start Dictation/i }));

    expect(startRecording).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: /Stop Dictation/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Recording to temporary WAV/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Stop Dictation/i }));

    expect(stopRecording).toHaveBeenCalledTimes(1);
    expect(runAudioFileDictation).toHaveBeenCalledWith({
      audio_path: "C:\\Temp\\gospeak-test.wav",
      profile_id: "normal",
      stt_model: "whisper-large-v3-turbo",
      rewrite_model: "gpt-5-nano",
      selected_text: null,
      skip_rewrite: false,
    });
    expect(copyTextForPaste).toHaveBeenCalledWith("Polished dictation text");
    expect(cleanupTempAudioFile).toHaveBeenCalledWith("C:\\Temp\\gospeak-test.wav");
    expect(await screen.findByText(/Text copied to clipboard/i)).toBeInTheDocument();
  });

  it("uses selected text as edit context when Speak to Edit is enabled", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openSettingsTab(user, "Dictation");
    await user.click(screen.getByLabelText(/Speak to Edit/i));
    await user.click(screen.getByRole("button", { name: "General" }));
    await user.click(screen.getByRole("button", { name: /Start Speak to Edit/i }));

    expect(readSelectedTextForEdit).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Editing selected text/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Stop Speak to Edit/i }));

    expect(runAudioFileDictation).toHaveBeenCalledWith(
      expect.objectContaining({
        selected_text: "Selected draft text.",
        skip_rewrite: false,
      }),
    );
    expect(copyTextForPaste).toHaveBeenCalledWith("Polished dictation text");
  });

  it("shows last dictation latency diagnostics after output completes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Start Dictation/i }));
    await user.click(screen.getByRole("button", { name: /Stop Dictation/i }));

    const diagnostics = await screen.findByLabelText(
      /Last dictation diagnostics/i,
    );
    expect(
      within(diagnostics).getByRole("heading", {
        name: /Last dictation diagnostics/i,
      }),
    ).toBeInTheDocument();
    expect(within(diagnostics).getByText("STT")).toBeInTheDocument();
    expect(within(diagnostics).getByText("120 ms")).toBeInTheDocument();
    expect(within(diagnostics).getByText("Rewrite")).toBeInTheDocument();
    expect(within(diagnostics).getByText("80 ms")).toBeInTheDocument();
    expect(within(diagnostics).getByText("Audio")).toBeInTheDocument();
    expect(within(diagnostics).getByText("1.5 s")).toBeInTheDocument();
    expect(within(diagnostics).getByText("31.3 KB")).toBeInTheDocument();
  });

  it("sends fast dictation requests that skip rewrite", async () => {
    const user = userEvent.setup();
    vi.mocked(runAudioFileDictation).mockResolvedValueOnce({
      text: "Raw fast transcript",
      profile_id: "normal",
      rewrite_fallback_used: false,
      stt_latency_ms: 90,
      rewrite_latency_ms: null,
      audio_seconds: 0.8,
      audio_file_bytes: 16000,
      fast_path_used: true,
    });
    render(<App />);

    await openSettingsTab(user, "Dictation");
    await user.click(screen.getByLabelText(/Fast dictation/i));
    await user.click(screen.getByRole("button", { name: "General" }));
    await user.click(screen.getByRole("button", { name: /Start Dictation/i }));
    await user.click(screen.getByRole("button", { name: /Stop Dictation/i }));

    expect(runAudioFileDictation).toHaveBeenCalledWith(
      expect.objectContaining({ skip_rewrite: true }),
    );
    expect(copyTextForPaste).toHaveBeenCalledWith("Raw fast transcript");
    expect(await screen.findByText("Skipped")).toBeInTheDocument();
  });

  it("silently cancels dictation when no speech is detected", async () => {
    const user = userEvent.setup();
    vi.mocked(runAudioFileDictation).mockResolvedValueOnce({
      text: "",
      profile_id: "normal",
      rewrite_fallback_used: false,
      stt_latency_ms: 0,
      rewrite_latency_ms: null,
      audio_seconds: 0.2,
      audio_file_bytes: 4096,
      fast_path_used: false,
      no_speech: true,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Start Dictation/i }));
    await user.click(screen.getByRole("button", { name: /Stop Dictation/i }));

    await waitFor(() => expect(runAudioFileDictation).toHaveBeenCalledTimes(1));
    expect(copyTextForPaste).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Start Dictation/i })).toBeInTheDocument();
    expect(publishRecorderState).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "error" }),
    );
  });

  it("renders App Rules inside the selected Profile with the detected app preview", async () => {
    const user = userEvent.setup();
    vi.mocked(getForegroundAppContext).mockResolvedValueOnce({
      appId: "chrome.exe",
      windowTitle: "ChatGPT - Chrome",
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Profiles" }));

    expect(screen.getByRole("heading", { name: "App Rules" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Enable app-aware routing/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/App id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Title contains/i)).toBeInTheDocument();
    expect(screen.getByText(/chrome\.exe/i)).toBeInTheDocument();
    expect(screen.getByText(/ChatGPT - Chrome/i)).toBeInTheDocument();
  });

  it("saves App Rules through the selected Profile", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Profiles" }));
    await user.type(screen.getByLabelText(/App id/i), "chrome.exe");
    await user.type(screen.getByLabelText(/Title contains/i), "ChatGPT");
    await user.clear(screen.getByLabelText(/Priority/i));
    await user.type(screen.getByLabelText(/Priority/i), "10");
    await user.click(screen.getByRole("button", { name: /Save app rule/i }));

    expect(upsertAppProfileRule).toHaveBeenCalledWith({
      record: expect.objectContaining({
        appId: "chrome.exe",
        windowTitlePattern: "ChatGPT",
        profileId: "normal",
        priority: 10,
        enabled: true,
        deletedAt: null,
      }),
    });
    expect(await screen.findByText(/App rule saved/i)).toBeInTheDocument();
  });

  it("keeps Profiles active when dirty navigation is cancelled", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Profiles" }));
    await user.clear(screen.getByLabelText("Profile name"));
    await user.type(screen.getByLabelText("Profile name"), "Changed Normal");
    await user.click(screen.getByRole("button", { name: "General" }));

    expect(confirm).toHaveBeenCalledWith("Discard unsaved Profile changes?");
    expect(screen.getByRole("heading", { name: "Changed Normal" })).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("keeps a new Profile draft open when primary navigation discard is cancelled", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Profiles" }));
    await user.click(screen.getByRole("button", { name: "New Profile" }));
    await user.click(screen.getByRole("button", { name: "General" }));

    expect(confirm).toHaveBeenCalledWith("Discard unsaved Profile changes?");
    expect(screen.getByRole("heading", { name: "New Profile" })).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("falls back to Normal before saving an active disabled Profile", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Profiles" }));
    await user.click(screen.getByRole("button", { name: "Email" }));
    await user.click(screen.getByRole("button", { name: "Set Active" }));
    await waitFor(() =>
      expect(upsertPreference).toHaveBeenCalledWith(
        expect.objectContaining({ key: "active_profile_id", value: "email" }),
      ),
    );
    await user.click(screen.getByRole("checkbox", { name: "Enabled" }));
    await user.click(screen.getByRole("button", { name: "Save Profile" }));

    await waitFor(() =>
      expect(upsertPreference).toHaveBeenCalledWith(
        expect.objectContaining({ key: "active_profile_id", value: "normal" }),
      ),
    );
    expect(upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: "email", enabled: false }),
    );
  });

  it("soft-deletes an active Profile, its App Rules, and falls back to Normal", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(listAppProfileRules).mockResolvedValueOnce([
      {
        id: "rule_outlook_email",
        appId: "outlook.exe",
        windowTitlePattern: null,
        profileId: "email",
        priority: 0,
        enabled: true,
        updatedAt: "2026-07-10T00:00:00.000Z",
        deletedAt: null,
      },
    ]);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Profiles" }));
    await user.click(screen.getByRole("button", { name: "Email" }));
    await user.click(screen.getByRole("button", { name: "Set Active" }));
    await user.click(screen.getByRole("button", { name: "Delete Email" }));

    await waitFor(() =>
      expect(upsertPreference).toHaveBeenCalledWith(
        expect.objectContaining({ key: "active_profile_id", value: "normal" }),
      ),
    );
    expect(upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: "email", enabled: false, deleted_at: expect.any(String) }),
    );
    expect(upsertAppProfileRule).toHaveBeenCalledWith({
      record: expect.objectContaining({
        id: "rule_outlook_email",
        enabled: false,
        deletedAt: expect.any(String),
      }),
    });
    confirm.mockRestore();
  });

  it("hydrates backend-style records and routes from camelCase foreground context", async () => {
    const user = userEvent.setup();
    vi.mocked(listAppProfileRules).mockResolvedValueOnce([
      {
        id: "rule_chrome_prompt",
        appId: "chrome.exe",
        windowTitlePattern: "ChatGPT",
        profileId: "prompt",
        priority: 10,
        enabled: true,
        updatedAt: "2026-06-30T10:00:00.000Z",
        deletedAt: null,
      },
    ]);
    vi.mocked(getForegroundAppContext).mockResolvedValue({
      appId: "chrome.exe",
      windowTitle: "ChatGPT - Chrome",
    });
    render(<App />);

    await openSettingsTab(user, "Advanced");
    await user.click(screen.getByLabelText(/Enable app-aware routing/i));
    await user.click(screen.getByRole("button", { name: "Profiles" }));
    await screen.findAllByText(/chrome\.exe/i);
    await user.click(screen.getByRole("button", { name: "General" }));
    await user.click(screen.getByRole("button", { name: /Start Dictation/i }));
    await user.click(screen.getByRole("button", { name: /Stop Dictation/i }));

    expect(getForegroundAppContext).toHaveBeenCalled();
    expect(runAudioFileDictation).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: "prompt" }),
    );
  });

  it("uses the manual active profile when app-aware routing is disabled", async () => {
    const user = userEvent.setup();
    vi.mocked(listAppProfileRules).mockResolvedValueOnce([
      {
        id: "rule_chrome_prompt",
        appId: "chrome.exe",
        windowTitlePattern: "ChatGPT",
        profileId: "prompt",
        priority: 10,
        enabled: true,
        updatedAt: "2026-06-30T10:00:00.000Z",
        deletedAt: null,
      },
    ]);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Profiles" }));
    await user.click(screen.getByRole("button", { name: "Email" }));
    await user.click(screen.getByRole("button", { name: "Set Active" }));
    await user.click(screen.getByRole("button", { name: "General" }));
    await user.click(screen.getByRole("button", { name: /Start Dictation/i }));
    await user.click(screen.getByRole("button", { name: /Stop Dictation/i }));

    expect(runAudioFileDictation).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: "email" }),
    );
  });


  it("renders cumulative provider cost totals", async () => {
    vi.useFakeTimers({ now: new Date("2026-07-10T12:00:00Z") });
    vi.mocked(listUsageEvents).mockResolvedValueOnce([
      {
        id: "usage_1",
        stt_provider: "groq",
        stt_model: "whisper-large-v3-turbo",
        llm_provider: "openai",
        llm_model: "gpt-5-nano",
        profile_id: "normal",
        audio_seconds: 60,
        stt_latency_ms: 120,
        rewrite_latency_ms: 80,
        rewrite_fallback_used: false,
        stt_estimated_cost: 0.000667,
        rewrite_estimated_cost: 0.00045,
        estimated_cost: 0.001117,
        created_at: "2026-07-01T12:00:00Z",
      },
      {
        id: "usage_2",
        stt_provider: "groq",
        stt_model: "whisper-large-v3",
        llm_provider: "openai",
        llm_model: "gpt-5-mini",
        profile_id: "email",
        audio_seconds: 30,
        stt_latency_ms: 100,
        rewrite_latency_ms: 60,
        rewrite_fallback_used: false,
        stt_estimated_cost: 0.000925,
        rewrite_estimated_cost: 0.00225,
        estimated_cost: 0.003175,
        created_at: "2026-07-01T12:01:00Z",
      },
    ]);
    try {
      render(<App />);
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const costs = screen.getByText("This month's cost").closest("section");
      expect(costs).not.toBeNull();
      expect(within(costs!).getByText("STT")).toBeInTheDocument();
      expect(within(costs!).getByText("$0.0016")).toBeInTheDocument();
      expect(within(costs!).getByText("Rewrite")).toBeInTheDocument();
      expect(within(costs!).getByText("$0.0027")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("publishes visible recorder progress while processing dictation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Start Dictation/i }));
    await user.click(screen.getByRole("button", { name: /Stop Dictation/i }));

    await waitFor(() =>
      expect(publishRecorderState).toHaveBeenCalledWith(
        expect.objectContaining({ status: "done" }),
      ),
    );
    await waitFor(() => expect(listUsageEvents).toHaveBeenCalledTimes(2));

    expect(
      vi.mocked(publishRecorderState).mock.calls.map(([payload]) => payload.status),
    ).toEqual(
      expect.arrayContaining([
        "idle",
        "recording",
        "transcribing",
        "rewriting",
        "pasting",
        "done",
      ]),
    );
  });

  it("surfaces recording start errors in the main app and recorder overlay", async () => {
    const user = userEvent.setup();
    vi.mocked(startRecording).mockRejectedValueOnce(
      new Error("No input microphone is available"),
    );

    render(<App />);

    await user.click(screen.getByRole("button", { name: /Start Dictation/i }));

    expect(
      await screen.findByText("No input microphone is available"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(publishRecorderState).toHaveBeenCalledWith({
        status: "error",
        message: "No input microphone is available",
      }),
    );
    expect(stopRecording).not.toHaveBeenCalled();
  });

  it("keeps dictation output running when recorder overlay publishing fails", async () => {
    const user = userEvent.setup();
    vi.mocked(publishRecorderState).mockRejectedValue(
      new Error(
        "window.show not allowed. Permissions associated with this command: core:window:allow-show",
      ),
    );

    render(<App />);

    await user.click(screen.getByRole("button", { name: /Start Dictation/i }));
    await user.click(screen.getByRole("button", { name: /Stop Dictation/i }));

    expect(runAudioFileDictation).toHaveBeenCalledTimes(1);
    expect(copyTextForPaste).toHaveBeenCalledWith("Polished dictation text");
    expect(await screen.findByText(/Text copied to clipboard/i)).toBeInTheDocument();
  });

  it("creates prompt profiles through the storage command", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Profiles" }));
    await user.click(screen.getByRole("button", { name: "New Profile" }));
    await user.type(screen.getByLabelText(/Profile name/i), "Meeting Notes");
    await user.clear(screen.getByLabelText(/Profile system prompt/i));
    await user.type(screen.getByLabelText(/Profile system prompt/i), "Summarize spoken notes.");
    await user.click(screen.getByRole("button", { name: /Save profile/i }));

    expect(upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Meeting Notes",
        system_prompt: "Summarize spoken notes.",
        enabled: true,
      }),
    );
    await waitFor(() =>
      expect(screen.getAllByText("Meeting Notes").length).toBeGreaterThan(0),
    );
  });

  it("creates dictionary terms through the storage command", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Dictionary/i }));
    await user.click(screen.getByRole("button", { name: "Add Dictionary term" }));
    await user.type(screen.getByLabelText("Spoken phrase"), "gawspeak");
    await user.type(screen.getByLabelText("Written phrase"), "Gospeak");
    await user.type(screen.getByLabelText("Aliases"), "go speak");
    await user.click(screen.getByRole("button", { name: "Save term" }));

    expect(upsertDictionaryTerm).toHaveBeenCalledWith(
      expect.objectContaining({
        spoken: "gawspeak",
        written: "Gospeak",
        aliases_json: JSON.stringify(["go speak"]),
        enabled: true,
      }),
    );
    await waitFor(() =>
      expect(screen.getAllByText("Gospeak").length).toBeGreaterThan(1),
    );
  });

  it("uses an empty stored Dictionary after loading", async () => {
    const user = userEvent.setup();
    vi.mocked(listDictionaryTerms).mockResolvedValueOnce([]);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Dictionary" }));
    await waitFor(() => expect(screen.getByText("0 terms")).toBeInTheDocument());

    expect(screen.queryByText("AI Agent Security")).not.toBeInTheDocument();
    expect(screen.queryByText("runtime monitoring")).not.toBeInTheDocument();
  });

  it("exports and imports configuration through file commands", async () => {
    const user = userEvent.setup();
    vi.mocked(importConfigFromFile).mockResolvedValueOnce({
      schemaVersion: 1,
      exportedAt: "2026-06-22T00:00:00.000Z",
      data: {
        providers: {
          stt: { providerId: "groq", model: "whisper-large-v3-turbo" },
          rewrite: { providerId: "openai", model: "gpt-5-nano" },
        },
        performance: { fastMode: false, speakToEdit: false, streamingMode: false },
        appRouting: { enabled: false },
        hotkey: { binding: "Alt+Space", mode: "push-to-talk" },
        privacy: {
          saveRawAudio: false,
          saveTranscriptHistory: false,
          syncTranscriptHistory: false,
          crashReportIncludesTranscript: false,
        },
        activeProfileId: "normal",
        promptProfiles: [
          {
            id: "imported",
            name: "Imported Profile",
            mode: "normal",
            systemPrompt: "Imported prompt",
            userPromptTemplate: "Transcript: {{transcript}}",
            enabled: true,
            updatedAt: "2026-06-22T00:00:00.000Z",
          },
        ],
        dictionaryTerms: [
          {
            id: "dict_imported",
            spoken: "gospeak",
            written: "Gospeak",
            aliases: [],
            tags: ["brand"],
            enabled: true,
            updatedAt: "2026-06-22T00:00:00.000Z",
          },
        ],
        appRules: [],
      },
    });

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);

    try {
      await openSettingsTab(user, "Privacy & Data");
      await user.click(screen.getByRole("button", { name: /Export configuration/i }));
      expect(selectExportPath).toHaveBeenCalled();
      expect(exportConfigToFile).toHaveBeenCalledWith(
        "C:\\Temp\\gospeak-export.json",
        expect.objectContaining({ schemaVersion: 1 }),
      );

      await user.click(screen.getByRole("button", { name: /Import configuration/i }));
      expect(selectImportPath).toHaveBeenCalled();
      expect(importConfigFromFile).toHaveBeenCalledWith("C:\\Temp\\gospeak-import.json");
    } finally {
      confirm.mockRestore();
    }

    await user.click(screen.getByRole("button", { name: "Profiles" }));
    await waitFor(() =>
      expect(screen.getAllByText("Imported Profile").length).toBeGreaterThan(0),
    );
    await user.click(screen.getByRole("button", { name: /Dictionary/i }));
    expect(await screen.findByText("brand")).toBeInTheDocument();

  });

  it("does not open the import picker when replacement is declined", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);

    try {
      await openSettingsTab(user, "Privacy & Data");
      await user.click(screen.getByRole("button", { name: /Import configuration/i }));
      expect(confirm).toHaveBeenCalledWith(
        "Importing will replace local Profiles, Dictionary terms, App Rules, and preferences. Continue?",
      );
      expect(selectImportPath).not.toHaveBeenCalled();
    } finally {
      confirm.mockRestore();
    }
  });

  it("persists the active profile and uses it for dictation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Profiles" }));
    await user.click(screen.getByRole("button", { name: "Email" }));
    await user.click(screen.getByRole("button", { name: "Set Active" }));
    expect(upsertPreference).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "active_profile_id",
        value: "email",
      }),
    );

    await user.click(screen.getByRole("button", { name: "General" }));
    await user.click(screen.getByRole("button", { name: /Start Dictation/i }));
    await user.click(screen.getByRole("button", { name: /Stop Dictation/i }));

    expect(runAudioFileDictation).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: "email" }),
    );
  });

  it("sanitizes a missing stored active profile before dictation", async () => {
    const user = userEvent.setup();
    vi.mocked(checkProviderKeys).mockResolvedValueOnce({
      groq: true,
      openai: true,
    });
    vi.mocked(listPreferences).mockResolvedValueOnce([
      {
        key: "active_profile_id",
        value: "missing_profile",
        updated_at: "2026-06-30T10:00:00.000Z",
      },
    ]);
    render(<App />);

    await screen.findAllByText("Ready");
    await user.click(screen.getByRole("button", { name: /Start Dictation/i }));
    await user.click(screen.getByRole("button", { name: /Stop Dictation/i }));

    expect(runAudioFileDictation).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: "normal" }),
    );
  });

  it("allows privacy defaults to be changed and persisted", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openSettingsTab(user, "Privacy & Data");
    await user.click(screen.getByLabelText(/Save raw audio/i));

    expect(upsertPreference).toHaveBeenCalledWith(
      expect.objectContaining({ key: "privacy" }),
    );
  });

  it("clears successful saves after four seconds but keeps errors visible", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openSettingsTab(user, "Privacy & Data");
    vi.useFakeTimers();
    try {
      await act(async () => {
        fireEvent.click(screen.getByLabelText(/Save raw audio/i));
        await Promise.resolve();
      });
      expect(screen.getByRole("status")).toHaveTextContent("Saved");

      act(() => vi.advanceTimersByTime(4000));
      expect(screen.queryByText("Saved")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Profiles" }));
      expect(screen.getByRole("button", { name: "Save Profile" })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
});
