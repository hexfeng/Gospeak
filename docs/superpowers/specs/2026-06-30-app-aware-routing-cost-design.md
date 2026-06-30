# App-Aware Routing And Cost Visibility Design

## Goal

Ship the first Post-P0 slice after the accepted Windows Alpha: App-aware Profile routing plus a lightweight provider/model cost and latency table.

## Scope

This slice keeps Speak to Edit, Sync/WebDAV, and local Whisper out of scope. It only changes the existing dictation path enough to resolve the Profile from the current desktop context before running the existing Groq STT and OpenAI rewrite pipeline.

## Routing Behavior

The effective Profile for a dictation run is resolved in this order:

1. Manual override selected in the app, when App-aware routing is disabled.
2. Enabled App Rule matching the foreground app and optional window title pattern.
3. Current `active_profile_id` preference as fallback.
4. Built-in `normal` Profile if the fallback points at a disabled or missing Profile.

An App Rule contains an app identifier, optional window title pattern, Profile id, priority, enabled flag, update timestamp, and optional deletion timestamp. On Windows the app identifier is the foreground executable name, lowercased, such as `chrome.exe` or `code.exe`. Window titles are matched case-insensitively with simple substring matching.

## Privacy

Foreground app identity and window title are used at routing time. Usage events may store the resolved Profile and non-content routing metadata, but they must not store transcript text, polished output, selected text, API keys, raw audio, or logs. Config export may include App Rules because they are user configuration.

## UI

The app gets a new `App Rules` navigation section. It shows:

- Whether App-aware routing is enabled.
- The current detected app id and window title when available.
- A compact rule creation form with app id, optional title contains, and Profile selector.
- A list of existing rules with Profile, match text, priority, and enabled state.

The General section keeps Active Profile as the fallback/manual override.

## Cost And Latency

The Providers section gets a lightweight model table using pricing snapshots as of 2026-06-30:

- Groq `whisper-large-v3-turbo`: `$0.04/hour` audio.
- Groq `whisper-large-v3`: `$0.111/hour` audio.
- OpenAI `gpt-5-nano`: `$0.05/1M input tokens`, `$0.40/1M output tokens`.
- OpenAI `gpt-5-mini`: `$0.25/1M input tokens`, `$2.00/1M output tokens`.

The table estimates per-minute STT cost and per-1K input/output token rewrite cost. Existing last-dictation diagnostics remain the source for actual local latency.

## Verification

Implementation must include unit tests for:

- App Rule matching priority, disabled rules, app-only rules, title-specific rules, and fallback.
- SQLite migration and CRUD for App Rules.
- Export/import of App Rules without secrets or transcript content.
- Frontend App Rules UI and dictation request using the resolved Profile.
- Cost estimate formatting and model table visibility.

Full verification before completion:

```powershell
npm test
npm run lint
npm run build
cd src-tauri
cargo test
cargo fmt -- --check
cargo clippy --all-targets --all-features -- -D warnings
```
