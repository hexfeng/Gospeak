# General Dashboard Redesign

## Goal

Make General a quiet, glanceable Gospeak home screen. It answers four questions:

1. How much has Gospeak been used?
2. What mode is currently available?
3. What has that usage cost?
4. Are ASR, Rewrite, and the active Profile configured?

The page keeps the existing Apple-minimal visual language and removes secondary
configuration, activity, and diagnostics content from General.

## Page Structure

### Header

- Title: `Gospeak`.
- Supporting sentence: `Press {binding} to start dictating.` using the configured
  global shortcut.
- If no shortcut is configured, show `Set a shortcut to start dictating.`.
- General does not show a Start Dictation button.

### Aggregate Usage Card

One large bordered card contains four equal regions:

1. `Total dictation time`
2. `Total characters`
3. `Usage mode`
4. `Total cost`

Desktop uses four columns with subtle separators. At or below the existing
980px breakpoint, the regions become a two-by-two grid. On narrow mobile widths,
they become one column. Dynamic content must not resize or shift the card.

The metrics use all stored usage events, not daily or monthly windows:

- Total dictation time is the sum of `audio_seconds`.
- Total characters is the sum of `output_character_count`.
- Total cost is the sum of `stt_estimated_cost + rewrite_estimated_cost`.
- Costs are displayed in USD with enough precision to keep small values visible.

Usage mode is:

- `Not Set` when ASR is not ready.
- `Cloud` when the configured ASR uses the current remote provider path.
- `Local` is reserved for a future local ASR provider. This redesign does not add
  a local provider or infer Local from Fast Mode.

### Configuration Cards

Three equal cards appear in one row below the aggregate card:

- `ASR`: model name when ready, otherwise `Not Set`.
- `Rewrite`: model name when ready, otherwise `Not Set`.
- `Active Profile`: enabled active Profile name, otherwise `Not Set`.

ASR and Rewrite navigate to `Settings > Providers`. Active Profile navigates to
`Profiles`.

Ready cards use a restrained green solid border. Not-ready cards use a muted red
solid border. Hover and keyboard focus add a small elevation and soft shadow.
Motion must be subtle and disabled when reduced motion is requested.

The whole card is the interaction target and remains at least 40 CSS pixels in
both dimensions. State is not conveyed by color alone: `Not Set` remains visible.

## Removed General Content

Remove these sections from General only:

- overall Ready/Needs setup badge;
- four-item readiness summary;
- Current setup;
- daily usage;
- monthly cost breakdown;
- Recent activity;
- inline latency diagnostics;
- Start Dictation action.

Existing dictation, diagnostics collection, settings, and persistence behavior
remain available elsewhere and are not deleted from the product.

## Privacy-Safe Character Count

Add nullable-safe integer column `output_character_count` to `usage_events`.
Migration behavior:

- Existing databases receive the column with a non-negative default of `0`.
- Existing rows remain `0`; transcript content is not available and is not
  reconstructed or estimated.
- New non-empty usage events store the count of non-whitespace Unicode scalar
  values in the final output text.
- No transcript or output text is added to usage storage, logs, exports, or the
  frontend usage record.

Both standard and streaming dictation paths populate the field before inserting
the usage event. Import/export behavior is unchanged because usage history is not
part of configuration export.

## Data Flow

1. A successful dictation pipeline returns final output text.
2. The Tauri command computes `text.chars().filter(|c| !c.is_whitespace()).count()`.
3. Storage inserts the count with the existing usage event.
4. `list_usage_events` returns the integer to the frontend.
5. `summarizeUsage` aggregates all-time duration, characters, and costs.
6. General renders the aggregate and configuration cards from existing app state.

## Error And Empty States

- No usage events: time `0s`, characters `0`, and cost `$0.0000`.
- Missing ASR key/configuration: mode `Not Set`; ASR card `Not Set` with red border.
- Missing Rewrite key/configuration: Rewrite card `Not Set` with red border.
- Missing or disabled active Profile: Active Profile card `Not Set` with red border.
- A usage row with a missing character count contributes zero.

## Verification

- Rust storage migration and round-trip tests cover `output_character_count`.
- Standard and streaming usage-event tests verify the privacy-safe count.
- Frontend usage tests cover all-time aggregation and empty values.
- General component tests cover exact labels, navigation, model/Profile values,
  and ready/not-ready classes.
- CSS contract tests cover four-region layout, responsive collapse, state borders,
  hover/focus treatment, and reduced motion.
- Browser QA covers 1280x720, 900px, and 390px widths, both ready and missing setup
  states, navigation from all three cards, no overflow, and console health.

## Scope Boundary

This slice changes General and the minimum usage-event data needed for exact total
characters. It does not redesign Profiles, Dictionary, Settings, the sidebar, the
recorder overlay, provider selection, or usage-history retention.
