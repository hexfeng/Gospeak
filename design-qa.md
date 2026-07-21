# General Dashboard Design QA

## Evidence

- Source visual truth path: `C:\Users\PC\.codex\codex-remote-attachments\019f6c1b-25fb-7be3-8cd9-635f6373b814\70AFE77B-EA93-43D3-8FE9-CB5A39CECFC8\1-Photo-1.jpg`.
- Implementation screenshot path: `C:\Users\PC\.codex\visualizations\2026\07\16\019f6c1b-25fb-7be3-8cd9-635f6373b814\gospeak-general-final-desktop-1280x1024.png`.
- Full-view comparison evidence: `C:\Users\PC\.codex\visualizations\2026\07\16\019f6c1b-25fb-7be3-8cd9-635f6373b814\gospeak-general-final-comparison.png`.
- Responsive evidence:
  - `C:\Users\PC\.codex\visualizations\2026\07\16\019f6c1b-25fb-7be3-8cd9-635f6373b814\gospeak-general-final-2x2-1050x1100.png`.
  - `C:\Users\PC\.codex\visualizations\2026\07\16\019f6c1b-25fb-7be3-8cd9-635f6373b814\gospeak-general-final-mobile-500x1200.png`.
- Default-window scroll evidence: `C:\Users\PC\.codex\visualizations\2026\07\16\019f6c1b-25fb-7be3-8cd9-635f6373b814\gospeak-general-default-window-bottom-1180x760.png`.
- Hover evidence: `C:\Users\PC\.codex\visualizations\2026\07\16\019f6c1b-25fb-7be3-8cd9-635f6373b814\gospeak-general-final-hover-1280x1024.png`.
- Desktop viewport: `1280x1024`, device scale factor `1`.
- State: General page, ASR Not Set, Rewrite Not Set, Active Profile Normal, usage totals at zero.
- Focused region comparison evidence: not needed because the native-size `2560x1024` side-by-side image keeps the typography, icon tiles, dividers, and card anatomy readable.
- Primary interactions tested:
  - ASR and Rewrite cards navigate to Providers.
  - Active Profile navigates to Profiles.
  - ASR hover changes transform from `none` to `translateY(-2px)`, changes the state background, and increases shadow elevation.
  - Keyboard focus renders a `3px` blue outline with a `2px` offset.
- Responsive measurements:
  - `1280px`: four metric columns.
  - `1050px`: two-by-two metric grid.
  - `500px`: one metric column.
  - Root `scrollWidth === clientWidth` at all three widths.
  - Tauri default `1180x760`: General has `46px` of vertical scroll; after scrolling, the final card is fully visible with its bottom at `760px`.
- Console errors checked: no browser warnings, console errors, or page errors.

## Findings

- No actionable P0/P1/P2 findings.

## Open Questions

- None.

## Follow-up Polish

- P3: system font rasterization and Lucide glyph details are slightly sharper than the photographed reference. The hierarchy, size, placement, and stroke character remain equivalent.

## Comparison History

- First pass findings:
  - P2: General content started about `9px` too high.
  - P2: vertical section gaps were about `4px` smaller than the reference.
  - P2: the readiness half started about `20px` too far right.
  - P2: the global `.app-shell button` rule overrode the intended configuration-card minimum height.
- Fixes:
  - Set General workspace top padding to `38px`.
  - Set the page gap to a maximum of `27px`.
  - Rebalanced the readiness-card grid to `0.94fr / 1fr`.
  - Fixed the card-height root cause with the more specific `.app-shell .general-status-card` selector.
  - Restored General's vertical scroll path with `overflow-y: auto` while retaining `overflow-x: hidden`, preventing default-window clipping.
- Final desktop geometry:
  - readiness card: `top 38px`, `height 225.27px`;
  - metrics: `top 290.27px`, `height 119.75px`;
  - activity panel: `top 437.02px`, `height 307.19px`;
  - status cards: `top 771.20px`, `height 187.39px`.
