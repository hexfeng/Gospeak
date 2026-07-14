# Gospeak P0 Alpha Acceptance Matrix

Last updated: 2026-07-13

Automated checks cover the application state machine, configuration pipeline,
privacy-safe usage events, storage migration, import validation, provider
fallback, clipboard behavior, recorder-window permissions, latency diagnostics,
fast dictation, App-aware routing, provider cost visibility, Speak to Edit,
experimental streaming, local light rewrite, the current frontend, linting,
compilation, and packaging. Manual P0, App-aware routing, and Speak to Edit rows
remain recorded as passed based on user-reported acceptance on 2026-06-30 and
2026-07-01 where noted. Features added after those dates are tracked separately
and are not treated as manually accepted.

## Test Environment

| Item | Value |
| --- | --- |
| Commit | `c1f15f5` (`main`, frontend and General dashboard refinements) |
| App version | `0.1.0` debug bundle |
| NSIS installer | `D:\Projects\Gospeak\src-tauri\target\debug\bundle\nsis\Gospeak_0.1.0_x64-setup.exe` (`2026-07-13 22:32:28`, 5,660,166 bytes) |
| MSI installer | `D:\Projects\Gospeak\src-tauri\target\debug\bundle\msi\Gospeak_0.1.0_x64_en-US.msi` (`2026-07-13 22:32:35`, 10,145,792 bytes) |
| OS | Recorded P0 manual environment: Windows 10 Home, version 2009, build 26200, 64-bit |
| Microphone | Recorded P0 manual environment: `Microphone (Realtek(R) Audio)` reported `OK` by Windows PnP |
| Target apps detected | Recorded P0 manual environment: Notepad `10.0.26100.8457`; Chrome `149.0.7827.103`; Edge `149.0.4022.98`; Outlook `16.0.20131.20090`; VS Code `1.109.0`; Cursor `3.8.11` |
| Automated verification | `npm test` (100 tests), `npm run lint`, `npm run build`, `cargo test` (99 tests), `cargo fmt -- --check`, `cargo clippy --all-targets --all-features -- -D warnings`, and `npm run tauri -- build --debug` passed on 2026-07-13 |
| Manual acceptance | User-reported pass for the original P0 trigger/input, profile/target-app, failure/privacy, and clean-install checks on 2026-06-30; App-aware routing and Speak to Edit accepted on 2026-07-01 |
| Current-head install acceptance | Pending for the `c1f15f5` debug installers |

## Trigger and Input Matrix

| Scenario | Expected result | Status |
| --- | --- | --- |
| Main-window Start/Stop | Records, transcribes, rewrites, pastes | Pass - user-reported manual acceptance on 2026-06-30 |
| Toggle shortcut | First press starts; second press stops | Pass - user-reported manual acceptance on 2026-06-30 |
| Push-to-talk shortcut | Press starts; release stops | Pass - user-reported manual acceptance on 2026-06-30 |
| Tray Start/Stop | Uses the same dictation state machine | Pass - user-reported manual acceptance on 2026-06-30 |
| Floating recorder status visibility | Shows waveform/status light during recording and processing | Pass - automated recorder overlay tests cover waveform-only UI, status labels, and show/hide permissions |
| Chinese speech | Correct punctuation and paragraphing | Pass - user-reported manual acceptance on 2026-06-30 |
| English speech | Natural cleaned English | Pass - user-reported manual acceptance on 2026-06-30 |
| Mixed Chinese/English | Preserves technical English terms | Pass - user-reported manual acceptance on 2026-06-30 |
| `"Gawspeak"` dictionary mapping | Final output contains `"Gospeak"` | Pass - user-reported manual acceptance on 2026-06-30 |
| Short noisy recording | Returns text or a recoverable STT error | Pass - user-reported manual acceptance on 2026-06-30 |

## Profile and Target Application Matrix

Test each Profile in at least one compatible target and test Normal in all
targets.

