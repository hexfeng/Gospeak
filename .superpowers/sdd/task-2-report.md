# Task 2 Report: Aggregate All-Time General Metrics

## Scope

- Added optional `UsageEventRecord.output_character_count` for the Rust count exposed to TypeScript.
- Added `totalAudioSeconds`, `totalCharacterCount`, and `totalCost` to `UsageSummary`.
- Aggregated all-time metrics in the existing single `summarizeUsage` pass.
- Preserved all existing daily and monthly fields.

## TDD Evidence

### RED

Command:

```powershell
npm test -- src/domain/usage.test.ts
```

Exact result: exit code `1`; 1 test file ran with 5 tests, 3 failed and 2 passed. The failures were the expected missing all-time fields: the existing exact summary lacked `totalAudioSeconds`, `totalCharacterCount`, and `totalCost`, and the new all-time and empty-input assertions could not find them.

### GREEN

Command:

```powershell
npm test -- src/domain/usage.test.ts
```

Exact result: exit code `0`; 1 test file passed with 5 tests passed.

## Verification

Commands and exact results:

```powershell
npm test
# exit 0; 12 test files passed, 95 tests passed

npm run lint
# exit 0; eslint completed with no errors

npm run build
# exit 0; TypeScript compilation and Vite production build passed

git diff --check
# exit 0; no diff errors
```

## Commit

`ae0d805a0b05acf98597fbc05a95e070ff723aa` (`feat: aggregate all-time General usage`)

## Concerns

None. The transport field remains optional so old frontend fixtures remain valid; nullish values contribute zero. The all-time totals use one pass and do not change existing daily/monthly boundaries.
