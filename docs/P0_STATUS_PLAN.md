# Gospeak P0 Status And Next Plan

Last updated: 2026-07-01

## Current Status

Gospeak is now effectively P0 Alpha complete in the local working tree. The
base P0 Alpha was accepted on 2026-06-30, and the latest local debug build adds
the remaining post-P0 alpha slice: App-aware routing, provider usage cost
totals, and Speak to Edit. Automated verification and debug packaging pass on
the latest local build. The main backend loop is present:

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

Speak to Edit has automated coverage and user-reported manual target-app
acceptance as of 2026-07-01.

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
- Provider usage cost totals that record STT cost from actual audio duration and
  rewrite cost from OpenAI token usage, displayed as separate STT and rewrite
  metrics.
- Speak to Edit with selected-text capture through native Copy, clipboard
  restoration, spoken edit instruction transcription, selected-text rewrite,
  and native paste replacement.
- Privacy-safe JSON import/export file commands excluding keys, audio,
  transcript history, and logs.
- Native paste smoke tests passed in Notepad, Chrome textarea, Cursor/VS Code,
  and a browser contenteditable composer.
- Rust and frontend tests for provider safety, fallback behavior, storage,
  audio cleanup, clipboard validation, and the manual dictation UI flow.

## Partial

- No active implementation or manual acceptance partials remain for P0 Alpha.

## Not Done

- No remaining P0 Alpha implementation items.
- Sync/WebDAV/local Whisper remain deferred follow-up features, not P0 scope.

## Next Plan

1. Publish the current branch/PR using the existing secret-safe workflow.
2. Treat the next slice as release hardening: installer/update notes,
   regression smoke script, and packaging sanity checks.
3. After release hardening, consider VAD/error handling. Keep local Whisper and
   Sync Folder/WebDAV deferred until explicitly scoped.
