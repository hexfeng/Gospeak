# Light Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local `lightRewrite(transcript, context)` pass after STT and before LLM rewrite so short, safe dictation can avoid the current 3-5s rewrite delay.

**Architecture:** Keep STT routing unchanged. Add one Rust `light_rewrite` module shared by batch dictation and streaming dictation; if local rules confidently handle a transcript, return that output and skip LLM rewrite, otherwise continue through the existing rewrite path.

**Tech Stack:** Rust stdlib only, existing Tauri/Rust pipeline, existing Vitest/App diagnostics. No local model and no new dependency.

---

## Routing Invariant

This plan does not change STT routing:

- Streaming mode still sends audio chunks to OpenAI realtime STT while recording.
- Non-streaming mode still records first, then sends the final audio to the configured batch STT provider.
- Light rewrite runs only after a transcript exists.

## Scope

Implement a conservative local rule layer:

- Remove obvious filler words: "um", "uh", "that/like" style spoken filler, plus the Chinese equivalents represented in tests with Unicode escapes.
- Collapse repeated adjacent words and repeated punctuation.
- Normalize simple punctuation.
- Add terminal punctuation for plain sentences.
- Apply simple English casing: sentence first letter and standalone `i` -> `I`.
- Format explicit short enumerations into numbered lines, for example: "todo one buy milk two reply email" -> numbered list.
- Apply only for safe profile modes and short transcripts.

Do not implement:

- Semantic rewrite.
- Translation.
- Speak to Edit.
- Prompt-profile goal/context/constraints generation.
- A settings UI for tuning rules.
- A new telemetry schema.
- Any local model dependency.

## Architecture

Create one Rust module:

- `src-tauri/src/light_rewrite.rs`

Use it from both pipelines:

- Batch pipeline: `src-tauri/src/provider.rs`
- Streaming pipeline: `src-tauri/src/streaming.rs`

The decision order should be:

1. STT produces transcript.
2. Local light rewrite checks whether this transcript is safe to handle locally.
3. If handled, return local output and skip LLM rewrite.
4. If not handled, continue to existing `skip_rewrite` / LLM rewrite flow.

## Data Shape

