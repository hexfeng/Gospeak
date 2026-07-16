# Providers Reference Clone Design

## Goal

Recreate the supplied `1390x1132` Providers reference in the existing Gospeak app while preserving all Provider data, pagination, activation, credential, dialog, focus, and error behavior.

## Scope

- Change only the Providers presentation and Provider-specific assets.
- Preserve the shared application sidebar, navigation order, and all other pages.
- Preserve the current five-configurations-per-page rule and mixed ASR/Rewrite list.
- Preserve responsive behavior below the desktop reference width; the desktop reference is the fidelity source, not a fixed-size mobile layout.
- Add no runtime dependency and make no backend, persistence, retry, priority, fallback, or release changes.

## Selected Approach

Use the current React markup and callbacks, adding only the Provider-specific wrappers and classes needed by the reference. Use local static SVG assets from the existing Lobe Icons brand-icon collection for Groq and OpenAI, plus the installed Lucide icons for navigation, arrow, add, edit, and delete.

This is preferred over:

1. Rebuilding the shared app shell, which would change unrelated pages.
2. Using the reference screenshot as a background, which would make the UI non-interactive and inaccessible.
3. Adding a new component library, which is unnecessary for one screen.

## Desktop Geometry

At the reference viewport `1390x1132`:

- Sidebar remains approximately `312px` wide.
- Providers workspace starts at `x=312` and uses approximately `45px` left padding and `36px` right padding.
- Page title begins around `x=357`, `y=58`; title is `36px`, weight `700`, line height approximately `1`.
- Description begins around `y=115`; it is `16px` with muted blue-gray text.
- Pipeline card begins around `x=357`, `y=173`, is approximately `997x158`, and has a `16px` radius.
- Pipeline is split into two columns by a vertical divider. The arrow sits in a `48px` circular control approximately `48px` to the right of the divider, matching the supplied composition.
- Configuration card begins around `x=357`, `y=372`, is approximately `997px` wide, and has a `16px` radius.
- Configuration header uses approximately `26px` padding and a divider below it.
- Add configuration is approximately `198x52`, dark navy, `11px` radius.
- Each row is approximately `110px` high, with a `54px` provider icon tile, compact type tag, model, availability, updated date, active state, and bordered Edit/Delete actions.

## Components

### Providers page

- Keep `PageHeader`, but add a Providers-specific class to match the reference spacing and typography without changing Dictionary or Settings.
- Keep the pipeline region semantic and clickable.
- Add a dedicated circular arrow wrapper so the arrow can sit on the vertical split.
- Keep the configurations region and dialog behavior unchanged.

### Provider identity

- Add a provider icon tile before the configuration name.
- Use a two-line identity block: name/type on the first line and Provider label on the second.
- Show endpoint information only where the existing logic already permits it.

### Actions

- Keep native buttons and accessible names.
- Add Lucide `Pencil` and `Trash2` icons to Edit/Delete.
- Active configurations keep Delete disabled.
- Non-active configurations keep the existing `Use for ASR/Rewrite` action; at desktop it occupies the same state/action column without changing behavior.

## Responsive Behavior

- At widths above `1100px`, match the reference single-row configuration layout.
- Between `981px` and `1100px`, use the existing compact two-line grid to avoid clipping.
- At `980px` and below, stack the pipeline and row information.
- At all checked widths, the page must have no horizontal document overflow and primary actions must remain visible.

## Assets

- `src/assets/providers/groq.svg`: Lobe Icons Groq mark, colored to match the supplied purple reference.
- `src/assets/providers/openai.svg`: Lobe Icons OpenAI mark in black.
- Icons are local files; the app has no runtime CDN dependency.

## Testing

- Extend `ProvidersPage.test.tsx` to require provider icons and Edit/Delete icons while retaining all behavior tests.
- Extend `App.css.test.ts` with Provider-reference layout contracts for the split pipeline, icon tile, row height, and action sizing.
- Run the focused tests red before implementation and green after.
- Run all frontend tests, lint, build, and `git diff --check`.
- Capture the current implementation at `1390x1132`, compare it beside the source, fix P0-P2 differences, and record the final pass in `design-qa.md`.

## Acceptance Criteria

- The Providers desktop screenshot matches the supplied composition, spacing, hierarchy, surfaces, icon tiles, row structure, and action styling.
- Existing Provider interactions and accessibility behavior remain intact.
- No horizontal overflow at `1390`, `900`, or `390` pixels.
- Browser console has no relevant errors or warnings.
- `design-qa.md` ends with `final result: passed`.
