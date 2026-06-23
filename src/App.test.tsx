import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  copyTextForPaste,
  cleanupTempAudioFile,
  exportConfigToFile,
  importConfigFromFile,
  runAudioFileDictation,
  listenForGlobalShortcut,
  startRecording,
  stopRecording,
  upsertDictionaryTerm,
  upsertProfile,
} from "./lib/tauri";

vi.mock("./lib/tauri", () => ({
  checkProviderKeys: vi.fn(async () => ({ groq: false, openai: false })),
  saveProviderApiKey: vi.fn(async () => ({ groq: true, openai: true })),
  startRecording: vi.fn(async () => "C:\\Temp\\gospeak-test.wav"),
  stopRecording: vi.fn(async () => "C:\\Temp\\gospeak-test.wav"),
  runAudioFileDictation: vi.fn(async () => "Polished dictation text"),
  copyTextForPaste: vi.fn(async () => ({
    copied: true,
    pasteAttempted: false,
    message: "Text copied to clipboard.",
  })),
  cleanupTempAudioFile: vi.fn(async () => true),
  listenForGlobalShortcut: vi.fn(async () => vi.fn()),
  listProfiles: vi.fn(async () => []),
  upsertProfile: vi.fn(async () => undefined),
  listDictionaryTerms: vi.fn(async () => []),
  upsertDictionaryTerm: vi.fn(async () => undefined),
  exportConfigToFile: vi.fn(async () => undefined),
  importConfigFromFile: vi.fn(async () => ({ data: null })),
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
      config: {
        stt_provider: "groq",
        stt_model: "whisper-large-v3-turbo",
        rewrite_provider: "openai",
        rewrite_model: "gpt-5-nano",
      },
      audio_path: "C:\\Temp\\gospeak-test.wav",
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
    expect(await screen.findByText("Meeting Notes")).toBeInTheDocument();
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
    const promptSpy = vi
      .spyOn(window, "prompt")
      .mockReturnValueOnce("C:\\Temp\\gospeak-export.json")
      .mockReturnValueOnce("C:\\Temp\\gospeak-import.json");
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
    expect(exportConfigToFile).toHaveBeenCalledWith(
      "C:\\Temp\\gospeak-export.json",
      expect.objectContaining({ schemaVersion: 1 }),
    );

    await user.click(screen.getByRole("button", { name: /Import configuration/i }));
    expect(importConfigFromFile).toHaveBeenCalledWith("C:\\Temp\\gospeak-import.json");
    expect(await screen.findByText("Imported Profile")).toBeInTheDocument();
    expect(await screen.findByText("brand")).toBeInTheDocument();

    promptSpy.mockRestore();
  });
});
