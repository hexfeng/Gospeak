# Gospeak P0 Status And Next Plan

Last updated: 2026-07-13

## Current Status

Gospeak's Windows P0 Alpha was accepted on 2026-06-30. App-aware Profile
routing and Speak to Edit were accepted on 2026-07-01. Those acceptance
decisions remain valid.

Since that acceptance, the current `main` branch has added experimental
streaming dictation, local light rewrite, a four-page frontend information
architecture, privacy-safe all-time character counts, and a redesigned General
dashboard. Automated verification and debug packaging pass at commit
`c1f15f5`. Browser design QA was recorded at `7d30c08`, before the final
General refinements; current-head browser and Tauri runtime acceptance has not
yet been recorded for these newer features. The main backend loop remains:

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
  rewrite cost from OpenAI token usage, aggregated as Total cost on General.
- Speak to Edit with selected-text capture through native Copy, clipboard
  restoration, spoken edit instruction transcription, selected-text rewrite,
  and native paste replacement.
- Experimental streaming dictation behind `performance.streamingMode`, with
  OpenAI realtime transcription, streaming rewrite, guarded Windows Unicode
  insertion, and batch dictation fallback.
- Local light rewrite after STT for short safe dictation: filler cleanup,
  punctuation repair, simple casing, and conservative numbered-list formatting
  before model fallback.
- General, Profiles, Dictionary, and Settings frontend information architecture,
  including the redesigned General usage and readiness dashboard.
- Privacy-safe `output_character_count` usage storage and all-time usage
  aggregation without storing transcript or polished text.
- Privacy-safe JSON import/export file commands excluding keys, audio,
  transcript history, and logs.
- Native paste smoke tests passed in Notepad, Chrome textarea, Cursor/VS Code,
  and a browser contenteditable composer.
- Rust and frontend tests for provider safety, fallback behavior, storage,
  audio cleanup, clipboard validation, and the manual dictation UI flow.

## Partial

- Experimental streaming has automated coverage and remains opt-in; current-build
  manual network, partial-insertion, and fallback acceptance is not recorded.
- Local light rewrite has automated coverage and a manual test checklist;
  current-build spoken-input acceptance is not recorded.
- The latest frontend passes automated tests. Browser design QA was recorded
  before the final General refinements; current-head browser and installed
  Tauri regression acceptance is not recorded.

## Not Done

- No remaining P0 Alpha implementation items.
- Transcript history, history sync, and transcript-in-crash-report behavior are
  not implemented. Their unsupported Settings controls have been removed.
- VAD, explicit provider retry, and additional provider adapters are not
  implemented.
- Sync Folder, WebDAV, and local Whisper remain deferred follow-up features.

## Next Plan

1. Keep Public Beta planning deferred until the functional backlog is reviewed.
2. Implement the approved multi-provider ASR and Rewrite slice without automatic
   cross-provider fallback.
3. Keep VAD, transcript history, Sync Folder, WebDAV, and local model lifecycle
   management deferred until explicitly prioritized.
