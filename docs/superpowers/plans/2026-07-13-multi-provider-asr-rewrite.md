# Multi-Provider ASR And Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit Groq, local Qwen, remote Qwen, Doubao, and OpenAI Realtime ASR providers plus OpenAI and DeepSeek rewrite providers without automatic cross-provider fallback.

**Architecture:** Keep the existing Tauri pipeline and Rust provider traits. Split frontend STT and Rewrite provider types, pass the selected providers through Tauri requests, and add explicit provider-specific adapters. Settings receives only the minimum provider/model/base-URL/key controls.

**Tech Stack:** React 19, TypeScript, Tauri 2, Rust, reqwest blocking HTTP/WebSocket, Windows Credential Manager, Vitest, Cargo tests.

## Global Constraints

- Preserve the current uncommitted README and P0 status/matrix changes.
- No beta work, model downloader, bundled model/runtime, provider registry, retry, priority, or automatic fallback.
- Local Qwen is a user-managed loopback service; remote Qwen requires HTTPS.
- Qwen and Doubao are batch-only in this slice; OpenAI Realtime remains the only ASR streaming provider.
- Provider selection is authoritative and secrets remain in the OS credential store.

---

### Task 1: Close current functionality

- [x] Remove the three non-functional privacy controls while retaining backward-compatible false fields.
- [x] Align export, tests, README, status plan, and acceptance matrix.
- [x] Run focused frontend tests and commit the closure slice.

### Task 2: Provider contracts and minimum Settings

- [x] Write failing tests for split provider types, defaults, legacy Streaming migration, readiness, minimal selectors, key deduplication, and no fallback.
- [x] Add STT/Rewrite/Credential provider IDs and provider-specific model/base-URL configuration.
- [x] Pass provider IDs and STT base URL through batch and streaming Tauri requests.
- [x] Make OpenAI Realtime selection replace the old Streaming toggle and record `gpt-realtime-2`.
- [x] Extend keyring status and save commands without exposing secrets.
- [x] Run frontend/Rust focused tests and commit.

### Task 3: DeepSeek Rewrite

- [x] Write failing parser, request, SSE, thinking-mode, routing, usage, and cost tests.
- [x] Add DeepSeek batch and streaming Chat Completions adapters.
- [x] Disable Thinking for Flash and enable it for Pro; ignore reasoning content.
- [x] Support OpenAI Realtime with either OpenAI or DeepSeek streaming rewrite.
- [x] Record exact DeepSeek cache-hit/cache-miss/output token costs when usage is complete.
- [x] Run focused tests and commit.

### Task 4: Local Qwen3-ASR 0.6B

- [x] Write failing loopback URL, multipart request, response, routing, no-fallback, and local-cost tests.
- [x] Add the Qwen transcription adapter and `Qwen/Qwen3-ASR-0.6B` option.
- [x] Enforce loopback-only base URLs and no API key.
- [x] Document the external Python 3.12 service and run focused tests.
- [x] Commit the local Qwen slice.

### Task 5: Remote Qwen3-ASR 1.7B

- [x] Write failing HTTPS, optional Bearer, missing-base-URL, routing, and unknown-cost tests.
- [x] Reuse the Qwen adapter with `Qwen/Qwen3-ASR-1.7B` and an HTTPS base URL.
- [x] Add the optional Qwen API credential without making it a readiness requirement.
- [x] Run focused tests and commit.

### Task 6: Doubao ASR

- [x] Write failing request-header/body, Base64 audio, success, silence, error, routing, and unknown-cost tests.
- [x] Add the current single-`X-Api-Key` Flash recording-file adapter with fixed resource/model values.
- [x] Treat status `20000003` as no speech and sanitize all errors.
- [x] Run focused tests and commit.

### Task 7: Documentation and final verification

- [x] Update README, provider matrix, status plan, acceptance matrix, and bundle description.
- [x] Run `npm test`, `npm run lint`, `npm run build`, `cargo test`, `cargo fmt -- --check`, `cargo clippy --all-targets --all-features -- -D warnings`, and `npm run tauri -- build --debug`.
- [x] Perform adversarial review for fallback leaks, secret leaks, invalid provider combinations, stale model IDs, and incomplete cost reporting.
- [x] Record automated results and leave real-provider/manual checks explicitly pending unless actually performed.