| Target | Normal | Email | Prompt | Translate |
| --- | --- | --- | --- | --- |
| Notepad | Pass - user-reported manual acceptance on 2026-06-30 | N/A | N/A | Pass - user-reported manual acceptance on 2026-06-30 |
| Chrome / Edge textarea | Pass - user-reported manual acceptance on 2026-06-30 | Pass - user-reported manual acceptance on 2026-06-30 | Pass - user-reported manual acceptance on 2026-06-30 | Pass - user-reported manual acceptance on 2026-06-30 |
| Outlook / Teams | Pass - user-reported manual acceptance on 2026-06-30 | Pass - user-reported manual acceptance on 2026-06-30 | N/A | Pass - user-reported manual acceptance on 2026-06-30 |
| VS Code / Cursor | Pass - user-reported manual acceptance on 2026-06-30 | N/A | Pass - user-reported manual acceptance on 2026-06-30 | Pass - user-reported manual acceptance on 2026-06-30 |

## Failure and Privacy Matrix

| Scenario | Expected result | Status |
| --- | --- | --- |
| Missing Groq key | Clear error before network request | Pass - automated provider-readiness test covers missing Groq key |
| Missing OpenAI key | Clear error before network request | Pass - automated provider-readiness test covers missing OpenAI key; Fast dictation allows missing OpenAI key when rewrite is skipped |
| Rewrite failure | Raw transcript returned with fallback flag | Pass - automated provider fallback test covers raw transcript fallback |
| Paste failure | Text remains on clipboard with recovery message | Pass - automated clipboard failure handling covers recoverable paste result |
| No microphone | Clear recorder error; app remains usable | Pass - user-reported manual acceptance on 2026-06-30 |
| Shortcut conflict | New binding is rejected and error is shown | Pass - user-reported manual acceptance on 2026-06-30 |
| Successful default run | Temporary Gospeak WAV is removed | Pass - automated cleanup coverage plus user-reported manual acceptance on 2026-06-30 |
| Save raw audio enabled | Completed WAV is retained locally | Pass - automated UI coverage plus user-reported manual acceptance on 2026-06-30 |
| Config export | No API key, audio, logs, or transcript content | Pass - automated export test excludes keys, audio, logs, transcript, and polished text |
| Usage event | No transcript or polished-text columns | Pass - automated storage test verifies privacy-safe usage-event schema |
| Legacy SQLite location | Database moves once to App Data | Pass - automated migration test verifies one-time App Data migration |
| Recorder window permission | `window.show` and `window.hide` are allowed for the recorder overlay | Pass - capability regression test verifies `core:window:allow-show` and `core:window:allow-hide` |
| Fast dictation | STT output can skip rewrite and paste faster | Pass - automated fast-mode tests verify `skip_rewrite`, no OpenAI requirement, and `Rewrite: Skipped` diagnostics |
| STT audio optimization | Recorded WAV is optimized before upload | Pass - automated audio test verifies 16 kHz mono optimized WAV output |

## Post-P0 App-Aware Routing Matrix

| Scenario | Expected result | Status |
| --- | --- | --- |
| Foreground app detection | Windows foreground executable and window title are available to routing | Pass - automated Rust tests cover context shape and non-content routing metadata; user-reported manual acceptance on 2026-07-01 |
| Chrome + ChatGPT title rule | `chrome.exe` plus `ChatGPT` window-title match selects Prompt Profile | Pass - user-reported manual acceptance on 2026-07-01; automated frontend test covers camelCase foreground context and Prompt routing |
| Chrome app-only rule | `chrome.exe` without a matching title-specific rule falls back to Normal Profile | Pass - user-reported manual acceptance on 2026-07-01; automated Rust and frontend resolver tests cover app-only matching |
| Manual routing override | App-aware routing disabled uses the manually selected Active Profile | Pass - user-reported manual acceptance on 2026-07-01; automated frontend test covers disabled App-aware routing |
| Disabled or deleted rule | Rule is ignored and fallback Profile is used | Pass - automated Rust and frontend tests cover disabled and deleted rules |
| Missing fallback Profile | Built-in Normal Profile is used instead of sending a missing Profile id | Pass - automated frontend tests cover missing and disabled fallback Profiles |
| App Rules export | App Rules are exported as config without keys, audio, transcript, or polished text | Pass - automated frontend export tests cover privacy-safe payloads |
| Provider usage cost totals | General shows privacy-safe aggregate usage and cost metrics from recorded usage events | Pass - automated frontend tests cover all-time usage aggregation; Rust tests cover usage cost and character-count persistence |

