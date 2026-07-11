# General Dashboard Design QA

## Evidence

- Source visual truth: `C:\Users\PC\AppData\Local\Temp\codex-clipboard-19837cfc-a404-49f2-8bb8-785ab86ca1eb.png`.
- Implementation screenshot: `artifacts/gospeak-home-refined.png`.
- Full-view comparison: `artifacts/general-design-qa-comparison.png`.
- Viewport: `1154x770`.
- State: General page, ASR Not Set, Rewrite Not Set, Active Profile Normal.
- Focused region comparison: not needed; the header, 2x2 metric grid, and three setup cards are readable in the full-view comparison.

## Browser Checks

- Local URL: `http://127.0.0.1:5174/`.
- In-app browser DOM check: heading `Gospeak`, 4 `.general-metric` cards, 3 `.general-status-card` buttons.
- Playwright screenshot check: no horizontal overflow at `1154x770`.
- Primary interactions covered by tests: ASR and Rewrite status cards route to Providers, Active Profile routes to Profiles.
- Console errors: no runtime error surfaced during page load or DOM inspection.

## Comparison History

**Current Iteration**
- Changed the metric surface from one combined four-cell card to four separate cards in a fixed 2x2 desktop grid.
- Added existing `lucide-react` icons to each metric card and status card.
- Increased the three setup/status cards to `156px` minimum height, added bold main titles, descriptions, visible values, and a small top-right activity icon.
- Added explicit accessible labels to status-card buttons so ASR and Rewrite are uniquely targetable.

**Resolved Prior Findings**
- State borders remain accessible: ready `#3f7f5c`, missing `#a85c55`.
- Focus outline remains opaque `#2563eb` at `3px`.
- General page remains a flat transparent page surface, with cards only for actual repeated items.
- Status-card hover keeps the white surface, slight lift, and shadow.

## Required Fidelity Surfaces

- Typography: current Gospeak system font, compact hierarchy, bold status titles, and readable smaller descriptions match the requested minimal style.
- Spacing and layout rhythm: metric cards use the reference-like 2x2 rhythm; status cards are taller and evenly spaced.
- Colors and tokens: neutral white/gray card language matches the source direction while preserving Gospeak semantic green/red status borders.
- Image quality and assets: no raster assets were needed; icons use the already-installed icon library.
- Copy and content: General page content stays unchanged in meaning: total time, characters, usage mode, total cost, ASR, Rewrite, and Active Profile.

## Findings

- No actionable P0/P1/P2 findings.

## Follow-up Polish

- P3: none.

final result: passed
