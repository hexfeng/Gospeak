# Streaming Dictation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an experimental low-latency dictation path that streams microphone PCM to one STT provider, streams OpenAI rewrite deltas, inserts deltas with guarded Windows Unicode input, and falls back to the existing batch STT plus paste path.

**Architecture:** Keep the current batch pipeline as the source of truth. Add a separate streaming path behind `performance.streamingMode`; the path records the same temp WAV for fallback, feeds PCM chunks to one OpenAI realtime transcription session, then streams OpenAI Responses deltas into a guarded inserter. Any failure before text is inserted falls back to `run_audio_file_dictation`; failures after partial insertion copy final text to clipboard and show a warning instead of duplicating text.

**Tech Stack:** Tauri 2, Rust 1.77, React/TypeScript, cpal, hound, reqwest blocking SSE, Windows SendInput. Add only `base64` and a WebSocket crate for OpenAI realtime STT.

---

## Scope

Build the smallest useful version of direction B:

- One streaming STT provider: OpenAI realtime transcription with `gpt-realtime-whisper`.
- One streaming rewrite provider: existing OpenAI Responses endpoint with `stream: true`.
- One streaming insert target: Windows Unicode `SendInput`.
- Existing Groq file STT + OpenAI batch rewrite + clipboard paste remains untouched and is the fallback.

Skip in this plan:

- Multiple streaming STT providers.
- Local ASR model download/runtime.
- Streaming Speak to Edit.
- Cross-platform streaming insertion.
- Provider marketplace or provider abstraction rewrite.

## External API Facts To Respect

- OpenAI realtime transcription uses a `type: "transcription"` session and can receive `audio/pcm`.
- OpenAI docs currently specify 24 kHz mono PCM for `audio/pcm` in realtime transcription sessions.
- OpenAI transcript deltas arrive as `conversation.item.input_audio_transcription.delta`; final transcript arrives as `conversation.item.input_audio_transcription.completed`.
- OpenAI Responses streaming uses `stream: true`; text deltas arrive as `response.output_text.delta`.

## File Structure

- Modify `src/domain/config.ts`
  - Add `performance.streamingMode: boolean`.
  - Keep defaults off.

- Modify `src/App.tsx`
  - Add a settings toggle for experimental streaming.
  - Branch dictation stop flow: try streaming first when enabled and eligible; otherwise call existing batch flow.
  - Record streaming diagnostics in the existing latency panel.

- Modify `src/lib/tauri.ts`
  - Add `runStreamingDictation`, `typeTextChunk`, and streaming result types.

- Modify `src-tauri/Cargo.toml`
  - Add direct dependencies required for realtime WebSocket audio: `base64` and one WebSocket client crate.

- Modify `src-tauri/src/audio.rs`
  - Keep current WAV writer.
  - Add optional PCM chunk fanout for 24 kHz mono i16 chunks.
  - Keep `stop()` returning the WAV path for fallback.

- Create `src-tauri/src/streaming.rs`
  - Own OpenAI realtime transcription session.
  - Own OpenAI Responses streaming rewrite wrapper.
  - Own streaming pipeline orchestration.

- Modify `src-tauri/src/clipboard.rs`
  - Add Windows-only Unicode chunk typing.
  - Keep existing clipboard paste unchanged.

- Modify `src-tauri/src/lib.rs`
  - Register new Tauri commands.
  - Load profile/dictionary context the same way as `run_audio_file_dictation`.
  - Store usage event for successful streaming runs with `stt_provider = "openai-realtime"` and `llm_provider = "openai"`.

- Tests:
  - Modify `src/domain/config.test.ts`.
  - Modify `src/App.test.tsx`.
  - Modify `src-tauri/src/audio.rs` tests.
  - Add `src-tauri/src/streaming.rs` unit tests for SSE/event parsing.
  - Modify `src-tauri/src/clipboard.rs` tests for chunk validation.

---

### Task 1: Add Streaming Config And Frontend API Shape

**Files:**
- Modify: `src/domain/config.ts`
- Modify: `src/domain/config.test.ts`
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Write the failing config test**

Add to `src/domain/config.test.ts`:

```ts
it("defaults experimental streaming dictation off", () => {
  expect(DEFAULT_APP_CONFIG.performance.streamingMode).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- src/domain/config.test.ts
```

Expected: fail because `streamingMode` is not defined.

- [ ] **Step 3: Add the minimal config field**

In `src/domain/config.ts`, change `AppConfig.performance`:

```ts
performance: {
  fastMode: boolean;
  speakToEdit: boolean;
  streamingMode: boolean;
};
```

Change `DEFAULT_APP_CONFIG.performance`:

```ts
performance: {
  fastMode: false,
  speakToEdit: false,
  streamingMode: false,
},
```

- [ ] **Step 4: Add frontend Tauri types**

In `src/lib/tauri.ts`, add:

