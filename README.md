# Gospeak

Gospeak is a Windows-first Tauri Alpha for a local-first AI voice input app.
This Alpha now implements the P0 core backend boundary for the planned flow:

```text
global hotkey -> audio capture -> Groq STT -> OpenAI rewrite -> clipboard paste
```

Live provider calls require user-supplied Groq and OpenAI keys. The app can be
developed and tested without keys through mocked frontend behavior and Rust unit
tests.

## Screenshot

![Gospeak Alpha home screen](artifacts/gospeak-home.png)

## Product Documents

- [Original PRD and technical architecture](docs/PRODUCT_PRD.md)
- [P0 status and next plan](docs/P0_STATUS_PLAN.md)

## Current Alpha Scope

- Tauri 2 + React + TypeScript app shell.
- Provider configuration UI for Groq STT and OpenAI rewrite.
- Real Groq transcription adapter using `/audio/transcriptions`.
- Real OpenAI rewrite adapter using `/responses`.
- Manual Start/Stop Dictation UI that records to a temporary WAV, runs the
  audio-file pipeline, copies and natively pastes the result, and then safely
  deletes Gospeak temp audio.
- `Alt+Space` global shortcut registration that emits a frontend event and uses
  the same dictation flow, with configurable Toggle and Push-to-talk modes.
- Tray actions and a compact always-on-top recorder window.
- App-aware Profile routing for foreground app/window-title rules.
- Speak to Edit mode that captures selected text, records a spoken edit
  instruction, rewrites the selected text, and pastes the replacement.
- Experimental streaming dictation behind an opt-in setting, with batch
  dictation fallback.
- Local light rewrite for short, safe Fast dictation cleanup, with model
  fallback when local rules are insufficient.
- A four-page General, Profiles, Dictionary, and Settings frontend. General
  shows privacy-safe all-time usage and cost totals.
- Prompt profile defaults for Normal, Email, Prompt, and Translate.
- Profile and dictionary editing UI backed by SQLite CRUD commands and consumed
  by the live STT/rewrite pipeline.
- Privacy-safe JSON import/export through native file dialogs.
- Raw-audio privacy, provider, hotkey, and active-profile preferences persisted
  locally. Unsupported transcript-history, history-sync, and
  transcript-in-crash-report controls are not exposed.
- Rust provider interface commands:
  - `check_provider_keys`
  - `save_provider_api_key`
  - `validate_alpha_pipeline`
  - `run_audio_file_dictation`
  - `start_recording`
  - `stop_recording`
  - `copy_text_for_paste`
  - `read_selected_text_for_edit`
  - `cleanup_temp_audio_file`
  - `get_foreground_app_context`
  - `list_profiles`
  - `upsert_profile`
  - `list_app_profile_rules`
  - `upsert_app_profile_rule`
  - `list_dictionary_terms`
  - `upsert_dictionary_term`
  - `list_usage_events`
  - `export_config_to_file`
  - `import_config_from_file`
- SQLite schema and Rust CRUD commands for preferences, prompt profiles,
  dictionary terms, and privacy-safe usage events.
- SQLite data lives in the OS App Data directory; an older working-directory
  database is migrated once on startup.
- API key storage uses the OS credential store through Rust `keyring`.
- Export payloads exclude API keys, raw audio, transcript history, and logs.

## Current Status And Remaining Work

- The Windows P0 Alpha, App-aware Profile routing, and Speak to Edit have
  user-reported manual acceptance recorded in
  [docs/P0_ACCEPTANCE_MATRIX.md](docs/P0_ACCEPTANCE_MATRIX.md).
- Experimental streaming, local light rewrite, and the latest frontend have
  automated coverage. Their current-build Tauri runtime acceptance is still
  pending.
- VAD, explicit provider retry, additional provider adapters, and transcript
  history are not implemented.
- Sync folder, WebDAV, and local Whisper remain deferred roadmap features.
- Public Beta planning is deferred while the current functional backlog is
  being prioritized.

## Development

```bash
npm install
npm run dev
npm run tauri dev
```

## Verification

```bash
npm test
npm run lint
npm run build
cd src-tauri
cargo test
cargo fmt -- --check
cargo clippy --all-targets --all-features -- -D warnings
```

Debug desktop build:

```bash
npx tauri build --debug
```

## Provider Keys

The UI accepts Groq and OpenAI keys, but the keys are never written to SQLite or
export payloads. In a Tauri runtime they are saved to the OS credential store.
In a plain browser dev server, key save actions only update local UI state for
safe frontend testing.
