# Providers And Settings Navigation Design

Date: 2026-07-15
Status: Approved in discussion

## Goal

Move Provider and model management out of Settings into a first-class Providers
page. Make the active ASR and Rewrite configuration immediately understandable,
and let users keep multiple named configurations per Provider without adding
automatic connectivity checks or routing behavior.

## Navigation

The primary navigation order is:

1. General
2. Providers
3. Profiles
4. Dictionary
5. Settings

General remains the status and usage page. Its ASR and Rewrite status cards open
Providers and focus the corresponding active configuration.

## Providers Page

### Current Pipeline Summary

The top of the page shows the active pipeline as `ASR -> Rewrite`. Each side
shows:

- configuration name
- Provider name
- model
- configuration status

Selecting either side opens the matching ASR or Rewrite tab and focuses its
configuration. The summary reports configuration completeness only. It never
claims that a remote API or local service is online.

Allowed status labels are:

- `Configured`
- `Missing key`
- `Missing endpoint`
- `Invalid endpoint`
- `Incomplete`

The page does not use `Online`, `Available`, or similar connectivity claims.

### ASR And Rewrite Tabs

The page has two tabs:

- ASR
- Rewrite

Each tab groups configurations by Provider. Every Provider group contains:

- Provider name and short purpose
- saved configuration count
- `Add configuration`
- compact rows for its named configurations

An ASR configuration belongs to one of Groq, Qwen Local, Qwen API, Doubao, or
OpenAI Realtime. A Rewrite configuration belongs to OpenAI or DeepSeek.

Each row shows:

- configuration name
- model
- non-sensitive endpoint summary when applicable
- configuration status
- active marker when selected for the current pipeline
- updated date
- actions

Selecting a row expands an inline, read-only preview. The preview shows the full
non-sensitive configuration, creation and update dates, and `Key configured` or
`Key missing`. It never reveals a stored key.

## Named Configuration Management

The same Provider can have multiple named configurations, such as personal and
work accounts. A configuration name is required and must be unique within its
Provider group after trimming whitespace and case-insensitive comparison.

Add and edit use one dialog with:

- configuration name
- fixed Provider
- model
- Base URL for Qwen Local and Qwen API only
- API Key for Providers that require or accept one

Qwen Local never asks for a key. Provider cannot be changed during editing; a
different Provider requires a new configuration.

Saving a new configuration does not activate it. Activation always requires the
explicit `Use for ASR` or `Use for Rewrite` action. Exactly one ASR configuration
and one Rewrite configuration are active at a time.

An incomplete configuration may be activated. Providers and General then show
the blocking status, and the existing readiness boundary prevents a request
before recording or upload begins.

### Credential Rules

Each named configuration owns its own credential entry in the OS credential
store. The credential identifier is based on the configuration ID, not only the
Provider name.

- Leaving the key field blank while editing preserves the stored key.
- `Replace key` writes a new value without revealing the old one.
- `Remove key` requires confirmation and updates the configuration status.
- Configuration export never contains keys.
- Imported configurations that require a key start as `Missing key`.

### Delete Rules

- An active configuration cannot be deleted until another configuration of the
  same ASR or Rewrite kind is activated.
- Delete requires confirmation.
- Deleting a configuration also deletes its configuration-scoped credential.
- Delete is permanent. There is no recycle bin or version history.
- Credential deletion runs first. If it fails, configuration metadata remains
  unchanged. If credential deletion succeeds but metadata deletion fails, the
  configuration remains visible as `Missing key` and the user can retry delete
  or provide a replacement key.

## Configuration Readiness

Readiness is derived locally from the selected Provider's required fields:

- Groq, Doubao, OpenAI Realtime, OpenAI Rewrite, and DeepSeek require a stored
  key and an allowed model.
- Qwen Local requires an allowed model and a valid loopback Base URL; it has no
  key.
- Qwen API requires an allowed model and a valid HTTPS Base URL; its key remains
  optional.

Readiness does not make a network request. Local-service reachability and remote
credential validity remain unknown until the user performs dictation.

When several problems exist, the displayed status uses this order:

1. `Invalid endpoint`
2. `Missing endpoint`
3. `Missing key`
4. `Incomplete`
5. `Configured`