```ts
export type StreamingPipelineRequest = AudioFilePipelineRequest & {
  streaming_insert: boolean;
};

export type StreamingPipelineResult = PipelineResult & {
  streaming_used: boolean;
  inserted_streaming: boolean;
  first_stt_delta_ms?: number | null;
  first_rewrite_delta_ms?: number | null;
  first_insert_ms?: number | null;
  warning?: string | null;
};

export async function runStreamingDictation(
  request: StreamingPipelineRequest,
): Promise<StreamingPipelineResult> {
  if (!hasTauriRuntime()) {
    return {
      text: "Browser preview streaming dictation text.",
      profile_id: request.profile_id,
      rewrite_fallback_used: false,
      stt_latency_ms: 80,
      rewrite_latency_ms: 60,
      audio_seconds: 1,
      audio_file_bytes: 32000,
      fast_path_used: request.skip_rewrite,
      streaming_used: true,
      inserted_streaming: request.streaming_insert,
      first_stt_delta_ms: 120,
      first_rewrite_delta_ms: 180,
      first_insert_ms: request.streaming_insert ? 220 : null,
    };
  }

  return invoke<StreamingPipelineResult>("run_streaming_dictation", { request });
}

export async function typeTextChunk(text: string): Promise<void> {
  if (!hasTauriRuntime()) {
    return;
  }

  return invoke<void>("type_text_chunk", { text });
}
```

- [ ] **Step 5: Run frontend tests**

Run:

```powershell
npm test -- src/domain/config.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add src/domain/config.ts src/domain/config.test.ts src/lib/tauri.ts
git commit -m "feat: add streaming dictation config shape"
```

---

### Task 2: Add Streaming Toggle Without Changing Batch Behavior

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write the failing UI test**

Add to `src/App.test.tsx`:

```ts
it("renders experimental streaming dictation toggle", async () => {
  render(<App />);

  expect(
    await screen.findByRole("checkbox", {
      name: /experimental streaming dictation/i,
    }),
  ).not.toBeChecked();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- src/App.test.tsx -t "experimental streaming dictation"
```

Expected: fail because the toggle is not rendered.

- [ ] **Step 3: Add the minimal toggle**

In `src/App.tsx`, near the existing `changeFastMode` and `changeSpeakToEdit` handlers, add:

```ts
async function changeStreamingMode(enabled: boolean) {
  const performanceConfig = { ...config.performance, streamingMode: enabled };
  setConfig((current) => ({ ...current, performance: performanceConfig }));
  await persistPreference("performance", performanceConfig);
}
```

In the performance panel near the existing Fast dictation and Speak to Edit toggles, add a checkbox row using the same local component/pattern:

```tsx
<label className="toggle-row">
  <input
    type="checkbox"
    checked={config.performance.streamingMode}
    onChange={(event) => void changeStreamingMode(event.target.checked)}
  />
  <span>
    <strong>Experimental streaming dictation</strong>
    <small>Streams STT and rewrite when available; batch dictation remains the fallback.</small>
  </span>
</label>
```

- [ ] **Step 4: Run the focused test**

Run:

```powershell
npm test -- src/App.test.tsx -t "experimental streaming dictation"
```

Expected: pass.

- [ ] **Step 5: Run the existing fast-mode test to protect batch behavior**

Run:

```powershell
npm test -- src/App.test.tsx -t "sends fast dictation requests"
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add src/App.tsx src/App.test.tsx
git commit -m "feat: add streaming dictation toggle"
```

---

### Task 3: Add PCM Chunk Fanout To Recorder

**Files:**
- Modify: `src-tauri/src/audio.rs`

- [ ] **Step 1: Write the failing audio test**

Add to `src-tauri/src/audio.rs` tests:

```rust
#[test]
fn resamples_stereo_48khz_to_24khz_mono_pcm_chunks() {
    let input = vec![1000_i16, 3000_i16, 2000, 4000, 3000, 5000, 4000, 6000];
    let chunks = super::pcm_chunks_for_streaming(&input, 48_000, 2, 24_000, 2);

    assert_eq!(chunks, vec![vec![2000, 3000], vec![4000, 5000]]);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cargo test -p gospeak resamples_stereo_48khz_to_24khz_mono_pcm_chunks
```

Expected: fail because `pcm_chunks_for_streaming` does not exist.

- [ ] **Step 3: Add minimal chunk conversion helpers**

In `src-tauri/src/audio.rs`, add:

