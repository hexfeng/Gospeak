# Gospeak P0 Alpha Acceptance Matrix

Last updated: 2026-06-23

Automated checks cover the application state machine, configuration pipeline,
privacy-safe usage events, storage migration, import validation, provider
fallback, clipboard behavior, linting, compilation, and packaging. Rows marked
`Pending human` require a real microphone, provider keys, or interaction with
another foreground desktop application and must not be inferred from unit tests.

## Trigger and Input Matrix

| Scenario | Expected result | Status |
| --- | --- | --- |
| Main-window Start/Stop | Records, transcribes, rewrites, pastes | Pending human |
| Toggle shortcut | First press starts; second press stops | Pending human |
| Push-to-talk shortcut | Press starts; release stops | Pending human |
| Tray Start/Stop | Uses the same dictation state machine | Pending human |
| Floating recorder Stop | Stops the active recording | Pending human |
| Chinese speech | Correct punctuation and paragraphing | Pending human |
| English speech | Natural cleaned English | Pending human |
| Mixed Chinese/English | Preserves technical English terms | Pending human |
| “Gawspeak” dictionary mapping | Final output contains “Gospeak” | Pending human |
| Short noisy recording | Returns text or a recoverable STT error | Pending human |

## Profile and Target Application Matrix

Test each Profile in at least one compatible target and test Normal in all
targets.

| Target | Normal | Email | Prompt | Translate |
| --- | --- | --- | --- | --- |
| Notepad | Pending human | N/A | N/A | Pending human |
| Chrome / Edge textarea | Pending human | Pending human | Pending human | Pending human |
| Outlook / Teams | Pending human | Pending human | N/A | Pending human |
| VS Code / Cursor | Pending human | N/A | Pending human | Pending human |

## Failure and Privacy Matrix

| Scenario | Expected result | Status |
| --- | --- | --- |
| Missing Groq key | Clear error before network request | Automated |
| Missing OpenAI key | Clear error before network request | Automated |
| Rewrite failure | Raw transcript returned with fallback flag | Automated |
| Paste failure | Text remains on clipboard with recovery message | Automated |
| No microphone | Clear recorder error; app remains usable | Pending human |
| Shortcut conflict | New binding is rejected and error is shown | Pending human |
| Successful default run | Temporary Gospeak WAV is removed | Automated + pending human |
| Save raw audio enabled | Completed WAV is retained locally | Automated UI; pending human |
| Config export | No API key, audio, logs, or transcript content | Automated |
| Usage event | No transcript or polished-text columns | Automated |
| Legacy SQLite location | Database moves once to App Data | Automated |

## Release Gate

- [ ] Complete every `Pending human` row relevant to the Windows Alpha.
- [ ] Install the generated installer on a clean Windows user profile.
- [ ] Confirm the app starts from Start Menu and creates data under App Data.
- [ ] Confirm uninstall does not delete user configuration without warning.
- [ ] Record tested Windows version, microphone, and target-app versions.
