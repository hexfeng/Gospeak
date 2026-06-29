import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  checkProviderKeys,
  copyTextForPaste,
  cleanupTempAudioFile,
  exportConfigToFile,
  importConfigFromFile,
  runAudioFileDictation,
  listenForGlobalShortcut,
  startRecording,
  stopRecording,
  upsertDictionaryTerm,
  upsertPreference,
  upsertProfile,
  selectExportPath,
  selectImportPath,
} from "./lib/tauri";

vi.mock("./lib/tauri", () => ({
  checkProviderKeys: vi.fn(async () => ({ groq: false, openai: false })),
  saveProviderApiKey: vi.fn(async () => ({ groq: true, openai: true })),
  startRecording: vi.fn(async () => "C:\\Temp\\gospeak-test.wav"),
  stopRecording: vi.fn(async () => "C:\\Temp\\gospeak-test.wav"),
  runAudioFileDictation: vi.fn(async () => ({
    text: "Polished dictation text",
    profile_id: "normal",
    rewrite_fallback_used: false,
    stt_latency_ms: 120,
    rewrite_latency_ms: 80,
    audio_seconds: 1.5,
  })),
  copyTextForPaste: vi.fn(async () => ({
    copied: true,
    pasteAttempted: false,
    message: "Text copied to clipboard.",
  })),
  cleanupTempAudioFile: vi.fn(async () => true),
  listenForGlobalShortcut: vi.fn(async () => vi.fn()),
  listProfiles: vi.fn(async () => []),
  listPreferences: vi.fn(async () => []),
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

  it("renders the provider configuration surface", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /Gospeak Alpha/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Groq STT/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/OpenAI Rewrite/i).length).toBeGreaterThan(0);
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
    expect(await screen.findAllByText("Key ready")).toHaveLength(2);
  });

  it("registers the global shortcut listener", async () => {
    render(<App />);

    await waitFor(() => expect(listenForGlobalShortcut).toHaveBeenCalledTimes(1));
  });

  it("renders P0 Alpha sections without P1 scope", () => {
    render(<App />);

    expect(screen.getByText(/Prompt Profiles/i)).toBeInTheDocument();
    expect(screen.getByText(/Personal Dictionary/i)).toBeInTheDocument();
    expect(screen.getByText(/Privacy Defaults/i)).toBeInTheDocument();
    expect(screen.getByText(/Export configuration/i)).toBeInTheDocument();
    expect(screen.queryByText(/Speak to Edit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sync Folder/i)).not.toBeInTheDocument();
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
    });
    expect(copyTextForPaste).toHaveBeenCalledWith("Polished dictation text");
    expect(cleanupTempAudioFile).toHaveBeenCalledWith("C:\\Temp\\gospeak-test.wav");
    expect(await screen.findByText(/Text copied to clipboard/i)).toBeInTheDocument();
  });

  it("creates prompt profiles through the storage command", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/Profile name/i), "Meeting Notes");
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
      expect(screen.getAllByText("Meeting Notes").length).toBeGreaterThan(1),
    );
  });

  it("creates dictionary terms through the storage command", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/Spoken phrase/i), "gawspeak");
    await user.type(screen.getByLabelText(/Written phrase/i), "Gospeak");
    await user.type(screen.getByLabelText(/Dictionary aliases/i), "go speak");
    await user.click(screen.getByRole("button", { name: /Save dictionary term/i }));

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
      },
    });

    render(<App />);

    await user.click(screen.getByRole("button", { name: /Export configuration/i }));
    expect(selectExportPath).toHaveBeenCalled();
    expect(exportConfigToFile).toHaveBeenCalledWith(
      "C:\\Temp\\gospeak-export.json",
      expect.objectContaining({ schemaVersion: 1 }),
    );

    await user.click(screen.getByRole("button", { name: /Import configuration/i }));
    expect(selectImportPath).toHaveBeenCalled();
    expect(importConfigFromFile).toHaveBeenCalledWith("C:\\Temp\\gospeak-import.json");
    await waitFor(() =>
      expect(screen.getAllByText("Imported Profile").length).toBeGreaterThan(1),
    );
    expect(await screen.findByText("brand")).toBeInTheDocument();

  });

  it("persists the active profile and uses it for dictation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText(/Active profile/i), "email");
    expect(upsertPreference).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "active_profile_id",
        value: "email",
      }),
    );

    await user.click(screen.getByRole("button", { name: /Start Dictation/i }));
    await user.click(screen.getByRole("button", { name: /Stop Dictation/i }));

    expect(runAudioFileDictation).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: "email" }),
    );
  });

  it("allows privacy defaults to be changed and persisted", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByLabelText(/Save raw audio/i));

    expect(upsertPreference).toHaveBeenCalledWith(
      expect.objectContaining({ key: "privacy" }),
    );
  });
});
