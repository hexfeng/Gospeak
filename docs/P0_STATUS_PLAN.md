# Gospeak P0 Status And Next Plan

Last updated: 2026-06-23

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
- Dictionary and active Profile settings are loaded into the live pipeline.
- Dictionary terms are injected into both the STT prompt and rewrite prompt.
- Pipeline results include latency, audio duration, Profile, and rewrite
  fallback metadata.
- Usage events are written after successful pipeline runs without transcript or
  polished-text content.
- Preferences persist Provider models, active Profile, shortcut, and privacy.
- Native import/export dialogs plus schema validation and transactional import.
- SQLite is stored under Tauri App Data with one-time legacy database migration.
- Configurable Toggle and Push-to-talk shortcut behavior.
- Tray menu and compact always-on-top recorder window.
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
- Desktop interaction: automated wiring is complete; real foreground-app and
  microphone acceptance remains manual.

## Not Done

- Full hotkey microphone dictation acceptance with real spoken input.
- Provider/model cost estimation table.
- App-aware profiles.
- Speak to Edit.
- Sync/WebDAV/local Whisper.

## Next Plan

1. Complete `docs/P0_ACCEPTANCE_MATRIX.md` with real spoken input.
2. Install the generated Windows bundle on a clean user profile.
3. Fix any compatibility findings before calling the build a daily-use Alpha.
4. After P0 acceptance, begin App-aware Profile routing.
