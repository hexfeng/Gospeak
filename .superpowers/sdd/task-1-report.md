# Task 1: Privacy-Safe Usage Aggregation

## Status

DONE

## Implementation

- Added `summarizeUsage(events, now)` in `src/domain/usage.ts`.
- Aggregates only event metrics: today count, audio seconds, average combined latency, fallback count, and current-month STT/rewrite/total costs.
- Uses local calendar-day and calendar-month boundaries and excludes future events.
- Returns `null` for today's average latency when there are no today events.
- Added `recentUsageEvents(events, limit)`, which sorts a copied array newest-first and does not mutate the input.
- No event content, transcript, or audio data is introduced or persisted by these helpers.

## TDD Evidence

### RED

Command:

```powershell
npm test -- src/domain/usage.test.ts
```

Result: expected failure before implementation. Vitest found the test file but could not resolve `./usage`:

```text
Error: Failed to resolve import "./usage" from "src/domain/usage.test.ts".
Test Files  1 failed (1)
Tests  no tests
```

### GREEN

Command:

```powershell
npm test -- src/domain/usage.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests  3 passed (3)
```

## Verification

- `npm test`: passed, 8 test files and 55 tests.
- `npm run lint`: passed with no ESLint output/errors.
- `npm run build`: passed; TypeScript compilation and Vite production build completed successfully.
- `git diff --check`: passed with no whitespace errors.

## Changed Files

- `src/domain/usage.test.ts`
- `src/domain/usage.ts`

## Self-Review

- Boundary checks include only events from the current month/day through `now`; older and future events are excluded.
- Optional audio, rewrite latency, and cost fields use zero fallbacks as required by the record type.
- Average latency is rounded and explicitly null for an empty day.
- Recent-event sorting clones the input array, so caller ordering is preserved.
- The implementation reads only aggregate-safe event metadata and numeric metrics; no new raw transcript/audio path exists.

## Concerns

The helper assumes `created_at` contains valid ISO-compatible timestamps, consistent with the existing record contract. JavaScript floating-point addition is used for costs; this matches the requested minimal frontend aggregation, but a decimal representation would be needed if exact currency arithmetic becomes a requirement.
