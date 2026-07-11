# General Dashboard Design QA

## Evidence

- Source visual truth: `C:\Users\PC\AppData\Local\Temp\codex-clipboard-caa71441-1dee-4dcc-852d-2c3a23b55084.png`.
- Implementation capture: `artifacts/gospeak-home.png` (recaptured after review fixes).
- Full-view comparison: `C:\Users\PC\AppData\Local\Temp\gospeak-general-design-comparison.png`, reviewed at normalized 720px height after review fixes.
- Focused region comparison: not needed; the header, metric surface, and setup cards are readable in the full-view comparison.

## Viewport And Interaction Checks

- `1280x720`, browser-preview ready/missing setup state: ASR and Rewrite render the darker muted-red border; Active Profile renders the darker green border. The General page is transparent with no radius or shadow. No horizontal overflow and no console errors.
- `900x720`: metrics render in two columns with no horizontal overflow.
- `390x844`: metrics render in one column, setup cards remain single-column, and no horizontal overflow occurs.
- ASR and Rewrite navigate to Settings with the Providers tab selected. Active Profile navigates to Profiles.
- Focus: the in-app Browser confirmed the status-card focus rule as `rgb(37, 99, 235) solid 3px`; hover background, transform, and reduced-motion rules are covered by `src/App.css.test.ts`.

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

**Review Fixes**
- [P1] State borders were too light against white.
  Fix: changed the ready border to `#3f7f5c` and the missing border to `#a85c55`; each is approximately `4.8:1` against white.
  Post-fix evidence: browser computed `rgb(63, 127, 92)` and `rgb(168, 92, 85)` border colors.
- [P1] Status-card focus outline was low-alpha.
  Fix: changed the status-card outline to opaque `#2563eb` at `3px`.
  Post-fix evidence: browser CSSOM reports `rgb(37, 99, 235) solid 3px`.
- [P1] General page added an unnecessary floating-card layer.
  Fix: limited the existing card rule to Dictionary and made General transparent with `border-radius: 0` and `box-shadow: none`.
  Post-fix evidence: browser computed `rgba(0, 0, 0, 0)`, `0px`, and `none`.
- [P1] Global button hover could override the status-card surface.
  Fix: added `.general-status-card:hover:not(:disabled)` with an explicit white background, transform, and shadow.
  Post-fix evidence: CSS contract coverage in `src/App.css.test.ts`.

**Required Fidelity Surfaces**
- Typography: existing Inter/system Gospeak stack, compact hierarchy, and wrapping remain intact.
- Spacing and layout rhythm: 28px page/header spacing, 12px status gaps, and responsive grid tracks are stable.
- Colors and tokens: existing neutral Gospeak tokens are retained; `#3f7f5c` and `#a85c55` provide accessible semantic setup borders, and `#2563eb` provides the opaque focus outline.
- Image quality and assets: existing Gospeak brand asset is unchanged; no replacement imagery or generated asset is introduced.
- Copy and content: existing Gospeak dashboard labels and navigation remain intact.

**Follow-up Polish**
- P3: none.

final result: passed
