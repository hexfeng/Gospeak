# Default Window Fit and Provider Icons Design

## Goal

Keep the General and Providers right-hand workspaces fully visible without horizontal or vertical scrolling in every supported desktop window size, while preserving the approved visual style and interactions.

## Supported window contract

- The main Tauri window remains `1180 x 760` by default and cannot be resized below `1024 x 640`.
- General and Providers use the available workspace height instead of growing the document.
- General keeps the existing four metric cards responsive: four columns on wider windows and `2 x 2` near the minimum width.
- Existing setup-card hover and focus treatments remain unchanged.

## Providers behavior

- Reuse the existing five-item page slice and Previous/Next controls; do not add a second paging system.
- Configuration rows become height-responsive and remain a single line at supported widths.
- Identity, model, status, updated date, and actions share one vertical center.
- Every supported provider ID renders a local logo. `openai` and `openai-realtime` share the OpenAI asset; Qwen Local/API share the Qwen asset.

## Verification

- Component tests prove that a page contains at most five rows, that paging works, and that all supported provider IDs render an image.
- CSS contract tests prove the minimum window and compact no-scroll layout rules.
- Browser checks cover General and Providers at `1024 x 640` and `1180 x 760`, including five and six saved configurations.
