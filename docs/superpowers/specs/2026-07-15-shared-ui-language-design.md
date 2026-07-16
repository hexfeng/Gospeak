# Shared UI Language Design

## Goal

Align Providers, Dictionary, and Settings with the existing General page visual language while preserving each page's information architecture, behavior, and data flow.

## Scope

In scope:

- Fix Providers row typography and wrapping shown in the supplied screenshot.
- Introduce three small shared presentation components: `PageHeader`, `Card`, and `Button`.
- Apply the shared components and General-aligned visual rules to Providers, Dictionary, and Settings.
- Verify the three pages at desktop, medium, and narrow widths.

Out of scope:

- General or Profiles redesign.
- Navigation or Settings information architecture changes.
- Provider models, persistence, retry, priority, fallback, or release work.
- A complete design system, theme engine, or new dependency.

## Design Principle

General is the source of truth. Reuse its typography, surface, spacing, control height, colors, focus treatment, and restrained shadows. The shared components replace repeated presentation markup only; business state remains in the page components.

## Shared Components

### PageHeader

`PageHeader` renders a page title, description, and optional action slot. It uses the same heading scale as General: a responsive 30–36px title, 14px description, and compact vertical rhythm.

### Card

`Card` renders a semantic `section` with a white surface, 1px light border, 16px radius, subtle shadow, and consistent padding. It accepts native section attributes so existing ARIA relationships remain intact.

### Button

`Button` renders a native `button` and forwards native button attributes and refs. It supports only three variants:

- `primary`: dark fill for the main page or form action.
- `secondary`: quiet neutral fill for ordinary actions.
- `danger`: restrained red treatment for destructive actions.

All variants use a 40px minimum height, consistent horizontal padding, visible focus, and no text wrapping. Disabled behavior remains native.

## Page Layouts

### Providers

- Keep the current page header, pipeline summary, mixed configuration list, five-row pagination, and Add/Edit dialog.
- Render the pipeline summary and configuration list with the shared `Card`.
- Render Add and Save as primary; Use, Edit, Cancel, pagination, and Remove key as secondary; Delete as danger.
- Replace the configuration row's free-form flex sizing with a stable grid for identity, model, status, updated date, and actions.
- The action column stays single-line at desktop widths. At narrower widths, row regions wrap as groups rather than wrapping individual button labels.
- Preserve active deletion protection, focus return, status text, and key non-disclosure.

### Dictionary

- Keep the current search, type/tag/status filters, table, pagination, and Add/Edit dialog.
- Use the shared `PageHeader`, `Card`, and `Button` for the header action, toolbar/list surface, pagination, and dialog actions.
- Keep table semantics and existing row-menu behavior.
- Align headings, helper text, controls, empty states, and focus styles with General.

### Settings

- Keep the current tabs and section contents unchanged.
- Use the shared `PageHeader`, `Card`, and `Button` for the page header, tab/content surfaces, export/import actions, and form actions.
- Keep labels at 12px, field values at 14px, controls at 40px, and section headings aligned with the other pages.

## Responsive Behavior

- Desktop: Providers uses five stable row regions and a right-aligned action group.
- Medium width: provider metadata may compress or truncate safely; actions remain readable and unbroken.
- Narrow width (390px target): Cards fill the available width, Providers regions stack, action groups wrap by button, Dictionary controls stack, and Settings tabs remain usable without horizontal page overflow.
- No page introduces an internal vertical scrollbar for its main list.

## Accessibility

- Shared components forward native attributes and refs.
- Existing ARIA labels, `aria-labelledby`, dialog focus return, disabled states, and keyboard behavior remain intact.
- Buttons retain visible focus and never encode state by color alone.
- The responsive layout must not change DOM reading order.

## Error Handling And Data Flow

No business logic changes. Page callbacks, async error messages, Provider validation, persistence, filters, pagination, and dialogs continue to run in their current page components. Shared components do not store application state or catch application errors.

## Verification

- Add focused tests for shared component variants, native prop forwarding, and ref forwarding.
- Keep existing Providers, Dictionary, Settings, and App behavior tests passing.
- Run `npm test -- --run`, `npm run lint`, and `npm run build`.
- Run rendered design QA against General and the supplied Providers screenshot at approximately 1280px, 900px, and 390px; inspect typography, alignment, button wrapping, focus, and console output.
- Run `git diff --check` and a final scoped code review before delivery.
