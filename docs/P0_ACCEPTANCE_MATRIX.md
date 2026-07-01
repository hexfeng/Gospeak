# Gospeak P0 Alpha Acceptance Matrix

Last updated: 2026-07-01

Automated checks cover the application state machine, configuration pipeline,
privacy-safe usage events, storage migration, import validation, provider
fallback, clipboard behavior, recorder-window permissions, latency diagnostics,
fast dictation, App-aware routing, provider cost visibility, linting,
compilation, and packaging. Manual rows below are
recorded as passed based on user-reported acceptance on 2026-06-30.

## Test Environment

| Item | Value |
| --- | --- |
| Commit | `9e2cd9a Improve recorder feedback and dictation latency` |
| App version | `0.1.0` debug bundle |
| NSIS installer | `D:\Projects\Gospeak\src-tauri\target\debug\bundle\nsis\Gospeak_0.1.0_x64-setup.exe` (`2026-06-30 12:57:29`, 5,442,489 bytes) |
| MSI installer | `D:\Projects\Gospeak\src-tauri\target\debug\bundle\msi\Gospeak_0.1.0_x64_en-US.msi` (`2026-06-30 12:57:38`, 9,740,288 bytes) |
| OS | Windows 10 Home, version 2009, build 26200, 64-bit |
| Microphone | `Microphone (Realtek(R) Audio)` reported `OK` by Windows PnP |
| Target apps detected | Notepad `10.0.26100.8457`; Chrome `149.0.7827.103`; Edge `149.0.4022.98`; Outlook `16.0.20131.20090`; VS Code `1.109.0`; Cursor `3.8.11` |
| Automated verification | `npm test`, `npm run lint`, `npm run build`, `cargo test`, `cargo fmt -- --check`, `cargo clippy --all-targets --all-features -- -D warnings`, `npm run tauri -- build --debug` all passed on 2026-06-30 |
| Manual acceptance | User-reported pass for P0 trigger/input, profile/target-app, failure/privacy, and clean-install release-gate checks on 2026-06-30 |

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
| Provider/model cost table | Providers page shows 2026-06-30 pricing snapshot and estimates | Pass - automated frontend tests cover Groq and OpenAI model estimates |

## Release Gate

- [x] Pass - Complete every manual row relevant to the Windows Alpha.
- [x] Pass - Install the generated installer on a clean Windows user profile.
- [x] Pass - Confirm the app starts from Start Menu and creates data under App Data.
- [x] Pass - Confirm uninstall does not delete user configuration without warning.
- [x] Pass - Record tested Windows version, microphone, installer path/version, and detected target-app versions.

## P0 Acceptance Decision

P0 Alpha is accepted as of 2026-06-30. Automated verification passed, the latest
debug installers were rebuilt, and the remaining manual acceptance rows are
recorded as user-reported passes. App-aware Profile routing can begin as the
next post-P0 phase.

## Post-P0 App-Aware Acceptance Decision

App-aware Profile routing is accepted as of 2026-07-01 based on automated
coverage plus user-reported manual acceptance. Future work in this area should
be limited to bug fixes unless a new App Rules requirement is explicitly scoped.
