# Light Rewrite Manual Test

Use this checklist to manually verify the local light rewrite fast path.

## Setup

1. Launch the current build.
2. Configure provider keys:
   - Batch mode needs Groq STT.
   - Streaming mode needs the OpenAI key used by realtime STT.
   - Fast dictation can still need the OpenAI rewrite key when local rules decide the text needs model fallback.
3. Select the Normal profile.
4. Turn off Speak to Edit unless the test says otherwise.
5. Turn on Fast dictation for the main tests. `Rewrite = Skipped` means local light rewrite handled the transcript.

## Expected Diagnostics

After a local light rewrite hit:

- Output is inserted or pasted normally.
- Last dictation diagnostics show `Rewrite` as `Skipped`.
- No rewrite latency is shown.

If a case is intentionally gated out or needs model fallback, diagnostics should show rewrite latency instead of `Skipped`.

## Batch Tests

Turn off Experimental streaming dictation.

| Case | Say | Expected |
| --- | --- | --- |
| Numbered list | `todo one buy milk two reply email three book meeting` | Inserted text is `1. buy milk`, `2. reply email`, `3. book meeting`, one item per line. `Rewrite = Skipped`. |
| Chinese ordinal list | `测试一下功能，第一代办，第二图片，第三邮件` | Output keeps the title line, then `1. 代办`, `2. 图片`, `3. 邮件`, one item per line. `Rewrite = Skipped`. |
| Mixed Chinese markers | `测试一下功能，一代办，第二图片，三邮件` | Output keeps the title line and formats all three items as numbered lines. `Rewrite = Skipped`. |
| Short cleanup | `um today today we meet,, discuss project` | Output should read like `Today we meet, discuss project.`. `Rewrite = Skipped`. |
| Short Chinese cleanup | `嗯 今天开会 然后讨论项目` | Output removes obvious filler and adds conservative punctuation. `Rewrite = Skipped`. |
| Short question | Say a short Chinese question ending without punctuation | Output should end with `？`. `Rewrite = Skipped`. |
| Semantic list fallback | Say a list using `including`, `respectively`, `mainly includes`, `如下`, or `以下`, but without explicit `1/2/3` or `第一/第二/第三` markers | Should use model rewrite and format parallel items one per line when appropriate. `Rewrite` shows latency, not `Skipped`. |
| Long text fallback | Say more than 100 visible characters without clear local structure | Should use model rewrite. It must not paste raw transcript when OpenAI rewrite is unavailable. |
| Preserve semantic words | `you know the answer` | Output keeps `you know`; it must not remove those words. |
| Preserve like | `i like rust` | Output should be `I like rust.`; it must not remove `like`. |
| Preserve decimal | `today 3.5 dollars` | Output keeps `3.5`; it must not become `3. 5` or another punctuation split. |
| Preserve domain | `send example.com to me` | Output keeps `example.com`. |
| Do not fake a list | `listening to one song and two podcasts` | Output must not become numbered list lines. |

## Streaming Tests

Turn on Experimental streaming dictation. Keep Fast dictation off.

| Case | Say | Expected |
| --- | --- | --- |
| Streaming list | `todo one buy milk two reply email` | Final inserted text is a numbered list. `Rewrite = Skipped`; `First STT` may be populated; `First rewrite` is empty. |
| Streaming fallback | Say a longer paragraph, over 100 visible characters | Should use streaming rewrite. `Rewrite` should show latency, not `Skipped`. |
| Empty recording | Start recording, say nothing, then stop | The recorder returns to idle. No red error overlay, no paste/copy, no usage event. |

## Gating Tests

| Case | Setup | Say | Expected |
| --- | --- | --- | --- |
| Prompt profile | Select Prompt profile | `write a product plan to reduce latency` | Should go through LLM rewrite. `Rewrite` should not be `Skipped`. |
| Translate profile | Select Translate profile | Any short sentence | Should go through LLM rewrite. `Rewrite` should not be `Skipped`. |
| Speak to Edit | Enable Speak to Edit and select text in another app | `make it shorter` | Should go through LLM rewrite and replace selected text. It must not paste the raw spoken instruction. |
| Fast + Speak to Edit | Enable Fast dictation and Speak to Edit | `make it shorter` | Backend must still use rewrite for selected text. It must not paste raw transcript. |
| Fast + missing OpenAI rewrite key | Remove OpenAI key, keep Groq key, and say a long or semantic-list input | Should show a missing OpenAI key error. It must not paste raw transcript. |

## Chinese Smoke Cases

Use these same meanings in Chinese if manual STT output is stable:

| Case | Say | Expected |
| --- | --- | --- |
| Explicit list | Say a todo list with explicit "first, second, third" wording | Should become numbered lines. |
| Mixed markers | Mix "one", "second", and "three" equivalents in one Chinese list | Should still become numbered lines. |
| Semantic "that" | Say "send me that file" in Chinese | The word meaning "that" must not be removed. |
| Ambiguous numerals | Say a phrase meaning "the list has twenty items total" | It must not become numbered list lines. |

## Fail Criteria

- Any selected-text edit pastes the spoken instruction directly.
- Missing OpenAI rewrite key silently pastes raw transcript when rewrite is required.
- No-speech or silent recording shows the red error overlay, pastes text, or records usage.
- Decimals, domains, or normal short text are semantically changed by local rules.
- Ambiguous numerals become numbered list items.