- The supplied reference lands at approximately `38px`, `291px`, `436px`, and `773px` for the same four bands.

## Required Fidelity Surfaces

- Fonts and typography: title, shortcut, status headings, metric values, chart labels, and supporting copy match the reference hierarchy and wrapping.
- Spacing and layout rhythm: the four major desktop bands align within about `0-2px` of the source; widths, dividers, card radii, and internal spacing are consistent.
- Colors and visual tokens: true white workspace, subtle blue-gray borders, near-black text, muted supporting text, neutral icon tiles, and green status treatment match the source.
- Image quality and asset fidelity: the existing Gospeak favicon is preserved and the installed Lucide icon family supplies all standard UI icons without placeholders or CSS-drawn substitutes.
- Copy and content: the reference copy and existing dynamic values remain present with no invented UI or changed behavior.

final result: passed

---

# Providers Reference Clone Design QA

## Evidence

- Source visual truth: `C:\Users\PC\.codex\attachments\ab8d57f5-48c6-4f20-9317-b0f16d73842f\image-1.png`.
- Final implementation capture: `C:\Users\PC\AppData\Local\Temp\gospeak-providers-reference-qa\providers-1390x1132-final.png`.
- Same-size side-by-side comparison: `C:\Users\PC\AppData\Local\Temp\gospeak-providers-reference-qa\comparison-final.png`.
- Desktop viewport: `1390x1132`, device scale factor `1`.
- Responsive captures: `900x1000` and `390x844`.
- Horizontal-overflow measurements: root `scrollWidth === clientWidth` at `1390`, `900`, and `390` pixels.
- Interaction checks: Add and Edit dialogs opened and closed at all three widths; focus returned to the triggering button after Cancel.
- Console checks: no browser warnings, console errors, or page errors in the final three-viewport pass.

## Findings and Resolution

- P1 visual regression: the shared button background initially rendered each pipeline half as a large gray pill. Provider pipeline buttons now explicitly use a transparent background and square inner edges, restoring the white split-card treatment from the reference.
- P2 shell density: the computed desktop navigation height was `40px` despite the earlier nominal `56px` rule. The Providers shell now scopes the reference's `50px` navigation rows, brand spacing, and bottom status-card height without altering other pages.
- No remaining actionable P0/P1/P2 findings.

## Required Fidelity Surfaces

- Geometry: desktop measurements match the reference bands: `312px` sidebar, workspace at `x=312`, `45px` left content inset, `997x158` pipeline card, and `997x326` configuration card.
- Typography and hierarchy: the `36px` page title, `16px` description, section title, labels, status pills, row metadata, and action labels follow the supplied hierarchy.
- Components and assets: the split pipeline, offset circular arrow, `54px` provider tiles, ASR/Rewrite tags, local provider marks, and bordered Edit/Delete controls are present.
- Responsive behavior: the pipeline and configuration rows stack at tablet/mobile widths with no horizontal clipping; the root remains vertically scrollable where content exceeds the viewport.
- Accessibility and behavior: native buttons, dialogs, disabled active Delete actions, pagination, activation callbacks, accessible names, and focus restoration remain intact.

## Follow-up Polish

- P3: the local Groq brand glyph is the closest available real icon and differs slightly from the angular illustrative mark in the supplied screenshot; its slot, size, and purple treatment match.

final result: passed

---

# Shared UI Language Design QA

## Evidence

- Source Providers screenshot: `C:\Users\PC\AppData\Local\Temp\codex-clipboard-addf44c4-5b9a-401f-af15-bd4bcbeb387b.png`.
- General reference capture: `C:\Users\PC\AppData\Local\Temp\gospeak-shared-ui-qa\general-1123x965-final.png`.
- Final Providers capture: `C:\Users\PC\AppData\Local\Temp\gospeak-shared-ui-qa\providers-1123x965-final2.png`.
- Side-by-side comparison: `C:\Users\PC\AppData\Local\Temp\gospeak-shared-ui-qa\comparison.png`.
- Responsive captures: Providers, Dictionary, and Settings at approximately `1280x900`, `900x900`, and `390x844`.
- Responsive measurements: every checked page reported `scrollWidth === clientWidth` at 1280, 900, and 390 pixels.
- Interactions checked: Provider Add dialog and Cancel, Dictionary search and Add dialog, and navigation across all three pages.
- Console checked: no warning or error entries during the final responsive pass.