```rust
pub const STREAMING_SAMPLE_RATE: u32 = 24_000;
const STREAMING_CHUNK_SAMPLES: usize = 4_800;

fn pcm_chunks_for_streaming(
    samples: &[i16],
    source_rate: u32,
    source_channels: u16,
    target_rate: u32,
    chunk_samples: usize,
) -> Vec<Vec<i16>> {
    if samples.is_empty() || source_channels == 0 || source_rate == 0 || target_rate == 0 {
        return Vec::new();
    }

    let channels = usize::from(source_channels);
    let mono = samples
        .chunks(channels)
        .filter(|frame| frame.len() == channels)
        .map(|frame| {
            let sum: i32 = frame.iter().map(|sample| i32::from(*sample)).sum();
            (sum / i32::try_from(channels).unwrap_or(1)) as i16
        })
        .collect::<Vec<_>>();

    if mono.is_empty() {
        return Vec::new();
    }

    let target_len =
        ((mono.len() as f64) * f64::from(target_rate) / f64::from(source_rate)).round() as usize;
    let resampled = (0..target_len)
        .map(|target_index| {
            let source_index =
                ((target_index as f64) * f64::from(source_rate) / f64::from(target_rate)).floor()
                    as usize;
            mono.get(source_index)
                .or_else(|| mono.last())
                .copied()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();

    resampled
        .chunks(chunk_samples.max(1))
        .map(|chunk| chunk.to_vec())
        .collect()
}
```

- [ ] **Step 4: Add optional consumer type without wiring it yet**

In `src-tauri/src/audio.rs`, add:

```rust
pub type PcmChunkConsumer = Arc<dyn Fn(Vec<i16>) + Send + Sync + 'static>;
```

Change `start_recording_to_temp()` into a wrapper:

```rust
pub fn start_recording_to_temp() -> Result<ActiveRecording, String> {
    start_recording_to_temp_with_consumer(None)
}

pub fn start_recording_to_temp_with_consumer(
    consumer: Option<PcmChunkConsumer>,
) -> Result<ActiveRecording, String> {
    // move the current start_recording_to_temp body here
}
```

Inside each cpal callback, convert the typed samples to `Vec<i16>`, write them to WAV as today, and if `consumer` is present, call `pcm_chunks_for_streaming(&converted, config.sample_rate().0, config.channels(), STREAMING_SAMPLE_RATE, STREAMING_CHUNK_SAMPLES)` and pass each chunk to the consumer.

- [ ] **Step 5: Run audio tests**

Run:

```powershell
cargo test -p gospeak audio
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/audio.rs
git commit -m "feat: emit streaming pcm chunks from recorder"
```

---

### Task 4: Add Windows Unicode Chunk Typing

**Files:**
- Modify: `src-tauri/src/clipboard.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing validation test**

Add to `src-tauri/src/clipboard.rs` tests:

```rust
#[test]
fn rejects_empty_streaming_type_chunk() {
    assert!(super::validate_type_text_chunk("  ").is_err());
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cargo test -p gospeak rejects_empty_streaming_type_chunk
```

Expected: fail because `validate_type_text_chunk` does not exist.

- [ ] **Step 3: Add validation and command target**

In `src-tauri/src/clipboard.rs`, add:

```rust
fn validate_type_text_chunk(text: &str) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("Cannot type empty text chunk".to_string());
    }
    Ok(())
}

pub fn type_text_chunk(text: &str) -> Result<(), String> {
    validate_type_text_chunk(text)?;
    inject_unicode_text(text)
}
```

Add Windows implementation:

```rust
#[cfg(target_os = "windows")]
fn inject_unicode_text(text: &str) -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
        KEYEVENTF_UNICODE,
    };

    let mut inputs = Vec::new();
    for unit in text.encode_utf16() {
        inputs.push(INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(0),
                    wScan: unit,
                    dwFlags: KEYEVENTF_UNICODE,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        });
        inputs.push(INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(0),
                    wScan: unit,
                    dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        });
    }

    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent as usize == inputs.len() {
        Ok(())
    } else {
        Err(format!("SendInput sent {sent} of {} events", inputs.len()))
    }
}

#[cfg(not(target_os = "windows"))]
fn inject_unicode_text(_text: &str) -> Result<(), String> {
    Err("Streaming insertion is only implemented on Windows".to_string())
}
```

- [ ] **Step 4: Register the command**

In `src-tauri/src/lib.rs`, add:

```rust
#[tauri::command]
fn type_text_chunk(text: String) -> Result<(), String> {
    clipboard::type_text_chunk(&text)
}
```

Add `type_text_chunk` to `tauri::generate_handler![...]`.

- [ ] **Step 5: Run clipboard tests**

Run:

```powershell
cargo test -p gospeak clipboard
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/clipboard.rs src-tauri/src/lib.rs
git commit -m "feat: add guarded unicode chunk typing"
```

---

### Task 5: Add OpenAI Realtime STT Event Parsing

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/streaming.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add dependencies**

In `src-tauri/Cargo.toml`, add:

```toml
base64 = "0.22"
tungstenite = { version = "0.24", default-features = false, features = ["rustls-tls-webpki-roots"] }
```

- [ ] **Step 2: Write failing parser tests**

Create `src-tauri/src/streaming.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq)]
enum TranscriptionEvent {
    Delta(String),
    Completed(String),
    Ignored,
}

