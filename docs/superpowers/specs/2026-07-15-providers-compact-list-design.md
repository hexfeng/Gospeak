# Providers Compact List Design

Date: 2026-07-15
Status: Approved in discussion

## Goal

Keep the existing active ASR-to-Rewrite pipeline summary, while replacing the
large Provider-group layout with one compact configuration list that can be
understood without scrolling through empty groups.

This is a presentation and interaction refinement. It does not change the
persisted Provider configuration model, credential storage, runtime routing, or
readiness rules.

## Page Structure

The top of Providers remains unchanged:

- page title and description
- active `ASR -> Rewrite` pipeline summary
- active configuration names, Providers, models, and local readiness statuses

Below the summary, the ASR/Rewrite tabs and Provider groups are removed. One
`Configurations` section contains:

- total saved configuration count
- one `Add configuration` button
- one compact mixed list containing both ASR and Rewrite configurations
- pagination when more than five configurations exist

The list has no internal vertical scrollbar. Each page renders at most five
configuration rows.

Selecting ASR or Rewrite in the pipeline summary opens the page containing the
matching active configuration and moves keyboard focus to that row.

## Configuration Rows

Every configuration occupies one horizontal row on the normal desktop layout.
The row shows:

- configuration name
- `ASR` or `Rewrite` type label
- Provider name
- model
- local configuration status
- active marker, or `Use for ASR` / `Use for Rewrite`
- updated date
- `Edit`
- `Delete`

Endpoint information is shown as short secondary text only when the
configuration uses Qwen Local or Qwen API. Stored API keys are never displayed.

The separate Preview action is removed because all permitted non-sensitive
summary information is available directly in the row. The full endpoint remains
available in Edit. The creation timestamp remains stored but is not displayed.

The existing configuration array order is retained. Pagination does not add a
new sort or filtering system.

## Pagination

- Page size is exactly five configurations.
- Pagination is hidden when five or fewer configurations exist.
- `Previous`, current page, total pages, and `Next` are shown when needed.
- Adding or deleting a configuration clamps the current page to a valid page.
- The list itself does not scroll vertically.

## Add And Edit Dialog

Add and Edit continue to use one native dialog.

Add fields:

1. Type: ASR or Rewrite
2. Configuration name
3. Provider
4. Model
5. Base URL for Qwen Local or Qwen API only
6. API Key for Providers that support credentials

Changing Type resets Provider and Model to the first supported option for that
type. Changing Provider resets Model and Base URL to that Provider's defaults.

Edit uses the same dialog, but Type and Provider are fixed. The user may change
the name, model, endpoint, or key. Leaving the key blank preserves the stored
key. Existing key removal remains available with confirmation.

Saving a new configuration does not activate it. The row's explicit `Use`
action remains the only activation path.

## Existing Rules Preserved

- Exactly one ASR and one Rewrite configuration remain active.
- An incomplete configuration may be activated; readiness blocks dictation.
- Active configurations cannot be deleted.
- Delete removes the configuration-scoped credential first.
- Credentials stay in the OS credential store and remain excluded from import
  and export.
- Status is local configuration completeness, not a network health claim.
- Failed save, activation, key removal, or delete keeps the previous usable UI
  state and displays the existing error feedback.

## Responsive And Accessibility

At narrower widths, a row may wrap into two lines while remaining one semantic
configuration item. Name, type, model, status, and actions remain visible.

The native dialog retains labeled controls and focus return. Pagination,
activation, Edit, and Delete remain keyboard accessible. Status and type are
communicated with text, not color alone.

## Scope Boundary

This refinement does not add:

- Provider grouping
- ASR/Rewrite tabs or filters
- search or sorting
- bulk actions
- connectivity checks
- automatic retry, priority, or cross-Provider fallback
- Provider history or versioning
- changes to Settings or Profiles

## Acceptance Criteria

- The active pipeline summary remains at the top and behaves as before.
- ASR and Rewrite configurations appear together in one list.
- Every row carries an ASR or Rewrite label and stays compact.
- No more than five configuration rows are visible at once.
- More than five configurations use pagination rather than an internal scroll.
- Add opens the simplified dialog and supports Type, Provider, Model, key, and
  conditional endpoint entry.
- Edit keeps Type and Provider fixed and preserves a blank key.
- Preview and Provider-group UI are removed.
- Activation, readiness, credential, import/export, and delete safety behavior
  remain unchanged.

## Verification

- Component tests cover the mixed list, type labels, five-row page size,
  pagination, page clamping, Add dialog, fixed Edit fields, activation, and
  active-delete protection.
- Existing App and Provider-domain tests remain green.
- Browser QA checks the normal list, more-than-five pagination, Add/Edit dialog,
  active and incomplete rows, and narrow-window wrapping without page overflow.
