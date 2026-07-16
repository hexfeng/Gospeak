# Provider Configuration Single-Row Design

## Goal

Keep every Providers configuration on one row in desktop windows, including the
current 1280×1024 and default 1180×760 app sizes.

## Design

- Keep the existing five row regions: identity, model, status, updated date, and
  actions.
- Use one responsive CSS Grid row above 980px. Let the identity and model columns
  shrink, reduce gaps and button padding at narrower desktop widths, and truncate
  long identity/model text with an ellipsis.
- Remove the 981–1300px rule that moves the date and actions onto a second row.
- Preserve the existing stacked layout at 980px and below.
- Do not change Provider data, actions, accessibility labels, or interaction
  behavior.

## Verification

- A CSS contract test must fail before the fix and require a five-column desktop
  grid with no desktop row reassignment.
- Playwright must confirm each configuration row has one vertical band at
  1280×1024 and 1180×760, with no horizontal overflow or console errors.
- Update `artifacts/providers.png` and confirm README still references it.