## Findings and Resolution

- P2 responsiveness: at the supplied screenshot width (`1123x965`), the Provider grid initially switched to a two-line medium layout and its intrinsic column minimums pushed the Add button outside the card. The medium breakpoint now ends at 1100px, the two flexible columns use `minmax(0, ...)`, and the compact row gap is 10px. Final measurement places the Add button at `1063.7px` inside the card edge at `1080.5px`, with no page overflow.
- No remaining actionable P0/P1/P2 findings.

## Required Fidelity Surfaces

- Typography: Providers, Dictionary, and Settings use General's title scale, 14px descriptions, 17px section headings, and 12px helper/status text.
- Layout and surfaces: shared 16px cards, restrained borders/shadows, 40px controls, and compact Provider rows follow the General page language.
- Responsiveness: desktop rows stay single-line where space permits; tablet/mobile layouts stack without overlapping, clipping, or horizontal page scrolling.
- States and accessibility: native buttons, regions, labels, disabled states, dialogs, focus behavior, search, filters, and toggles remain intact.
- Assets and icons: existing Gospeak brand asset and Lucide icon family are retained; no substitute artwork was introduced.

final result: passed

---

# Profiles Design QA

## Source

- Reference: `C:/Users/PC/Downloads/ChatGPT Image Jul 20, 2026, 09_13_38 PM.png`
- Reference size: `1402x1122`; the top `38px` native title bar was excluded from the normalized content comparison.
- Implementation: `http://127.0.0.1:4173/`, Profiles page, Normal active and selected.
- Browser: local Playwright Chromium `1.61.0`, explicitly authorized after the in-app Browser and Chrome viewport fallback were blocked.

## Browser Evidence

- Exact source-content viewport: `1402x1084`, device pixel ratio `1`; both document and `#root` report `scrollWidth/clientWidth = 1402/1402`.
- Exact medium viewport: `900x1122`, device pixel ratio `1`; document and `#root` report `900/900`. `#root` scrolls from `0` to `329`, placing the final rule at `bottom=1077.6px` inside the `1122px` viewport.
- Exact narrow viewport: `390x844`, device pixel ratio `1`; document and `#root` report `390/390`. `#root` scrolls from `0` to `1994`, placing the final rule at `bottom=799.6px` inside the `844px` viewport.
- Desktop implementation: `.superpowers/sdd/qa-artifacts/profiles-desktop-content-1402x1084.png`
- Medium top/bottom: `.superpowers/sdd/qa-artifacts/profiles-medium-900x1122.png`, `.superpowers/sdd/qa-artifacts/profiles-medium-900-bottom.png`
- Narrow top/rules/bottom: `.superpowers/sdd/qa-artifacts/profiles-mobile-390x844.png`, `.superpowers/sdd/qa-artifacts/profiles-mobile-rules-390x844.png`, `.superpowers/sdd/qa-artifacts/profiles-mobile-390-bottom.png`
- Mobile Profile dialog: `.superpowers/sdd/qa-artifacts/profile-dialog-email-mobile-390x844.png`; `scrollWidth/clientWidth = 352/352`, with bounds `x=19..371`.
- Normalized reference: `.superpowers/sdd/qa-artifacts/reference-content-1402x1084.png`
- Full-view comparison: `.superpowers/sdd/qa-artifacts/comparison-desktop-exact.png`
- Focused Profiles comparison: `.superpowers/sdd/qa-artifacts/comparison-profiles-focus-exact.png`
- Focused App Rules comparison: `.superpowers/sdd/qa-artifacts/comparison-app-rules-focus-exact.png`
- Profile dialog before fix: `.superpowers/sdd/qa-artifacts/profile-dialog-email.png`
- Profile dialog after fix: `.superpowers/sdd/qa-artifacts/profile-dialog-email-pass2.png`
- Structured Playwright evidence: `.superpowers/sdd/qa-artifacts/profiles-playwright-results.json`