fn parse_transcription_event(body: &str) -> Result<TranscriptionEvent, String> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|error| format!("Invalid realtime event JSON: {error}"))?;
    match value.get("type").and_then(|item| item.as_str()) {
        Some("conversation.item.input_audio_transcription.delta") => Ok(TranscriptionEvent::Delta(
            value
                .get("delta")
                .and_then(|item| item.as_str())
                .unwrap_or_default()
                .to_string(),
        )),
        Some("conversation.item.input_audio_transcription.completed") => {
            Ok(TranscriptionEvent::Completed(
                value
                    .get("transcript")
                    .and_then(|item| item.as_str())
                    .unwrap_or_default()
                    .to_string(),
            ))
        }
        _ => Ok(TranscriptionEvent::Ignored),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_realtime_transcription_delta() {
        let event = parse_transcription_event(
            r#"{"type":"conversation.item.input_audio_transcription.delta","delta":"hello"}"#,
        )
        .unwrap();

        assert_eq!(event, TranscriptionEvent::Delta("hello".to_string()));
    }

    #[test]
    fn parses_realtime_transcription_completion() {
        let event = parse_transcription_event(
            r#"{"type":"conversation.item.input_audio_transcription.completed","transcript":"hello world"}"#,
        )
        .unwrap();

        assert_eq!(event, TranscriptionEvent::Completed("hello world".to_string()));
    }
}
```

In `src-tauri/src/lib.rs`, add:

```rust
pub mod streaming;
```

- [ ] **Step 3: Run parser tests**

Run:

```powershell
cargo test -p gospeak streaming
```

Expected: pass.

- [ ] **Step 4: Commit**

```powershell
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/streaming.rs src-tauri/src/lib.rs
git commit -m "feat: parse streaming transcription events"
```

---

### Task 6: Implement One OpenAI Realtime STT Session

**Files:**
- Modify: `src-tauri/src/streaming.rs`
- Modify: `src-tauri/src/provider.rs`

- [ ] **Step 1: Add request/result structs**

In `src-tauri/src/streaming.rs`, add:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StreamingPipelineRequest {
    pub audio_path: String,
    pub profile_id: String,
    pub stt_model: String,
    pub rewrite_model: String,
    #[serde(default)]
    pub selected_text: Option<String>,
    #[serde(default)]
    pub skip_rewrite: bool,
    #[serde(default)]
    pub streaming_insert: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StreamingPipelineResult {
    pub text: String,
    pub profile_id: String,
    pub rewrite_fallback_used: bool,
    pub stt_latency_ms: u64,
    pub rewrite_latency_ms: Option<u64>,
    pub audio_seconds: Option<f64>,
    pub audio_file_bytes: Option<u64>,
    pub fast_path_used: bool,
    pub rewrite_input_tokens: Option<u64>,
    pub rewrite_output_tokens: Option<u64>,
    pub streaming_used: bool,
    pub inserted_streaming: bool,
    pub first_stt_delta_ms: Option<u64>,
    pub first_rewrite_delta_ms: Option<u64>,
    pub first_insert_ms: Option<u64>,
    pub warning: Option<String>,
}
```

- [ ] **Step 2: Add OpenAI realtime session skeleton**

In `src-tauri/src/streaming.rs`, add:

```rust
struct OpenAiRealtimeTranscription {
    api_key: String,
    model: String,
}

impl OpenAiRealtimeTranscription {
    fn new(api_key: String, model: String) -> Self {
        Self { api_key, model }
    }

    fn transcribe_chunks<I>(&self, chunks: I) -> Result<(String, Option<u64>), String>
    where
        I: IntoIterator<Item = Vec<i16>>,
    {
        let started = std::time::Instant::now();
        let mut first_delta_ms = None;
        let mut final_transcript = String::new();

        let request = openai_realtime_request(&self.api_key)?;
        let (mut socket, _) = tungstenite::connect(request)
        .map_err(|error| format!("Cannot connect OpenAI realtime transcription: {error}"))?;

        socket
            .send(tungstenite::Message::Text(realtime_session_update(&self.model)))
            .map_err(|error| format!("Cannot configure OpenAI realtime transcription: {error}"))?;

        for chunk in chunks {
            let audio = pcm_i16_base64(&chunk);
            socket
                .send(tungstenite::Message::Text(format!(
                    r#"{{"type":"input_audio_buffer.append","audio":"{audio}"}}"#
                )))
                .map_err(|error| format!("Cannot send realtime audio chunk: {error}"))?;
        }

        socket
            .send(tungstenite::Message::Text(
                r#"{"type":"input_audio_buffer.commit"}"#.to_string(),
            ))
            .map_err(|error| format!("Cannot commit realtime audio buffer: {error}"))?;

        while final_transcript.is_empty() {
            let message = socket
                .read()
                .map_err(|error| format!("Cannot read realtime transcription event: {error}"))?;
            if let tungstenite::Message::Text(text) = message {
                match parse_transcription_event(&text)? {
                    TranscriptionEvent::Delta(delta) => {
                        if first_delta_ms.is_none() && !delta.trim().is_empty() {
                            first_delta_ms = Some(started.elapsed().as_millis() as u64);
                        }
                    }
                    TranscriptionEvent::Completed(transcript) => {
                        final_transcript = transcript;
                    }
                    TranscriptionEvent::Ignored => {}
                }
            }
        }

        Ok((final_transcript, first_delta_ms))
    }
}
```

