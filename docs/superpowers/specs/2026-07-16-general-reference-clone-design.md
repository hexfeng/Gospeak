# General Reference Clone Design

## Goal

Restyle only the right-side General page to faithfully match the supplied
reference image. Keep the existing sidebar, application behavior, data sources,
navigation, and dictation flow unchanged.

## Scope

Change only the General page component, its General-specific styles, and the
directly affected tests. Do not redesign the sidebar or other pages.

## Layout

### Readiness card

- Place the `Gospeak` title and configured shortcut on the left.
- Add a vertical divider on desktop.
- Place the microphone icon, `Ready to dictate` copy, and system-status badge on
  the right.
- Use the reference image's white surface, subtle border, restrained shadow, and
  16px corner radius.
- Remove the existing decorative blue wave treatment.

### Usage metrics

- Place the four existing metrics inside one continuous bordered container.
- Use internal dividers instead of four independent floating cards.
- Preserve the existing values and labels.
- Responsive behavior:
  - four columns at wide desktop widths;
  - a two-by-two grid when the content area narrows;
  - one column at the narrowest supported width.
- Dynamic values must not cause horizontal overflow.

### Activity chart

- Preserve the current seven-day aggregation and SVG chart behavior.
- Match the reference image's taller chart area, whitespace, gridline treatment,
  and compact `7 Days` control.
- Do not add a new date-range interaction.

### Configuration cards

- Keep the existing ASR, Rewrite, and Active Profile values and navigation.
- Match the reference image's three equal bottom cards, icon/header row,
  description, divider, value, and right chevron.
- Preserve current hover, keyboard-focus, ready/not-ready, reduced-motion, and
  whole-card click behavior.
- Keep the subtle hover lift and state feedback; only the visual styling changes.
- Stack the cards when the content width cannot support three columns.

## Responsive Rules

The sidebar remains untouched. Only the General content adapts:

- desktop: reference-aligned two-column readiness card, four metrics, three
  configuration cards;
- medium: readiness content may tighten, metrics become two-by-two, and status
  cards collapse when needed;
- narrow: readiness content stacks, metrics become one column, and status cards
  become one column.

## Data And Behavior

Reuse the existing General data flow:

- `summarizeUsage` supplies duration, character count, and total cost;
- provider readiness supplies usage mode and model state;
- the configured hotkey supplies the shortcut;
- the active enabled Profile supplies the Profile value;
- existing callbacks navigate to Providers and Profiles.

No backend, persistence, model configuration, chart aggregation, or navigation
behavior changes are included.

## Verification

- Update component tests only where the new semantic structure requires it.
- Update CSS contract tests for the combined readiness and metric containers,
  responsive four/two/one metric layout, and preserved configuration-card
  interaction states.
- Run the focused General tests first, then the full frontend tests, lint, and
  production build.
- Render the General page at the reference desktop size and at a narrower size
  that proves the two-by-two metric layout.
- Compare the rendered desktop screenshot directly with the supplied reference.
- Check title/hotkey placement, readiness composition, metric grouping, chart
  sizing, bottom-card anatomy, sidebar boundary, hover/focus behavior, overflow,
  and console health.

## Non-Goals

- Sidebar redesign.
- New icons, dependencies, data fields, filters, charts, settings, or routes.
- Refactoring unrelated shared styles or other page components.