## Interaction Checks

- Profile filtering: `EMAIL` showed only Email and clearing restored all four Profiles.
- Dirty Cancel and native Escape: each displayed one discard confirmation, closed after acceptance, and returned focus to the Email card.
- Profile lifecycle: New Profile, Save, edit and Save, Set Active, Duplicate, delete the copy, restore Normal active, and delete the temporary original all passed in the live browser.
- App Rule lifecycle: five rules were created through the UI; Outlook was edited, Code was toggled on and back off, `OUTLOOK` filtering was cleared, and a temporary rule was deleted, leaving the source-representative four rows.
- Rule-dialog Cancel returned focus to Add Rule. The 390px Profile dialog also closed cleanly and returned focus to Email.
- Console warnings: `0`; console errors: `0`; page errors: `0`.

## Visual Comparison

- Fonts and typography: both use the Gospeak system/Inter stack with matching strong page and section hierarchy. The implementation keeps inline Profile metadata instead of the reference's status pills; this is an accepted product-data treatment, not a readability defect.
- Spacing and layout: exact desktop comparison preserves the page-header, four-card, selected-summary, and App Rules hierarchy. The existing shared Gospeak sidebar is narrower than the reference, while scoped Profile search and current-app preview intentionally add vertical content. At 900px the cards form two columns; at 390px they stack without overlap or root horizontal overflow.
- Colors and tokens: selected blue, neutral borders, white surfaces, green enabled switches, focus styling, and destructive red align with the source direction.
- Image quality and assets: the real Gospeak brand asset is used. Application-specific brand icons and drag-reorder decoration remain intentionally omitted by scope; Lucide supplies the edit/delete/control icons.
- Copy and content: all app-specific labels are coherent. Profile search and current-app preview are retained product features even though the reference omits them.
- Accessibility and responsiveness: native dialogs, keyboard Escape, confirmations, focus restoration, 40px controls, mobile field labels, and vertical scrolling were exercised. Screenshot review does not claim full WCAG compliance.
- P0: none.
- P1: none.
- P2: none remaining.
- P3: application-specific brand icons, drag reorder, reference status pills, and the reference footer count remain out of scope.

## Comparison History

1. Chrome pass: the Email Profile dialog clipped Cancel behind a horizontal scrollbar (P2). A Profiles-only `720px` width and wrapping action row fixed it; `.superpowers/sdd/qa-artifacts/profile-dialog-email-pass2.png` confirms all actions are visible.
2. Exact Playwright pass: the source-representative four-row state was created through the UI and compared at the true `1402x1084` content viewport. Desktop and 900px showed no actionable P0-P2.
3. Narrow pass: at `390x844`, converting the table to stacked cells hid the table header without adding visible field labels (P2). Each cell now exposes a `data-label`, and the mobile CSS renders it before the value.
4. Post-fix pass: `.superpowers/sdd/qa-artifacts/profiles-mobile-rules-390x844.png` and `.superpowers/sdd/qa-artifacts/profiles-mobile-390-bottom.png` show App, Window title, Priority, Enabled, and Actions labels with all four rows reachable. The exact full and focused comparisons show no remaining actionable P0-P2.

## Five-Point Adversarial Review

1. Discarding a new Profile restores the active persisted Profile; the focused regression passes.
2. Save and Duplicate clear the dialog dirtiness by replacing the draft with the persisted result; the live sequence and component tests pass.
3. Normal remains undeletable by id even if its editable mode changes; the regression passes.
4. App Rule edits preserve the rule id and selected Profile ownership; focused tests and the live edit pass.
5. Dirty Cancel/Escape each produce one confirmation and restore focus; no double-close or stale-dialog behavior was observed.

final result: passed