- [ ] **Step 3: Add request auth and session config helpers**

Add:

```rust
fn openai_realtime_request(api_key: &str) -> Result<tungstenite::http::Request<()>, String> {
    tungstenite::http::Request::builder()
        .uri("wss://api.openai.com/v1/realtime?model=gpt-realtime-2")
        .header("Authorization", format!("Bearer {api_key}"))
        .body(())
        .map_err(|error| format!("Cannot build OpenAI realtime request: {error}"))
}

fn realtime_session_update(transcription_model: &str) -> String {
    serde_json::json!({
        "type": "session.update",
        "session": {
            "type": "transcription",
            "audio": {
                "input": {
                    "format": {
                        "type": "audio/pcm",
                        "rate": 24000
                    },
                    "transcription": {
                        "model": transcription_model
                    },
                    "turn_detection": null
                }
            }
        }
    })
    .to_string()
}
```

- [ ] **Step 4: Add PCM base64 helper test**

Add test:

```rust
#[test]
fn encodes_pcm_i16_as_little_endian_base64() {
    assert_eq!(super::pcm_i16_base64(&[1, 256]), "AQAAQA==");
}
```

Add helper:

```rust
fn pcm_i16_base64(samples: &[i16]) -> String {
    use base64::Engine;

    let bytes = samples
        .iter()
        .flat_map(|sample| sample.to_le_bytes())
        .collect::<Vec<_>>();
    base64::engine::general_purpose::STANDARD.encode(bytes)
}
```

- [ ] **Step 5: Run tests**

Run:

```powershell
cargo test -p gospeak streaming
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/streaming.rs src-tauri/src/provider.rs
git commit -m "feat: add openai realtime transcription session"
```

---

### Task 7: Add OpenAI Responses Streaming Rewrite

**Files:**
- Modify: `src-tauri/src/provider.rs`
- Modify: `src-tauri/src/streaming.rs`

- [ ] **Step 1: Write failing SSE parser test**

Add to `src-tauri/src/provider.rs` tests:

```rust
#[test]
fn parses_openai_response_text_delta_from_sse_line() {
    let line = r#"data: {"type":"response.output_text.delta","delta":"hello"}"#;

    assert_eq!(
        super::parse_openai_streaming_text_delta(line).unwrap(),
        Some("hello".to_string())
    );
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cargo test -p gospeak parses_openai_response_text_delta_from_sse_line
```

Expected: fail because parser does not exist.

- [ ] **Step 3: Add SSE delta parser**

In `src-tauri/src/provider.rs`, add:

```rust
fn parse_openai_streaming_text_delta(line: &str) -> Result<Option<String>, ProviderError> {
    let Some(json) = line.strip_prefix("data: ") else {
        return Ok(None);
    };
    if json.trim() == "[DONE]" {
        return Ok(None);
    }
    let value: serde_json::Value = serde_json::from_str(json).map_err(|error| {
        ProviderError::ProviderResponse(format!("OpenAI streaming rewrite returned invalid JSON: {error}"))
    })?;
    if value.get("type").and_then(|item| item.as_str()) == Some("response.output_text.delta") {
        return Ok(value
            .get("delta")
            .and_then(|item| item.as_str())
            .map(|value| value.to_string()));
    }
    Ok(None)
}
```

- [ ] **Step 4: Add streaming rewrite method**

In `src-tauri/src/provider.rs`, add an inherent method on `OpenAiRewriteProvider`:

```rust
pub fn rewrite_streaming<F>(
    &self,
    input: &RewriteInput,
    mut on_delta: F,
) -> Result<RewriteOutput, ProviderError>
where
    F: FnMut(&str) -> Result<(), ProviderError>,
{
    if input.transcript.trim().is_empty() {
        return Err(ProviderError::InvalidInput(
            "Transcript cannot be empty".to_string(),
        ));
    }

    let body = serde_json::json!({
      "model": input.model,
      "instructions": input.system_prompt,
      "input": input.rendered_prompt,
      "stream": true
    });

    let response = self
        .client
        .post(format!("{}/responses", self.base_url))
        .bearer_auth(&self.api_key)
        .json(&body)
        .send()
        .map_err(|error| ProviderError::Http(format!("OpenAI streaming rewrite request failed: {error}")))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().map_err(|error| {
            ProviderError::Http(format!("OpenAI streaming rewrite response read failed: {error}"))
        })?;
        return Err(ProviderError::Http(format!(
            "OpenAI streaming rewrite returned HTTP {status}: {}",
            sanitize_provider_body(&body)
        )));
    }

    let mut full_text = String::new();
    let reader = std::io::BufReader::new(response);
    for line in std::io::BufRead::lines(reader) {
        let line = line.map_err(|error| {
            ProviderError::Http(format!("OpenAI streaming rewrite read failed: {error}"))
        })?;
        if let Some(delta) = parse_openai_streaming_text_delta(&line)? {
            full_text.push_str(&delta);
            on_delta(&delta)?;
        }
    }

    Ok(RewriteOutput {
        text: full_text,
        usage: None,
    })
}
```

