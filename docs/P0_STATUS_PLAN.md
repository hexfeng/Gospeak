# Gospeak P0 Status And Next Plan

Last updated: 2026-07-14

## Current Status

Gospeak's Windows P0 Alpha was accepted on 2026-06-30. App-aware Profile
routing and Speak to Edit were accepted on 2026-07-01. Those acceptance
decisions remain valid.

Since that acceptance, the current `main` branch has added explicit
multi-provider ASR and Rewrite routing, local light rewrite, a four-page frontend
information architecture, privacy-safe all-time character counts, and a
redesigned General dashboard. Current-head real-provider and installed-runtime
acceptance has not yet been recorded for the multi-provider slice. The backend
loop is now:

```text
Alt+Space or Start button
-> temporary WAV recording
-> explicitly selected ASR provider
-> explicitly selected Rewrite provider
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
- Minimal Provider/model configuration for Groq, Qwen Local/API, Doubao,
  OpenAI Realtime, OpenAI Rewrite, and DeepSeek Rewrite.
- OS credential store integration for API keys.
- Groq STT adapter using `/audio/transcriptions`.
- OpenAI rewrite adapter using `/responses`.
- Qwen Local/API multipart transcription adapter with loopback/HTTPS boundaries.
- Optional Qwen Local process management with a machine-local runtime directory,
  explicit Providers Start/Stop controls, readiness checks, and normal-exit cleanup.
- Doubao Flash recording-file adapter using the current single `X-Api-Key` flow.
- DeepSeek V4 Flash/Pro batch and SSE Rewrite adapters with explicit Thinking mode.
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
- Provider usage cost totals that record Groq STT duration cost, local Qwen
  external cost `0.0`, and OpenAI/DeepSeek Rewrite cost when usage is complete.
  Unknown provider prices remain unestimated.
- Speak to Edit with selected-text capture through native Copy, clipboard
  restoration, spoken edit instruction transcription, selected-text rewrite,
  and native paste replacement.
- OpenAI Realtime as an explicit ASR Provider using `gpt-realtime-2`, with
  OpenAI or DeepSeek streaming rewrite and guarded Windows Unicode insertion.
  Provider errors do not trigger cross-provider fallback.
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

- Multi-provider routing and request/response contracts have automated coverage;
  live Qwen, Doubao, DeepSeek, and current OpenAI Realtime acceptance is not recorded.
- Managed Qwen Local service and real repeated transcription smoke tests pass on
  the configured RTX 4060 environment; installed-app Start/Stop and spoken-input
  acceptance remain pending.
- Local light rewrite has automated coverage and a manual test checklist;
  current-build spoken-input acceptance is not recorded.
- The latest frontend passes automated tests. Browser design QA was recorded
  before the final General refinements; current-head browser and installed
  Tauri regression acceptance is not recorded.

## Not Done

- No remaining P0 Alpha implementation items.
- Transcript history, history sync, and transcript-in-crash-report behavior are
  not implemented. Their unsupported Settings controls have been removed.
- VAD, explicit provider retry, Qwen/Doubao streaming, and model downloading are
  not implemented.
- Sync Folder and WebDAV remain deferred follow-up features.

## Next Plan

1. Keep Public Beta planning deferred.
2. Run the real-provider/manual matrix for Groq, Qwen Local/API, Doubao,
   OpenAI Realtime, OpenAI Rewrite, and DeepSeek Flash/Pro.
3. Fix only issues found in that functional acceptance before considering new
   features.
4. Keep VAD, transcript history, Sync Folder, WebDAV, and Qwen/Doubao streaming
   deferred until explicitly prioritized.