## Settings Page

Settings becomes one vertical page without tabs. It contains three sections.

### Dictation

- hotkey binding
- Push-to-talk or Toggle mode
- Fast Dictation
- Speak to Edit

### Privacy And Data

- Save raw audio
- Export configuration
- Import configuration

### Advanced

- App-aware Routing

All Provider, model, endpoint, key, and Provider readiness controls are removed
from Settings.

## Data Contract

Persisted Provider configurations contain:

- stable configuration ID
- name
- ASR or Rewrite kind
- Provider ID
- model
- optional Base URL
- created timestamp
- updated timestamp

Preferences store `activeAsrConfigId` and `activeRewriteConfigId`. Runtime
pipeline requests resolve those IDs to the existing Provider, model, and Base
URL values before calling the existing routing code. Configuration metadata is
included in import and export; credentials are not.

The export schema version increases for named configurations. Import continues
to accept the current legacy schema and migrates it through the same rules as
local data. A new-schema import is rejected transactionally when an active ID
does not reference an imported configuration of the correct ASR or Rewrite
kind.

### Existing-Data Migration

Migration must preserve the current working pipeline without asking the user to
choose it again:

1. Convert the currently selected ASR and Rewrite values into two named
   configurations and mark them active.
2. Copy their legacy Provider-scoped credentials into configuration-scoped
   credential entries.
3. For any other legacy credential already present, create one inactive migrated
   configuration using that Provider's default model. Groq, Qwen API, and
   Doubao map to ASR; DeepSeek maps to Rewrite. An OpenAI legacy key creates any
   missing OpenAI Realtime ASR and OpenAI Rewrite migrated configurations. A
   migrated Qwen API configuration without a saved HTTPS endpoint remains
   `Missing endpoint`.
4. Delete a legacy credential only after its configuration-scoped copy succeeds.
   If copying fails, retain the legacy credential and report a recoverable
   migration error without exposing its value.

OpenAI's legacy key may be copied to both an OpenAI Realtime ASR configuration
and an OpenAI Rewrite configuration when both are created. Each resulting
configuration owns its copy afterward.

## Errors And Accessibility

- Failed saves keep the dialog and entered non-secret values available for
  retry.
- Failed key writes do not mark the key as configured.
- Failed activation leaves the previous active configuration unchanged.
- A failed credential deletion leaves configuration metadata intact. A later
  metadata failure leaves the row visible as `Missing key` rather than claiming
  an atomic rollback across SQLite and the OS credential store.
- Tabs, configuration rows, preview controls, menus, and dialogs remain keyboard
  accessible and visibly labeled.
- Focus returns to the control that opened a dialog.

## Scope Boundary

This design does not add:

- connectivity tests or automatic health checks
- automatic retry
- Provider priority
- cross-Provider fallback
- Provider configuration version history
- a recycle bin
- custom Provider definitions
- new Settings modules

## Acceptance Criteria

- Primary navigation uses General, Providers, Profiles, Dictionary, Settings in
  that order.
- Providers shows the active ASR-to-Rewrite pipeline and accurate local
  configuration status.
- ASR and Rewrite tabs group all supported Providers and their named
  configurations.
- Users can preview, add, edit, activate, and delete non-active configurations.
- Multiple configurations for the same Provider retain independent models,
  endpoints, and credentials.
- Keys remain hidden, configuration-scoped, and excluded from import/export.
- Existing active selections and credentials migrate without breaking the
  current pipeline.
- Settings is a single page containing only Dictation, Privacy and Data, and
  Advanced sections.
- Existing routing remains explicit and never automatically changes Provider.

## Verification

- Frontend tests cover navigation, tab behavior, grouping, preview, status
  labels, CRUD dialogs, activation, active-delete blocking, and the consolidated
  Settings page.
- Config tests cover readiness for every supported Provider and old import
  defaults.
- Rust storage tests cover configuration CRUD, active IDs, and migration.
- Credential tests cover configuration-scoped save, replace, remove, migration,
  and rollback-safe failure behavior without exposing key values.
- Browser checks cover configured, incomplete, empty-group, expanded-preview,
  dialog, error, and narrow-window states.