Add a minimal context:

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LightRewriteContext {
    pub profile_mode: String,
    pub selected_text: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LightRewriteOutput {
    pub text: String,
}

pub fn light_rewrite(
    transcript: &str,
    context: &LightRewriteContext,
) -> Option<LightRewriteOutput> {
    // Returns Some only when local rules are confident enough.
}
```

Gating rules:

- Allow only normal/plain dictation mode at first.
- Return `None` when `selected_text` is present.
- Return `None` for Prompt profile.
- Return `None` for Translate profile.
- Return `None` when the transcript is longer than the first implementation threshold, recommended: 40 visible chars for CJK-heavy text or 80 chars for mostly ASCII text.

## Task 1: Add Local Rule Module

Files:

- Create `src-tauri/src/light_rewrite.rs`
- Modify `src-tauri/src/lib.rs`

- [ ] Add `mod light_rewrite;` in `src-tauri/src/lib.rs`.
- [ ] Add `LightRewriteContext`, `LightRewriteOutput`, and `light_rewrite`.
- [ ] Implement filler cleanup with stdlib string logic only.
- [ ] Implement repeated punctuation cleanup.
- [ ] Implement adjacent repeated-token cleanup.
- [ ] Implement terminal punctuation repair.
- [ ] Implement simple English casing.
- [ ] Implement conservative numbered-list formatting.

Numbered-list formatting should be deliberately narrow:

- Require at least two ordered markers.
- Support English markers like `one`, `two`, `three` and digit markers `1`, `2`, `3`.
- Support Chinese markers using Rust Unicode escapes in tests/fixtures, such as `\u{4e00}` for one and `\u{4e8c}` for two.
- Prefer list hint words such as todo/list/items/steps, and their Chinese equivalents via Unicode escapes.
- Return `None` if markers are out of order or any item is empty.

Suggested tests:

```rust
#[test]
fn removes_obvious_fillers_and_repairs_punctuation() {
    let input = "\u{55ef} \u{90a3}\u{4e2a} \u{4eca}\u{5929}\u{5f00}\u{4f1a}\u{ff0c}\u{ff0c}\u{5c31}\u{662f}\u{8ba8}\u{8bba}\u{4e00}\u{4e0b}\u{9879}\u{76ee}";
    let output = light_rewrite(input, &LightRewriteContext::normal()).unwrap();

    assert_eq!(
        output.text,
        "\u{4eca}\u{5929}\u{5f00}\u{4f1a}\u{ff0c}\u{8ba8}\u{8bba}\u{4e00}\u{4e0b}\u{9879}\u{76ee}\u{3002}"
    );
}

#[test]
fn formats_explicit_todo_enumeration() {
    let input = "\u{4ee3}\u{529e}\u{4e8b}\u{9879}\u{4e00}\u{4e70}\u{725b}\u{5976}\u{4e8c}\u{56de}\u{590d}\u{90ae}\u{4ef6}\u{4e09}\u{9884}\u{7ea6}\u{4f1a}\u{8bae}";
    let output = light_rewrite(input, &LightRewriteContext::normal()).unwrap();

    assert_eq!(
        output.text,
        "1. \u{4e70}\u{725b}\u{5976}\n2. \u{56de}\u{590d}\u{90ae}\u{4ef6}\n3. \u{9884}\u{7ea6}\u{4f1a}\u{8bae}"
    );
}

#[test]
fn does_not_guess_prompt_profile_structure() {
    let output = light_rewrite("write a plan with goal and constraints", &LightRewriteContext::prompt());
    assert!(output.is_none());
}
```

Verify:

```powershell
Set-Location src-tauri
cargo test -p gospeak light_rewrite
cargo fmt -- --check
```

## Task 2: Carry Profile Mode Through The Pipeline

Files:

- Modify `src-tauri/src/provider.rs`
- Modify `src-tauri/src/lib.rs`
- Modify tests that construct `PipelineContext`

- [ ] Add `profile_mode: String` to `PipelineContext`.
- [ ] Populate it from the selected profile in `run_audio_file_dictation`.
- [ ] Populate it from the selected profile in `run_streaming_dictation`.
- [ ] Update existing test contexts with `profile_mode: "normal".to_string()`.
- [ ] Use `"prompt"` only in tests that prove local rewrite is disabled.

Verify:

```powershell
Set-Location src-tauri
cargo test -p gospeak provider streaming
cargo fmt -- --check
```

## Task 3: Hook Light Rewrite Into Batch Dictation

File:

- Modify `src-tauri/src/provider.rs`

- [ ] Add a provider test where STT returns a short list transcript and the rewrite provider panics if called.
- [ ] Call `light_rewrite` after STT transcript creation and before the existing `skip_rewrite` branch.
- [ ] If local rewrite returns `Some`, return `PipelineResult` with:
  - `text` set to local output
  - `fast_path_used: true`
  - `rewrite_latency_ms: None`
  - `rewrite_input_tokens: None`
  - `rewrite_output_tokens: None`
  - existing STT/audio metadata preserved
- [ ] Leave existing fallback behavior unchanged when local rewrite returns `None`.

Verify:

```powershell
Set-Location src-tauri
cargo test -p gospeak provider
cargo clippy --all-targets --all-features -- -D warnings
cargo fmt -- --check
```

## Task 4: Hook Light Rewrite Into Streaming Dictation

File:

- Modify `src-tauri/src/streaming.rs`

- [ ] Extract a small local helper for testability, for example:

```rust
fn local_light_rewrite_result(
    transcript: &str,
    request: &StreamingPipelineRequest,
    context: &provider::PipelineContext,
    stt_latency_ms: u64,
    first_stt_delta_ms: Option<u64>,
) -> Option<StreamingPipelineResult>
```

- [ ] Add a streaming unit test that proves short normal transcripts can return a local result without streaming rewrite.
- [ ] Call the helper after realtime STT transcript creation and before existing `skip_rewrite` / streaming rewrite branches.
- [ ] Return `StreamingPipelineResult` with:
  - `streaming_used: true`
  - `fast_path_used: true`
  - `rewrite_latency_ms: None`
  - first-token/STT timing preserved
- [ ] Preserve guarded streaming insertion behavior when local rewrite returns `None`.

Verify:

```powershell
Set-Location src-tauri
cargo test -p gospeak streaming
cargo clippy --all-targets --all-features -- -D warnings
cargo fmt -- --check
```

## Task 5: Diagnostics And Docs

Files:

- Modify `src/App.test.tsx` only if existing diagnostics tests need fixture updates.
- Modify `docs/P0_STATUS_PLAN.md`.

- [ ] Do not add UI controls in this slice.
- [ ] Treat local light rewrite as a fast path in existing diagnostics.
- [ ] Confirm the UI can display rewrite skipped / no rewrite latency without a new label.
- [ ] Add one status-doc note under performance work:

```markdown
- Local light rewrite implemented after STT for short safe dictation: filler cleanup, punctuation repair, simple casing, and conservative numbered-list formatting before falling back to LLM rewrite.
```

Full verification:

```powershell
npm test
npm run lint
npm run build
Set-Location src-tauri
cargo test -p gospeak
cargo clippy --all-targets --all-features -- -D warnings
cargo fmt -- --check
```

## Acceptance Criteria

- STT routing is unchanged.
- Light rewrite runs only after a transcript exists.
- Normal short dictation can skip LLM rewrite.
- Explicit short enumerations become numbered lines.
- Prompt, Translate, and Speak to Edit continue to use LLM rewrite.
- No new dependency is added.
- Existing batch fallback and streaming duplicate-guard behavior remain intact.
