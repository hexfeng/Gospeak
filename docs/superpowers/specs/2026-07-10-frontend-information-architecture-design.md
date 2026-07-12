# Frontend Information Architecture Design

## Goal

Make Gospeak's desktop UI easier to understand without changing its current
Apple-inspired visual language. The main window should separate daily status
and usage from personalization and low-frequency configuration.

## Approved Navigation

The primary sidebar contains four destinations:

1. `General`
2. `Profiles`
3. `Dictionary`
4. `Settings`

The recorder status remains pinned at the bottom of the sidebar. The app does
not add a separate Home destination: `General` is the home and status page.

## Design Principles

- Preserve the current restrained palette, typography, spacing, and icon style.
- Show status before controls.
- Keep daily-use information separate from low-frequency settings.
- Prefer direct, contextual actions over duplicated navigation entries.
- Keep transcript content, polished output, selected text, API keys, and raw
  audio out of the UI's usage summaries.
- Use the existing React, CSS, Lucide, Tauri, and browser-native capabilities;
  add no UI dependency.

## General

`General` is a mostly read-only status page. It answers three questions in this
order: Is Gospeak ready, how is it configured, and how much has it been used?

### Page Structure

1. Page header with an overall `Ready` or `Needs setup` state.
2. Readiness summary for STT, rewrite, hotkey, and active Profile.
3. Current configuration summary:
   - Active Profile.
   - STT and rewrite models.
   - Hotkey and hotkey mode.
   - Fast Dictation, Speak to Edit, and App-aware Routing states.
4. Today's usage:
   - Completed dictations.
   - Recorded audio duration.
   - Average STT plus rewrite latency.
   - Rewrite fallback count.
5. Current-month cost:
   - STT cost.
   - Rewrite cost.
   - Combined cost.
6. Five most recent usage events showing time, Profile, latency, and result
   state without transcript content.
7. `Start Dictation` remains available in the page header but is not the visual
   center of the page because the primary daily entry points are the global
   hotkey and tray.

Each configuration summary item links to its owning page or Settings tab.
Healthy states stay quiet. A failed readiness item uses a clear warning state
and one direct repair action.

### Data Boundary

The page computes summaries from the existing `UsageEventRecord` fields:
`audio_seconds`, STT/rewrite latency, fallback state, estimated costs, Profile,
models, and `created_at`. It does not add recognized word or character counts
because those values are not currently stored. It does not persist derived
dashboard totals.

## Profiles

`Profiles` combines Profile management and App Rules because an App Rule only
makes sense in the context of the Profile it activates.

### Layout

Use a two-pane desktop layout:

- Left pane: searchable Profile list with name, mode, enabled state, active
  state, and associated App Rule count.
- Right pane: editor for the selected Profile.

The page opens on the active Profile. A `+` icon creates a new Profile; the page
does not show an empty creation form until the user requests one.

### Profile Editor

The editor contains:

- Name.
- Mode.
- Target language when relevant.
- Enabled state.
- `Set as active` action.
- System prompt and user prompt template inside an `Advanced` disclosure.
- Explicit `Save Changes` action.

Leaving the page or selecting another Profile with unsaved edits requires a
confirmation. Built-in Profiles can be edited and duplicated. The Normal
Profile cannot be deleted because it is the routing fallback.

### Automatic Switching

The selected Profile owns an `Automatic switching` section that lists App
Rules targeting that Profile. A rule contains app id, optional window-title
substring, priority, and enabled state. Users can create, edit, enable, disable,
and soft-delete rules in place. The current detected app/window preview remains
available to help create a rule.

The global App-aware Routing switch moves to `Settings > Advanced`.

## Dictionary

`Dictionary` remains a primary destination because users may maintain it more
frequently than system settings.

### Layout And Interaction

- Header with search, total count, and `+` add action.
- Compact list showing `Spoken phrase -> Written phrase` with aliases and tags
  as secondary information.
- Search matches spoken form, written form, aliases, and tags.
- Enabled state can be changed directly from the row.
- A row menu provides edit, duplicate, and delete actions.
- Add and edit use the same browser-native dialog with spoken form, written
  form, aliases, and tags.
- Saving rejects a duplicate normalized spoken form and keeps the dialog open
  with an inline error.
- The empty state contains one explanation and one add action.

Dictionary terms remain global. Profile-specific dictionaries, bulk editing,
pagination, and category management are out of scope.

## Settings

`Settings` contains low-frequency configuration. It uses four horizontal tabs
instead of another nested sidebar:

### Dictation

- Hotkey binding.
- Push-to-talk or Toggle mode.
- Fast Dictation.
- Speak to Edit.

### Providers

- Groq STT readiness, model, and API key update.
- OpenAI rewrite readiness, model, and API key update.
- Key values are never displayed after save.
- Usage cost is not shown here; it belongs on General.

### Privacy & Data

- Raw-audio, transcript-history, sync-history, and crash-report privacy states.
- Configuration export and import.
- Import shows a confirmation describing that local configuration will be
  replaced before opening the file picker.
- The developer-oriented provider JSON preview is removed.

### Advanced

- Global App-aware Routing switch.
- Experimental Streaming Dictation with a visible `Experimental` label.

Simple toggles and selects save immediately and show brief `Saved` feedback.
API keys and Profile edits retain explicit save actions. General reflects saved
configuration changes without requiring a restart.

## Shared Interaction Rules

- Navigation uses buttons with `aria-current="page"` and preserves keyboard
  focus visibility.
- Settings tabs use tab semantics and arrow-key navigation.
- Icon-only actions have accessible names and tooltips.
- Interactive targets are at least 40 CSS pixels in both dimensions in the
  desktop window.
- Dialogs use the native `dialog` element, move focus inside on open, close on
  Escape, and return focus to their trigger.
- Destructive actions require confirmation and identify the affected item.
- Success messages are short and transient; errors remain visible until the
  user changes the invalid value or retries.
- The four primary pages remain usable at the existing 980px responsive
  breakpoint. Two-pane Profiles collapses to a list-first single column below
  that breakpoint.

## Implementation Boundary

The redesign reuses existing frontend and Tauri contracts:

- Existing Profile, App Rule, Dictionary, preference, key, usage, and
  import/export commands remain the backend interface.
- Existing upsert records and `deleted_at` fields provide soft deletion.
- No Rust command, SQLite migration, provider change, or new dependency is
  required.
- Dictation, streaming, app-routing resolution, clipboard paste, and recorder
  overlay behavior remain unchanged.

## Out Of Scope

- New usage-event fields or recognized-text counts.
- Transcript or polished-output history.
- New provider adapters or pricing logic.
- Sync, WebDAV, and local Whisper.
- A mobile-specific navigation model.
- Visual restyling, new branding, or a new design system.

## Acceptance Criteria

- The sidebar exposes only General, Profiles, Dictionary, and Settings.
- General reports readiness, current setup, current-day usage, current-month
  cost, and recent privacy-safe activity from existing data.
- Profiles uses a two-pane editor and owns App Rules for the selected Profile.
- Dictionary is list-first and uses one accessible add/edit dialog.
- Settings exposes Dictation, Providers, Privacy & Data, and Advanced tabs.
- Existing dictation, routing, key storage, privacy, and import/export behavior
  continues to work.
- Frontend tests, lint, build, and browser checks pass without adding a package.
