# Gospeak P0 Status And Next Plan

Last updated: 2026-07-01

## Current Status

Gospeak is now an accepted P0 Alpha implementation as of 2026-06-30. Automated
verification and packaging pass on the latest local build, and manual
acceptance has been recorded as passed in `docs/P0_ACCEPTANCE_MATRIX.md`. The
main backend loop is present:

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

Post-P0 App-aware Profile routing has also been manually accepted as of
2026-07-01 after user-reported target-app testing confirmed that App Rules can
route to the expected Profile.

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
- Waveform-only recorder overlay with state color/status labels and required
  Tauri `window.show`/`window.hide` permissions.
- Latency diagnostics, 16 kHz mono STT audio optimization, HTTP client reuse,
  and Fast dictation mode that can skip rewrite.
- App-aware Profile routing with Windows foreground app/window-title detection,
  SQLite-backed App Rules, active Profile fallback, and built-in Normal fallback.
- Provider/model cost estimation table with a 2026-06-30 pricing snapshot for
  Groq Whisper and OpenAI rewrite models.
- Privacy-safe JSON import/export file commands excluding keys, audio,
  transcript history, and logs.
- Native paste smoke tests passed in Notepad, Chrome textarea, Cursor/VS Code,
  and a browser contenteditable composer.
- Rust and frontend tests for provider safety, fallback behavior, storage,
  audio cleanup, clipboard validation, and the manual dictation UI flow.

## Partial

- No active partial App-aware routing work remains. Future App Rules changes
  should be treated as bug fixes or explicitly scoped follow-up features.

## Not Done

- Speak to Edit.
- Sync/WebDAV/local Whisper.

## Next Plan

1. Start Speak to Edit design and feasibility validation.
2. Keep Sync/WebDAV and local Whisper deferred.
