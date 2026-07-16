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
import type { ProviderCredentialQuery } from "./lib/tauri";
import {
  checkProviderKeys,
  checkProviderConfigurationKeys,
  copyTextForPaste,
  cleanupTempAudioFile,
  exportConfigToFile,
  importConfigFromFile,
  getForegroundAppContext,
  listAppProfileRules,
  listDictionaryTerms,
  listPreferences,
  listUsageEvents,
  migrateProviderConfigurationApiKey,
  removeProviderApiKey,
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

type GlobalShortcutState = "pressed" | "released";

let globalShortcutHandler: ((state: GlobalShortcutState) => void) | undefined;

vi.mock("./lib/tauri", () => ({
  checkProviderKeys: vi.fn(async () => ({ groq: false, openai: false })),
  checkProviderConfigurationKeys: vi.fn(async (configurations: ProviderCredentialQuery[]) =>
    Object.fromEntries(configurations.map(({ configId }) => [configId, false])),
  ),
  saveProviderConfigurationApiKey: vi.fn(async () => undefined),
  removeProviderConfigurationApiKey: vi.fn(async () => undefined),
  migrateProviderConfigurationApiKey: vi.fn(async () => false),
  removeProviderApiKey: vi.fn(async () => undefined),
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
    globalShortcutHandler = undefined;
    vi.mocked(listenForGlobalShortcut).mockImplementation(async (handler) => {
      globalShortcutHandler = handler;
      return () => undefined;
    });
  });

  async function triggerGlobalShortcut(state: GlobalShortcutState) {
    await waitFor(() => expect(globalShortcutHandler).toBeDefined());
    act(() => globalShortcutHandler?.(state));
  }

  async function startDictationWithGlobalShortcut() {
    await triggerGlobalShortcut("pressed");
    await waitFor(() =>
      expect(
        vi.mocked(startRecording).mock.calls.length +
          vi.mocked(startStreamingRecording).mock.calls.length,
      ).toBeGreaterThan(0),
    );
  }

  async function dictateWithGlobalShortcut() {
    await startDictationWithGlobalShortcut();
    await stopDictationWithGlobalShortcut();
  }

  async function stopDictationWithGlobalShortcut() {
    await triggerGlobalShortcut("released");
    await waitFor(() =>
      expect(
        vi.mocked(runAudioFileDictation).mock.calls.length +
          vi.mocked(runStreamingDictation).mock.calls.length,
      ).toBeGreaterThan(0),
    );
  }

  async function openSettingsTab(
    user: ReturnType<typeof userEvent.setup>,
    tab: "Dictation" | "Providers" | "Privacy & Data" | "Advanced",
  ) {
    if (tab === "Providers") {
      await user.click(screen.getByRole("button", { name: "Providers" }));
      return;
    }
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("heading", { name: tab })).toBeInTheDocument();
  }

  async function changeActiveAsr(
    user: ReturnType<typeof userEvent.setup>,
    provider: "openai-realtime",
  ) {
    await openSettingsTab(user, "Providers");
    await user.click(screen.getByRole("button", { name: "Add configuration" }));
    await user.selectOptions(screen.getByLabelText("Provider"), provider);
    await user.type(screen.getByLabelText("Configuration name"), "Realtime test");
    await user.click(screen.getByRole("button", { name: "Save configuration" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const card = screen.getByText("Realtime test").closest("article")!;
    await user.click(within(card).getByRole("button", { name: "Use for ASR" }));
  }

  it("renders one module at a time from sidebar navigation", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.queryByRole("heading", { name: /Gospeak Alpha/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gospeak" })).toBeInTheDocument();
    const generalPage = document.querySelector<HTMLElement>(".general-page");
    expect(generalPage).not.toBeNull();
    expect(
      within(generalPage!).queryByRole("button", { name: /Start Dictation/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start Dictation/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Last dictation diagnostics/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/STT model/i)).not.toBeInTheDocument();

    await openSettingsTab(user, "Providers");

    expect(screen.getByRole("heading", { name: "Providers" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Gospeak" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("whisper-large-v3-turbo").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Start Dictation/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Last dictation diagnostics/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Profiles" }));
    expect(screen.queryByRole("button", { name: /Start Dictation/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Last dictation diagnostics/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dictionary" }));
    expect(screen.queryByRole("button", { name: /Start Dictation/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Last dictation diagnostics/i)).not.toBeInTheDocument();
  });

  it("loads persisted provider key status on startup", async () => {
    vi.mocked(checkProviderKeys).mockResolvedValueOnce({
      groq: true,
      openai: true,
    });
    vi.mocked(checkProviderConfigurationKeys).mockImplementationOnce(
      async (configurations) =>
        Object.fromEntries(configurations.map(({ configId }) => [configId, true])),
    );

    render(<App />);

    await waitFor(() => expect(checkProviderKeys).toHaveBeenCalledTimes(1));
    await openSettingsTab(userEvent.setup(), "Providers");
    expect((await screen.findAllByText("Configured")).length).toBeGreaterThanOrEqual(2);
  });

  it("migrates legacy Provider credentials into configuration-scoped accounts", async () => {
    render(<App />);

    await waitFor(() =>
      expect(migrateProviderConfigurationApiKey).toHaveBeenCalledTimes(2),
    );
    expect(migrateProviderConfigurationApiKey).toHaveBeenCalledWith(
      "provider_default_groq_stt",
      "groq",
    );
    expect(removeProviderApiKey).toHaveBeenCalledWith("groq");
    expect(removeProviderApiKey).toHaveBeenCalledWith("openai");
    expect(migrateProviderConfigurationApiKey).toHaveBeenCalledWith(
      "provider_default_openai_rewrite",
      "openai",
    );
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

  it("renders the final five-item navigation without standalone App Rules", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      within(screen.getByRole("navigation"))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["General", "Providers", "Profiles", "Dictionary", "Settings"]);
    expect(screen.queryByText("Ready for push-to-talk")).not.toBeInTheDocument();
    await openSettingsTab(user, "Dictation");
    expect(screen.getByLabelText(/Speak to Edit/i)).toBeInTheDocument();
    expect(screen.queryByText(/Sync Folder/i)).not.toBeInTheDocument();
  });

  it("lists OpenAI Realtime as an ASR provider", async () => {
    const user = userEvent.setup();
    render(<App />);

    await openSettingsTab(user, "Providers");
    await user.click(screen.getByRole("button", { name: "Add configuration" }));
    expect(screen.getByLabelText("Provider")).toHaveTextContent(
      "OpenAI Realtime",
    );
  });

  it("does not fall back to another ASR provider when realtime fails", async () => {
    const user = userEvent.setup();
    vi.mocked(runStreamingDictation).mockRejectedValueOnce(
      new Error("stream unavailable"),
    );
    render(<App />);

    await changeActiveAsr(user, "openai-realtime");
    await user.click(screen.getByRole("button", { name: "General" }));
    await startDictationWithGlobalShortcut();
    expect(startStreamingRecording).toHaveBeenCalledTimes(1);
    await stopDictationWithGlobalShortcut();

    await waitFor(() => expect(runStreamingDictation).toHaveBeenCalledTimes(1));
    expect(runStreamingDictation).toHaveBeenCalledWith(
      expect.objectContaining({
        stt_provider: "openai-realtime",
        stt_model: "gpt-realtime-2",
      }),
    );
    expect(runAudioFileDictation).not.toHaveBeenCalled();
  });

  it("runs streaming dictation from the global shortcut", async () => {
    const user = userEvent.setup();
    render(<App />);

    await changeActiveAsr(user, "openai-realtime");
    await user.click(screen.getByRole("button", { name: "General" }));
    await dictateWithGlobalShortcut();

    await waitFor(() => expect(runStreamingDictation).toHaveBeenCalledTimes(1));
    expect(copyTextForPaste).not.toHaveBeenCalled();
  });

  it("drives the manual dictation flow from the global shortcut", async () => {
    render(<App />);

    await startDictationWithGlobalShortcut();

    expect(startRecording).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Recording to temporary WAV/i)).toBeInTheDocument();

    await stopDictationWithGlobalShortcut();

    expect(stopRecording).toHaveBeenCalledTimes(1);
    expect(runAudioFileDictation).toHaveBeenCalledWith(expect.objectContaining({
      audio_path: "C:\\Temp\\gospeak-test.wav",
      profile_id: "normal",
      stt_provider: "groq",
      stt_model: "whisper-large-v3-turbo",
      stt_base_url: null,
      rewrite_provider: "openai",
      stt_config_id: "provider_default_groq_stt",
      rewrite_config_id: "provider_default_openai_rewrite",
      rewrite_model: "gpt-5-nano",
      selected_text: null,
      skip_rewrite: false,
    }));
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
    await startDictationWithGlobalShortcut();

    expect(readSelectedTextForEdit).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Editing selected text/i)).toBeInTheDocument();

    await stopDictationWithGlobalShortcut();

    expect(runAudioFileDictation).toHaveBeenCalledWith(
      expect.objectContaining({
        selected_text: "Selected draft text.",
        skip_rewrite: false,
      }),
    );
    expect(copyTextForPaste).toHaveBeenCalledWith("Polished dictation text");
  });

  it("does not render diagnostics after shortcut dictation", async () => {
    render(<App />);

    await dictateWithGlobalShortcut();

    await screen.findByText(/Text copied to clipboard/i);
    expect(screen.queryByLabelText(/Last dictation diagnostics/i)).not.toBeInTheDocument();
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
    await dictateWithGlobalShortcut();

    expect(runAudioFileDictation).toHaveBeenCalledWith(
      expect.objectContaining({ skip_rewrite: true }),
    );
    expect(copyTextForPaste).toHaveBeenCalledWith("Raw fast transcript");
  });

  it("silently cancels dictation when no speech is detected", async () => {
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

    await dictateWithGlobalShortcut();

    await waitFor(() => expect(runAudioFileDictation).toHaveBeenCalledTimes(1));
    expect(copyTextForPaste).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Start Dictation/i })).not.toBeInTheDocument();
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
    await dictateWithGlobalShortcut();

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
    await dictateWithGlobalShortcut();

    expect(runAudioFileDictation).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: "email" }),
    );
  });


  it("renders all-time usage totals", async () => {
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

      const usage = screen.getByLabelText("All-time usage");
      expect(within(usage).getByText("1m 30s")).toBeInTheDocument();
      expect(within(usage).getByText("0")).toBeInTheDocument();
      expect(within(usage).getByText("$0.0043")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("publishes visible recorder progress while processing dictation", async () => {
    render(<App />);

    await dictateWithGlobalShortcut();

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
    vi.mocked(startRecording).mockRejectedValueOnce(
      new Error("No input microphone is available"),
    );

    render(<App />);

    await triggerGlobalShortcut("pressed");

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
    vi.mocked(publishRecorderState).mockRejectedValue(
      new Error(
        "window.show not allowed. Permissions associated with this command: core:window:allow-show",
      ),
    );

    render(<App />);

    await dictateWithGlobalShortcut();

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
    await user.click(screen.getAllByRole("button", { name: "Add term" })[0]);
    await user.type(screen.getByLabelText("Spoken phrase"), "gawspeak");
    await user.type(screen.getByLabelText("Written phrase"), "Gospeak");
    await user.type(screen.getByLabelText("Aliases"), "go speak");
    await user.click(screen.getByRole("button", { name: "Save term" }));

    expect(upsertDictionaryTerm).toHaveBeenCalledWith(
      expect.objectContaining({
        spoken: "gawspeak",
        written: "Gospeak",
        aliases_json: JSON.stringify(["go speak"]),
        term_type: "other",
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
    await waitFor(() =>
      expect(
        screen.getByText("0 global terms · 0 enabled · types and tags organize this page only"),
      ).toBeInTheDocument(),
    );

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
            type: "brand-product",
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
        expect.objectContaining({ schemaVersion: 2 }),
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
    expect((await screen.findAllByText("brand")).length).toBeGreaterThan(0);

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
    await dictateWithGlobalShortcut();

    expect(runAudioFileDictation).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: "email" }),
    );
  });

  it("sanitizes a missing stored active profile before dictation", async () => {
    vi.mocked(checkProviderKeys).mockResolvedValueOnce({
      groq: true,
      openai: true,
    });
    vi.mocked(checkProviderConfigurationKeys).mockImplementationOnce(
      async (configurations) =>
        Object.fromEntries(configurations.map(({ configId }) => [configId, true])),
    );
    vi.mocked(listPreferences).mockResolvedValueOnce([
      {
        key: "active_profile_id",
        value: "missing_profile",
        updated_at: "2026-06-30T10:00:00.000Z",
      },
    ]);
    render(<App />);

    await screen.findByText("Cloud");
    await dictateWithGlobalShortcut();

    expect(runAudioFileDictation).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: "normal" }),
    );
  });

  it("persists the one-time legacy streaming migration", async () => {
    vi.mocked(listPreferences).mockResolvedValueOnce([
      {
        key: "performance",
        value: JSON.stringify({
          fastMode: false,
          speakToEdit: false,
          streamingMode: true,
        }),
        updated_at: "2026-07-01T10:00:00.000Z",
      },
    ]);
    render(<App />);

    await waitFor(() =>
      expect(upsertPreference).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "providers",
          value: expect.stringContaining('"providerId":"openai-realtime"'),
        }),
      ),
    );
    expect(upsertPreference).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "performance",
        value: JSON.stringify({ fastMode: false, speakToEdit: false }),
      }),
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
