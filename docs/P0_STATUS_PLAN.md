# Gospeak P0 Status And Next Plan

Last updated: 2026-06-22

## Current Status

Gospeak is now a P0 Alpha implementation, but not yet a fully accepted daily-use
P0 release. The main backend loop is present:

```text
Alt+Space or Start button
-> temporary WAV recording
-> Groq STT provider
-> OpenAI rewrite provider
-> clipboard copy and native paste
-> safe temp audio cleanup
```

Live provider verification passed after Groq and OpenAI keys were manually
configured through the UI.

## Completed

- Tauri 2 + React + TypeScript desktop shell.
- Provider configuration UI for Groq STT and OpenAI rewrite.
- OS credential store integration for API keys.
- Groq STT adapter using `/audio/transcriptions`.
- OpenAI rewrite adapter using `/responses`.
- Live Groq/OpenAI smoke test with a generated WAV. Result returned text
  successfully; observed dictionary gap: "Gospeak" was transcribed as
  "Gawspeak".
- Pipeline orchestrator with raw-transcript fallback when rewrite fails.
- Manual dictation button wired to start/stop recording, pipeline, clipboard
  copy, native paste, and temp audio cleanup.
- `Alt+Space` global shortcut registration and frontend listener.
- Windows-first microphone capture to temporary WAV through `cpal` + `hound`.
- Clipboard copy fallback through `arboard`, with Windows native Ctrl+V paste
  injection.
- SQLite schema and Rust CRUD commands for preferences, prompt profiles, and
  dictionary terms.
- Prompt profile defaults plus SQLite-backed profile editing UI.
- Dictionary seed display plus SQLite-backed dictionary editing UI.
- Privacy-safe JSON import/export file commands excluding keys, audio,
  transcript history, and logs.
- Native paste smoke tests passed in Notepad, Chrome textarea, Cursor/VS Code,
  and a browser contenteditable composer.
- Rust and frontend tests for provider safety, fallback behavior, storage,
  audio cleanup, clipboard validation, and the manual dictation UI flow.

## Partial

- Global hotkey: registered and routed to the frontend dictation toggle; full
  microphone dictation via hotkey still needs human-in-loop spoken-input
  acceptance.
- SQLite persistence: profile and dictionary editing are wired; usage event
  recording is still pending.
- Usage events: schema exists; recording pipeline events is pending.

## Not Done

- Full hotkey microphone dictation acceptance with real spoken input.
- Tray menu and polished floating recorder window.
- Provider/model cost estimation table.
- App-aware profiles.
- Speak to Edit.
- Sync/WebDAV/local Whisper.

## Next Plan

1. Validate microphone dictation manually from the Tauri runtime.
2. Wire SQLite dictionary terms into the live pipeline so product terms such as
   Gospeak can correct STT output like "Gawspeak".
3. Add usage event recording after each pipeline run.
4. Add tray menu and polished floating recorder window.