- [ ] **Step 5: Run provider tests**

Run:

```powershell
cargo test -p gospeak provider
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/provider.rs src-tauri/src/streaming.rs
git commit -m "feat: stream openai rewrite deltas"
```

---

### Task 8: Wire Streaming Pipeline Command With Fallback Boundary

**Files:**
- Modify: `src-tauri/src/streaming.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add eligibility test**

Add to `src-tauri/src/streaming.rs` tests:

```rust
#[test]
fn disables_streaming_for_speak_to_edit_request() {
    let request = StreamingPipelineRequest {
        audio_path: "x.wav".to_string(),
        profile_id: "normal".to_string(),
        stt_model: "gpt-realtime-whisper".to_string(),
        rewrite_model: "gpt-5-nano".to_string(),
        selected_text: Some("selected".to_string()),
        skip_rewrite: false,
        streaming_insert: true,
    };

    assert!(!streaming_eligible(&request));
}
```

- [ ] **Step 2: Add eligibility function**

In `src-tauri/src/streaming.rs`, add:

```rust
fn streaming_eligible(request: &StreamingPipelineRequest) -> bool {
    request.selected_text.is_none()
}
```

- [ ] **Step 3: Add Tauri command**

In `src-tauri/src/lib.rs`, add:

```rust
#[tauri::command]
fn run_streaming_dictation(
    app: tauri::AppHandle,
    request: streaming::StreamingPipelineRequest,
) -> Result<streaming::StreamingPipelineResult, String> {
    if !streaming::streaming_eligible(&request) {
        return Err("Streaming dictation is disabled for Speak to Edit.".to_string());
    }

    let database = open_app_database(&app)?;
    let profile = storage::get_enabled_profile(&database, &request.profile_id)?;
    let dictionary_terms = storage::dictionary_prompt_terms(&database)?;
    streaming::run_streaming_pipeline(
        request,
        provider::PipelineContext {
            profile_id: profile.id,
            profile_name: profile.name,
            system_prompt: profile.system_prompt,
            user_prompt_template: profile.user_prompt_template,
            target_language: profile.target_language,
            dictionary_terms,
            selected_text: None,
        },
    )
    .map_err(|error| error.to_string())
}
```

Add `run_streaming_dictation` to `generate_handler![...]`.

- [ ] **Step 4: Implement `run_streaming_pipeline` without streaming insertion first**

In `src-tauri/src/streaming.rs`, add `run_streaming_pipeline` that:

- Reads OpenAI key using a public helper from `provider.rs`.
- Opens OpenAI realtime transcription.
- Accepts `pcm_chunks: Vec<Vec<i16>>`; for this task the command passes an empty vector and returns `ProviderError::InvalidInput("No streaming audio chunks were captured".to_string())`.
- Builds `RewriteInput` with `render_user_prompt` exposed from `provider.rs`.
- Calls `OpenAiRewriteProvider::rewrite_streaming`.
- Returns `StreamingPipelineResult`.

- [ ] **Step 5: Run Rust tests**

Run:

```powershell
cargo test -p gospeak streaming
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/streaming.rs src-tauri/src/lib.rs src-tauri/src/provider.rs
git commit -m "feat: add streaming dictation command"
```

---

### Task 9: Connect Recorder Chunks To Streaming Session

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/audio.rs`
- Modify: `src-tauri/src/streaming.rs`

- [ ] **Step 1: Change recording state shape**

In `src-tauri/src/lib.rs`, extend `RecordingState`:

```rust
#[derive(Default)]
struct RecordingState {
    active: Mutex<Option<audio::ActiveRecording>>,
    streaming_chunks: std::sync::Arc<Mutex<Vec<Vec<i16>>>>,
}
```

- [ ] **Step 2: Start recording with a consumer only when needed**

Add a new command:

```rust
#[tauri::command]
fn start_streaming_recording(state: tauri::State<'_, RecordingState>) -> Result<String, String> {
    let chunks = state.streaming_chunks.clone();
    chunks
        .lock()
        .map_err(|_| "Streaming chunk lock poisoned".to_string())?
        .clear();
    let consumer: audio::PcmChunkConsumer = std::sync::Arc::new(move |chunk| {
        if let Ok(mut guard) = chunks.lock() {
            guard.push(chunk);
        }
    });
    let recording = audio::start_recording_to_temp_with_consumer(Some(consumer))?;
    let path = recording.path.to_string_lossy().to_string();
    *state
        .active
        .lock()
        .map_err(|_| "Recorder lock poisoned".to_string())? = Some(recording);
    Ok(path)
}
```

