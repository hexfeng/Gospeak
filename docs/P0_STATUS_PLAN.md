# Gospeak P0 Status And Next Plan

Last updated: 2026-06-30

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
- Privacy-safe JSON import/export file commands excluding keys, audio,
  transcript history, and logs.
- Native paste smoke tests passed in Notepad, Chrome textarea, Cursor/VS Code,
  and a browser contenteditable composer.
- Rust and frontend tests for provider safety, fallback behavior, storage,
  audio cleanup, clipboard validation, and the manual dictation UI flow.

## Partial

- Provider/model cost estimation is not implemented yet. It is useful for
  product clarity, but it is not required to keep P0 accepted.

## Not Done

- App-aware profiles.
- Speak to Edit.
- Sync/WebDAV/local Whisper.
- Provider/model cost estimation table.

## Next Plan

1. Start App-aware Profile routing as the first post-P0 slice.
2. Define the routing inputs: foreground app identity, window title, current
   active Profile, and user override behavior.
3. Add a small provider/model cost estimation table to make latency/cost
   trade-offs visible in Settings or Providers.
4. Keep Speak to Edit, Sync/WebDAV, and local Whisper deferred until App-aware
   routing is stable.