## Post-P0 Speak to Edit Matrix

| Scenario | Expected result | Status |
| --- | --- | --- |
| Selected text capture | App copies selected text from the active app and restores the previous clipboard value before replacement | Pass - automated clipboard tests cover selected-text capture and clipboard restoration |
| Spoken edit rewrite | STT transcript is treated as the edit instruction and OpenAI receives selected text plus instruction, not transcript history | Pass - automated provider test covers selected-text edit prompt and replacement output |
| UI edit mode | Speak to Edit mode captures selected text before recording, sends it as `selected_text`, and pastes the replacement text | Pass - automated frontend test covers edit mode request flow |
| Target-app replacement | Selected text is replaced in Notepad, browser text fields, Outlook/Teams, and VS Code/Cursor | Pass - user-reported manual acceptance on 2026-07-01 |
| Deferred sync/local STT | Sync Folder, WebDAV, and local Whisper are not required for the current P0/Post-P0 acceptance gate | Pass - documented as deferred roadmap scope |

## Current Post-P0 Development Matrix

These rows describe the current `main` branch. They do not change the earlier
P0, App-aware routing, or Speak to Edit acceptance decisions.

| Scenario | Expected result | Status |
| --- | --- | --- |
| Frontend information architecture | General, Profiles, Dictionary, and Settings preserve existing dictation and configuration behavior | Automated pass - browser design QA was recorded at `7d30c08` before final General refinements; current-head browser and installed Tauri acceptance pending |
| All-time usage summary | General aggregates duration, non-whitespace output characters, usage mode, and cost without storing transcript content | Pass - frontend aggregation and Rust storage tests pass |
| Experimental streaming | Opt-in streaming transcribes, rewrites or locally cleans safe text, inserts without duplicate fallback text, and falls back to batch before partial insertion | Automated pass - current-build manual network, partial-insertion, and fallback acceptance pending |
| Local light rewrite | Short safe dictation is cleaned locally; ambiguous, long, or profile-specific text uses model rewrite | Automated pass - manual checklist exists; current-build spoken-input acceptance pending |
| Unsupported privacy controls | Settings does not imply transcript history, sync, or crash-report behavior that is not implemented | Automated pass - unsupported controls are removed; legacy false fields remain import-compatible |

## Original P0 Release Gate

These checks apply to the accepted P0 build and do not assert that the current
`c1f15f5` installers have completed the same manual gate.

- [x] Pass - Complete every manual row relevant to the Windows Alpha.
- [x] Pass - Install the generated installer on a clean Windows user profile.
- [x] Pass - Confirm the app starts from Start Menu and creates data under App Data.
- [x] Pass - Confirm uninstall does not delete user configuration without warning.
- [x] Pass - Record tested Windows version, microphone, installer path/version, and detected target-app versions.

## P0 Acceptance Decision

P0 Alpha remains accepted as of 2026-06-30. Its automated verification and
manual acceptance rows are recorded above. Later current-branch work is tracked
separately and does not retroactively change this decision.

## Post-P0 App-Aware Acceptance Decision

App-aware Profile routing is accepted as of 2026-07-01 based on automated
coverage plus user-reported manual acceptance. Future work in this area should
be limited to bug fixes unless a new App Rules requirement is explicitly scoped.

## Post-P0 Speak to Edit Acceptance Decision

Speak to Edit is accepted as of 2026-07-01 based on automated coverage plus
user-reported manual target-app acceptance.

## Current Head Decision

Commit `c1f15f5` passes automated verification and debug packaging. Experimental
streaming, local light rewrite, and the latest frontend still require
current-head browser or installed-runtime acceptance as applicable. Public Beta
planning is intentionally deferred while functional gaps are prioritized.