- [ ] **Step 3: Stop recording and pass chunks to streaming pipeline**

In `run_streaming_dictation`, read and clone `state.streaming_chunks` after `stop_recording` has completed. Pass the chunks into `streaming::run_streaming_pipeline`.

- [ ] **Step 4: Add frontend API**

In `src/lib/tauri.ts`, add:

```ts
export async function startStreamingRecording(): Promise<string> {
  if (!hasTauriRuntime()) {
    return "browser-preview-gospeak.wav";
  }

  return invoke<string>("start_streaming_recording");
}
```

- [ ] **Step 5: Run Rust tests**

Run:

```powershell
cargo test -p gospeak
```

Expected: pass, except the existing ignored native paste smoke remains ignored.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/lib.rs src-tauri/src/audio.rs src-tauri/src/streaming.rs src/lib/tauri.ts
git commit -m "feat: connect recorder chunks to streaming dictation"
```

---

### Task 10: Branch Frontend Dictation Flow To Streaming With Batch Fallback

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write fallback test**

Add to `src/App.test.tsx`:

```ts
it("falls back to batch dictation when streaming dictation fails before insertion", async () => {
  vi.mocked(runStreamingDictation).mockRejectedValueOnce(
    new Error("stream unavailable"),
  );

  render(<App />);

  fireEvent.click(await screen.findByRole("checkbox", { name: /experimental streaming dictation/i }));
  fireEvent.click(screen.getByRole("button", { name: /start dictation/i }));
  fireEvent.click(await screen.findByRole("button", { name: /stop dictation/i }));

  await waitFor(() => expect(runStreamingDictation).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(runAudioFileDictation).toHaveBeenCalledTimes(1));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- src/App.test.tsx -t "falls back to batch dictation"
```

Expected: fail because the branch does not exist.

- [ ] **Step 3: Add streaming branch**

In `src/App.tsx`, import `runStreamingDictation` and `startStreamingRecording`.

On start:

```ts
const start = config.performance.streamingMode
  ? startStreamingRecording
  : startRecording;
const path = await start();
```

On stop, after building the request:

```ts
let result: PipelineResult;
let insertedStreaming = false;
try {
  if (config.performance.streamingMode && selectedTextForEditRef.current == null) {
    const streamingResult = await runStreamingDictation({
      ...request,
      streaming_insert: true,
    });
    result = streamingResult;
    insertedStreaming = streamingResult.inserted_streaming;
  } else {
    result = await runAudioFileDictation(request);
  }
} catch (error) {
  if (config.performance.streamingMode) {
    result = await runAudioFileDictation(request);
  } else {
    throw error;
  }
}
```

Before paste:

```ts
if (!insertedStreaming) {
  const clipboard = await copyTextForPaste(result.text);
  // keep existing completion handling
}
```

If `insertedStreaming` is true, skip `copyTextForPaste` and use message:

```ts
const clipboard = {
  copied: false,
  pasteAttempted: false,
  message: "Streaming dictation inserted text into the active app.",
};
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npm test -- src/App.test.tsx -t "falls back to batch dictation"
npm test -- src/App.test.tsx -t "sends fast dictation requests"
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add src/App.tsx src/App.test.tsx
git commit -m "feat: route dictation through streaming fallback"
```

---

### Task 11: Add Streaming Insertion To Pipeline

**Files:**
- Modify: `src-tauri/src/streaming.rs`
- Modify: `src-tauri/src/clipboard.rs`

- [ ] **Step 1: Add inserter abstraction only inside tests**

In `src-tauri/src/streaming.rs`, add a small local type alias:

```rust
type TextInserter<'a> = &'a dyn Fn(&str) -> Result<(), String>;
```

Do not create a project-wide insertion trait.

- [ ] **Step 2: Add unit test for no-duplicate fallback rule**

Add:

```rust
#[test]
fn marks_partial_insert_warning_after_insert_failure() {
    let mut inserted = String::new();
    let inserter = |text: &str| -> Result<(), String> {
        if inserted.is_empty() {
            inserted.push_str(text);
            Ok(())
        } else {
            Err("input lost focus".to_string())
        }
    };

    let result = stream_deltas_to_inserter(["hello", " world"], &inserter).unwrap();

    assert_eq!(inserted, "hello");
    assert_eq!(result.inserted_any, true);
    assert_eq!(
        result.warning.as_deref(),
        Some("Streaming insertion stopped after partial text was inserted. Final text was copied to clipboard.")
    );
}
```

- [ ] **Step 3: Add minimal inserter helper**

Add:

```rust
struct InsertStreamResult {
    inserted_any: bool,
    warning: Option<String>,
}

fn stream_deltas_to_inserter<I>(
    deltas: I,
    inserter: TextInserter<'_>,
) -> Result<InsertStreamResult, String>
where
    I: IntoIterator,
    I::Item: AsRef<str>,
{
    let mut inserted_any = false;
    for delta in deltas {
        let delta = delta.as_ref();
        if delta.trim().is_empty() {
            continue;
        }
        if let Err(error) = inserter(delta) {
            if inserted_any {
                log::warn!("Streaming insertion failed after partial insert: {error}");
                return Ok(InsertStreamResult {
                    inserted_any: true,
                    warning: Some(
                        "Streaming insertion stopped after partial text was inserted. Final text was copied to clipboard."
                            .to_string(),
                    ),
                });
            }
            return Err(error);
        }
        inserted_any = true;
    }
    Ok(InsertStreamResult {
        inserted_any,
        warning: None,
    })
}
```

- [ ] **Step 4: Wire rewrite deltas to `clipboard::type_text_chunk`**

Inside `run_streaming_pipeline`, pass an `on_delta` closure to `rewrite_streaming`:

```rust
let mut inserted_streaming = false;
let mut first_insert_ms = None;
let rewrite_started = std::time::Instant::now();
let output = rewrite_provider.rewrite_streaming(&rewrite_input, |delta| {
    if request.streaming_insert {
        clipboard::type_text_chunk(delta).map_err(ProviderError::Http)?;
        inserted_streaming = true;
        if first_insert_ms.is_none() {
            first_insert_ms = Some(rewrite_started.elapsed().as_millis() as u64);
        }
    }
    Ok(())
});
```

If `output` returns an error and `inserted_streaming` is false, return the error so frontend batch fallback can run. If `inserted_streaming` is true, return a `StreamingPipelineResult` with `warning` and no automatic paste.

- [ ] **Step 5: Run tests**

Run:

```powershell
cargo test -p gospeak streaming clipboard
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/streaming.rs src-tauri/src/clipboard.rs
git commit -m "feat: insert streaming rewrite deltas"
```

---

### Task 12: Diagnostics, Usage Event, And Final Verification

**Files:**
- Modify: `src/App.tsx`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/storage.rs` only if current usage schema rejects the provider labels.
- Modify: `docs/P0_STATUS_PLAN.md`

- [ ] **Step 1: Add diagnostics fields to UI state**

In `src/App.tsx`, extend `DictationDiagnostics`:

```ts
firstSttDeltaMs: number | null;
firstRewriteDeltaMs: number | null;
firstInsertMs: number | null;
streamingUsed: boolean;
```

Render the values in `LatencyDiagnostics` using existing `Metric`:

```tsx
<Metric label="First STT" value={formatMs(diagnostics.firstSttDeltaMs)} />
<Metric label="First rewrite" value={formatMs(diagnostics.firstRewriteDeltaMs)} />
<Metric label="First insert" value={formatMs(diagnostics.firstInsertMs)} />
```

- [ ] **Step 2: Store usage event**

In `run_streaming_dictation`, after success insert a usage record with:

```rust
stt_provider: "openai-realtime".to_string(),
stt_model: request.stt_model.clone(),
llm_provider: "openai".to_string(),
llm_model: request.rewrite_model.clone(),
```

Set cost estimates to `None` until the app has verified realtime pricing and streaming usage units.

- [ ] **Step 3: Update status docs**

In `docs/P0_STATUS_PLAN.md`, add one short bullet under deferred/performance work:

```markdown
- Experimental streaming dictation path planned behind `performance.streamingMode`: OpenAI realtime STT, OpenAI streaming rewrite, guarded Windows Unicode insertion, and current batch dictation fallback.
```

- [ ] **Step 4: Run frontend verification**

Run:

```powershell
npm test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 5: Run Rust verification**

Run:

```powershell
cargo fmt -- --check
cargo test
cargo clippy --all-targets --all-features -- -D warnings
```

Expected: all pass, except the existing ignored native paste smoke remains ignored.

- [ ] **Step 6: Run package verification**

Run:

```powershell
npm run tauri -- build --debug
```

Expected: debug package builds. If Windows reports the binary is locked, close the running Gospeak debug app and rerun the same command.

- [ ] **Step 7: Commit**

```powershell
git add src/App.tsx src-tauri/src/lib.rs src-tauri/src/storage.rs docs/P0_STATUS_PLAN.md
git commit -m "feat: surface streaming dictation diagnostics"
```

---

## Acceptance Criteria

- With streaming off, existing dictation behavior and tests stay unchanged.
- With streaming on and no selected text, app attempts streaming first.
- If streaming fails before any inserted text, app falls back to current batch dictation and paste.
- If streaming insertion typed partial text and then fails, app does not paste duplicate full text.
- Speak to Edit continues using current batch path.
- Latency panel shows first STT delta, first rewrite delta, and first insert when available.
- Usage history can show streaming runs without breaking existing cost totals.

## Ponytail Review

- Kept one streaming STT provider.
- Kept existing provider config shape mostly intact.
- Kept batch pipeline untouched.
- Added only dependencies required by WebSocket realtime audio and base64 PCM.
- Skipped local models, provider marketplace, cross-platform insertion, and streaming Speak to Edit.
