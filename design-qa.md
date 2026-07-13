# General Dashboard Design QA

## Evidence

- Source visual truth path: `C:\Users\PC\.codex\attachments\45db25c9-ac69-491b-9e53-ffc8bc278272\image-1.png`.
- Implementation screenshot path: `artifacts/current-general-root-default-v6.png`.
- Full-view comparison evidence: `artifacts/general-design-qa-current-comparison.png`.
- Viewport: implementation capture `1265x712`; source visual `1486x1102`.
- State: General page, ASR Not Set, Rewrite Not Set, Active Profile Normal, usage totals at zero.
- Focused region comparison evidence: not used; the full-view comparison is readable enough for the current P1/P2 findings.
- Primary interactions tested: status cards remain buttons for Providers/Profile navigation through existing tests.
- Console errors checked: no browser console errors on `http://127.0.0.1:5175/`.

## Findings

- [P1] Default capture does not match the source viewport proportions
  Location: full app frame.
  Evidence: the source is a tall `1486x1102` desktop frame with the full General dashboard visible; the available in-app browser capture is `1265x712`, so the chart pushes the bottom ASR/Rewrite/Profile cards below the fold.
  Impact: the implementation cannot be honestly marked as visually matching the supplied source in the verified viewport.
  Fix: verify in a browser surface that can capture the source viewport, then tune the vertical rhythm against that exact frame.

- [P2] Metric-card density is tighter than the source
  Location: `.general-metrics`.
  Evidence: the source has four wider cards with labels and values on one clean line rhythm; the implementation keeps four cards at the default desktop width, but some labels still wrap.
  Impact: the page reads busier and less like the reference.
  Fix: keep the responsive four-card row for wide frames, but at the verified source width tune sidebar width, workspace padding, icon size, and metric typography from the screenshot.

- [P2] Sidebar/status scale is close but not exact
  Location: `.sidebar`, `.sidebar-status`, nav items.
  Evidence: the implementation has the window dots, brand, active General item, and bottom status card; spacing and text scale are still slightly heavier than the reference.
  Impact: the app is directionally aligned but not yet a faithful clone.
  Fix: adjust nav gap, sidebar status card size, and brand typography after same-viewport capture.

## Open Questions

- The in-app Browser viewport override did not produce a true `1486x1102` capture; current QA is blocked on same-viewport evidence rather than lack of source image.

## Implementation Checklist

- Capture the implementation at the same `1486x1102` viewport as the source.
- Tune General vertical rhythm so hero, metrics, chart, and three status cards fit like the reference.
- Rebuild the comparison image and rerun QA.
- Only mark `final result: passed` when no P0/P1/P2 findings remain.

## Comparison History

- Current iteration: added the rounded app frame, macOS-style window dots, larger translucent sidebar, active General accent, bottom local status card, Ready hero, four metric cards, 7-day activity chart, and reference-like setup cards with chevrons.
- Previous iteration: General used a narrower 2x2 metric block and three thick-bordered status cards without the source hero or chart.

## Required Fidelity Surfaces

- Fonts and typography: uses the existing Inter/system stack and larger dashboard hierarchy; still needs exact size tuning against same-viewport evidence.
- Spacing and layout rhythm: major reference sections now exist, but same-viewport spacing is not verified.
- Colors and visual tokens: palette is close to the source light blue/white minimal style; semantic status colors remain restrained.
- Image quality and asset fidelity: supplied favicon is used for the brand mark; icons use the existing installed Lucide set. The decorative hero wave is CSS background treatment, not a separate source asset.
- Copy and content: source copy and requested General content are present: title, shortcut, readiness, usage totals, activity, ASR, Rewrite, and Active Profile.

final result: blocked
