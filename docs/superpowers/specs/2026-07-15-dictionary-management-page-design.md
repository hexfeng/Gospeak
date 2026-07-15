# Dictionary Management Page Design

Date: 2026-07-15
Status: Approved in discussion

## Goal

Turn Dictionary into a searchable management table for roughly 100 to 1,000
global terms. Types and tags organize the page only. Every enabled term remains
globally available to the existing STT and Rewrite pipeline.

## Scope

This design changes Dictionary presentation and adds one persisted fixed type to
each term. It does not add profile-specific dictionaries, domain routing,
custom types, bulk actions, CSV import, Provider changes, or a second navigation
level.

## Page Structure

The page header contains:

- `Dictionary`
- total and enabled counts, such as `328 terms · 301 enabled`
- a labeled `Add term` button

Below the header, one toolbar contains:

- search across spoken phrase, written phrase, aliases, and tags
- type filter
- tag filter populated from existing terms
- status filter for all, enabled, or disabled terms
- `Clear filters` when any filter is active

Search and filtering run immediately against the terms already loaded in the
frontend. Changing a query or filter returns the table to its first page.

## Table

The desktop table columns are:

| Spoken phrase | Written phrase | Type | Tags | Status | Updated | Actions |
| --- | --- | --- | --- | --- | --- | --- |

- Aliases appear as secondary text under the spoken phrase.
- Type appears as one low-emphasis badge.
- At most two tags appear in the row; additional tags collapse into a
  keyboard-focusable `+N` indicator that exposes the complete tag list.
- Status is an inline switch. Disabled rows remain searchable and editable but
  use reduced visual emphasis.
- Updated shows a date only.
- Edit is directly available. Duplicate and Delete remain in the overflow menu.
- The default order is spoken phrase ascending so inline status changes do not
  move a row unexpectedly.

The table shows 50 terms per page. Pagination is hidden when the filtered result
contains 50 or fewer terms.

At narrow window widths, each row becomes a compact card. Spoken phrase, written
phrase, type, and status remain primary; aliases, tags, and the updated date wrap
or move to secondary lines.

## Add And Edit Dialog

Add and edit continue to share one native dialog with these fields:

1. Spoken phrase, required
2. Written phrase, required
3. Type, required and single-select
4. Aliases, multiple values
5. Tags, multiple values with existing-tag suggestions and free entry
6. Enabled, defaulted on for new terms

The fixed types are:

- Person (`person`)
- Organization (`organization`)
- Brand or product (`brand-product`)
- Technical term (`technical-term`)
- Acronym (`acronym`)
- Other (`other`)

Saving rejects a duplicate normalized spoken phrase without closing the dialog.
Duplicate copies the written phrase, type, aliases, tags, and enabled state, but
requires a new spoken phrase. Duplicate tags are normalized into one value.
Delete retains its confirmation step.

## States And Errors

- An empty dictionary explains the feature and offers `Add first term`.
- A filtered empty result shows the active query and offers `Clear filters`; it
  does not imply that the user should create a new term.
- A save failure keeps the dialog and its input intact for retry.
- A failed status change restores the previous switch state and reports the
  failure.
- Focus returns to the action that opened a dialog after it closes.
- Search, filters, switches, menus, pagination, and dialog fields retain visible
  labels and keyboard access.

## Data Contract

Dictionary terms gain one persisted `type` field with a fixed enum matching the
six types above. Existing records and older imported configuration without a
type migrate to `other`.

The type must round-trip through SQLite and configuration import/export. It is
available to frontend search and filtering but is not sent as a routing signal
and does not change which enabled terms enter STT or Rewrite prompts.

Tags remain free-form and global. They are organizational metadata only.

## Acceptance Criteria

- Users can search across spoken phrase, written phrase, aliases, and tags.
- Users can filter by one fixed type, an existing tag, and enabled state.
- The table presents the approved columns, density, stable spoken-phrase
  ordering, and 50-row paging.
- Add, edit, duplicate, enable, disable, and delete remain available.
- Type is required, persists locally, and round-trips through import/export.
- Existing and old imported terms default to `other`.
- All enabled dictionary terms remain global regardless of type or tags.
- Empty, filtered-empty, save-error, and toggle-error states follow this design.
- The page remains usable at the app's supported desktop and narrow widths.

## Verification

- Frontend tests cover search, combined filters, paging reset, row rendering,
  dialog validation, duplicate behavior, and error recovery.
- Rust storage tests cover the type migration and round-trip.
- Import/export tests cover old payload defaults and new payload preservation.
- Browser checks cover normal, empty, filtered-empty, disabled, error, and narrow
  layouts with keyboard-accessible controls.
