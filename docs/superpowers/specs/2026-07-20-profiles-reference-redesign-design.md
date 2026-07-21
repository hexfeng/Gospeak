# Profiles Reference Redesign

## Goal

Rebuild the right side of the Profiles page around the supplied desktop
reference: Profiles are browsed as cards, Profile editing happens in a modal,
and App Rules are managed from a compact table with modal add/edit forms.
Preserve the existing Profile and App Rule persistence behavior.

## Scope

In scope:

- Replace the current split list/editor with a responsive Profile card grid.
- Open the existing Profile fields in a native modal for create and edit.
- Add a selected-Profile summary card.
- Replace the current App Rule form/list with a searchable table.
- Open App Rule create and edit forms in a native modal.
- Reuse the shared `PageHeader`, `Card`, and `Button` components and the dialog
  interaction pattern already used by Providers and Dictionary.
- Preserve Profile activation, duplication, deletion, dirty-state protection,
  App Rule toggling, and all existing persistence callbacks.

Out of scope:

- Backend, database, routing, import/export, or Provider changes.
- Drag-to-reorder App Rules because no reorder behavior exists today.
- Application brand icons because the repository has no canonical icon mapping
  for arbitrary executable names.
- A new generic dialog, table framework, or dependency.

## Page Layout

Use the existing Profiles page content area and shared visual language.

1. The page header contains the Profiles title, existing description, and a
   dark primary `New Profile` button.
2. A compact Profile search field remains available above the Profile cards so
   the redesign does not remove existing filtering behavior.
3. Profiles render as a responsive card grid. Each card shows the Profile name,
   mode, active/inactive state, enabled/disabled state, and live App Rule count.
   The selected Profile uses the existing blue accent, a stronger border, and a
   check icon. State is never communicated by color alone.
4. A selected-Profile summary card shows the Profile name and whether it is the
   active Profile.
5. An App Rules card contains its title, rule search, primary `Add Rule` action,
   semantic table, and empty state.

The App Rules table columns are App, Window title, Priority, Enabled, and
Actions. Enabled remains an inline native checkbox. Edit and delete use the
installed icon library with accessible labels.

## Profile Interaction

Clicking a Profile card selects that Profile for the App Rules section and
opens its edit dialog. `New Profile` opens the same dialog with the existing
default Profile draft. Closing a clean dialog simply returns focus to its
opener. Closing, cancelling, pressing Escape, selecting another Profile, or
navigating away while the draft is dirty uses the existing discard
confirmation.

The Profile dialog contains:

- Profile name, mode, target language, and Enabled.
- The existing Advanced disclosure with system prompt and user prompt template.
- Save as the primary action.
- Set Active, Duplicate, and Delete as secondary or destructive actions when
  valid for the selected Profile.
- Cancel as a non-destructive action.

Normal remains undeletable by id. Save keeps the existing trimming, validation,
timestamp, and callback behavior. Successful create or edit keeps the Profile
selected and closes the dialog.

## App Rule Interaction

The App Rule search filters the selected Profile's non-deleted rules by app id
or window-title pattern. `Add Rule` opens a blank rule dialog. The edit action
opens the same dialog with the existing rule id and values.

The rule dialog contains App id, title contains, priority, and enabled fields.
Save retains the existing trimming, id generation, timestamp, selected Profile
id, and callback behavior. A new unsaved Profile cannot add rules. Rule toggles
stay inline and call the existing save callback. Delete keeps the existing
confirmation and delete callback.

## Components And Data Flow

Keep state and behavior in `ProfilesPage`; do not add a general-purpose dialog
or table abstraction. Add small file-local `ProfileDialog` and `RuleDialog`
components, following Providers and Dictionary. Reuse the existing page props
without changing App-level persistence ownership.

The selected Profile id drives both the summary and visible App Rules. Dialog
drafts are derived from the selected record and report dirty state through the
existing `onDirtyChange` callback so App-level navigation protection continues
to work.

## Responsive And Accessibility Behavior

- Wide desktop: four Profile cards per row when space permits; App Rules use the
  reference table layout.
- Medium widths: cards wrap to two columns and table columns compress without
  wrapping action labels.
- Narrow widths: cards stack; App Rules become readable stacked rows without
  horizontal page overflow.
- Native dialogs provide modal semantics. Dialog titles are accessible, Escape
  respects dirty-state confirmation, focus returns to the opener, buttons keep
  visible focus, and icon-only actions have explicit labels.
- DOM reading order remains header, Profiles, selected summary, App Rules.

## Error Handling

No new async error layer is introduced because the current Profile and App Rule
callbacks are synchronous at this component boundary. Existing validation and
confirmation behavior remains. Required Profile and App Rule fields disable or
reject save consistently with the current page.

## Verification

- Write focused failing tests before implementation for Profile dialog opening,
  new Profile saving, rule dialog create/edit, dirty-dialog protection, inline
  rule toggling, and selected-Profile rule filtering.
- Update directly affected App integration tests to open the Profile dialog
  before editing.
- Run `npm test -- src/components/ProfilesPage.test.tsx src/App.test.tsx` during
  the red/green cycle.
- Run the complete frontend suite, lint, build, CSS contract tests, and
  `git diff --check`.
- Render the page at desktop, medium, and narrow widths. Compare the desktop
  result with the supplied reference image, exercise Profile and App Rule
  dialogs, inspect focus and Escape behavior, and check the browser console.
- Record the final visual comparison in `design-qa.md`; fix P0-P2 differences
  before handoff.
