# General Dashboard Design QA

## Evidence

- Source visual truth: `C:\Users\PC\AppData\Local\Temp\codex-clipboard-caa71441-1dee-4dcc-852d-2c3a23b55084.png`.
- Implementation capture: `artifacts/gospeak-home.png`.
- Full-view comparison: `C:\Users\PC\AppData\Local\Temp\gospeak-general-design-comparison.png`, reviewed at normalized 720px height.
- Focused region comparison: not needed; the header, metric surface, and setup cards are readable in the full-view comparison.

## Viewport And Interaction Checks

- `1280x720`, browser-preview ready/missing setup state: ASR and Active Profile render ready borders; Rewrite renders a muted red missing border. No horizontal overflow and no console errors.
- `900x720`: metrics render in two columns with no horizontal overflow.
- `390x844`: metrics render in one column, setup cards remain single-column, and no horizontal overflow occurs.
- ASR and Rewrite navigate to Settings with the Providers tab selected. Active Profile navigates to Profiles.
- Focus: the in-app Browser confirmed the visible button focus outline. Hover transform and reduced-motion rules are covered by `src/App.css.test.ts`; the Browser pointer-move API did not expose `:hover` state.

## Comparison History

**Findings**
- [P0] Stale preview server omitted the new General dashboard styles.
  Evidence: the initial `127.0.0.1:5174` capture showed unstyled metrics and status buttons.
  Fix: replaced the stale Vite preview process with the worktree Vite dev server, then re-captured the ready/missing state.
  Post-fix evidence: `artifacts/gospeak-home.png` shows the four-part metric surface, semantic setup borders, and three dashboard cards.

**Resolved Differences**
- P1: none.
- P2: none.
- The SayIt visual's content, icons, and two-by-two metric card arrangement are intentionally adapted to the approved Gospeak sidebar, tokens, four-metric separator surface, and no-custom-SVG constraint.

**Required Fidelity Surfaces**
- Typography: existing Inter/system Gospeak stack, compact hierarchy, and wrapping remain intact.
- Spacing and layout rhythm: 28px page/header spacing, 12px status gaps, and responsive grid tracks are stable.
- Colors and tokens: existing neutral Gospeak tokens are retained; green and muted red borders communicate setup state.
- Image quality and assets: existing Gospeak brand asset is unchanged; no replacement imagery or generated asset is introduced.
- Copy and content: existing Gospeak dashboard labels and navigation remain intact.

**Follow-up Polish**
- P3: none.

final result: passed
