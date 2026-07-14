# General Dashboard Design QA

## Evidence

- Source visual truth path: `C:\Users\PC\.codex\attachments\45db25c9-ac69-491b-9e53-ffc8bc278272\image-1.png`.
- Implementation screenshot path: `artifacts/current-general-playwright-1486.png`.
- Full-view comparison evidence: `artifacts/general-design-qa-current-comparison.png`.
- Viewport: `1486x1102`, device scale factor `1`.
- State: General page, ASR Not Set, Rewrite Not Set, Active Profile Normal, usage totals at zero.
- Focused region comparison evidence: not needed; the full-view comparison is readable for header, sidebar, hero, metrics, chart, and status-card fidelity.
- Primary interactions tested: status cards remain routed buttons through existing tests; navigation remains General, Profiles, Dictionary, Settings.
- Console errors checked: no page errors or console errors during Playwright capture of `http://127.0.0.1:5175/`.

## Findings

- No actionable P0/P1/P2 findings.

## Open Questions

- None.

## Follow-up Polish

- P3: chart line shape and date labels differ from the reference because the implementation uses real local usage data. Current local state has zero usage events, so the flat 0m line is expected.

## Comparison History

- Current iteration: captured the implementation at the same `1486x1102` viewport as the source and tuned vertical rhythm so the title, shortcut, hero, metrics, activity chart, and three setup cards land in the same visual bands as the reference.
- Previous iteration: added the rounded app frame, macOS-style window dots, larger translucent sidebar, active General accent, bottom local status card, Ready hero, four metric cards, 7-day activity chart, and reference-like setup cards with chevrons.
- Earlier iteration: General used a narrower 2x2 metric block and three thick-bordered status cards without the source hero or chart.

## Required Fidelity Surfaces

- Fonts and typography: existing Inter/system stack, bold Gospeak title, medium nav labels, compact card titles, and smaller supporting copy match the reference hierarchy closely.
- Spacing and layout rhythm: same-viewport capture confirms the app frame, sidebar, title block, hero, metrics, chart, and bottom cards align with the source composition.
- Colors and visual tokens: light blue/white app frame, soft sidebar, blue active nav, pastel icon tiles, subtle borders, and restrained shadows match the reference style.
- Image quality and asset fidelity: supplied favicon is used for the brand mark; standard UI icons use the existing Lucide set. No missing raster content remains from the source.
- Copy and content: source copy and requested General content are present: title, shortcut, readiness, usage totals, activity, ASR, Rewrite, and Active Profile.

final result: passed
