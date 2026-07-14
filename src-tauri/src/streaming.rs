use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::{
    io::ErrorKind,
    net::TcpStream,
    time::{Duration, Instant},
};
use tungstenite::{http::Request, stream::MaybeTlsStream, Message};

use crate::{clipboard, provider};

const OPENAI_REALTIME_URL: &str = "wss://api.openai.com/v1/realtime?model=gpt-realtime-2";
const OPENAI_TRANSCRIPT_TIMEOUT: Duration = Duration::from_secs(30);
const PARTIAL_STREAMING_INSERT_WARNING: &str =
    "Streaming insertion stopped after partial text was inserted. Final text was copied to clipboard.";
const PARTIAL_STREAMING_INSERT_COPY_FAILED_WARNING: &str =
    "Streaming insertion stopped after partial text was inserted. Final text could not be copied to clipboard.";

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct StreamingPipelineRequest {
    pub audio_path: String,
    pub profile_id: String,
    pub stt_provider: String,
    #[serde(default)]
    pub stt_base_url: Option<String>,
    pub stt_model: String,
    pub rewrite_provider: String,
    pub rewrite_model: String,
    #[serde(default)]
    pub selected_text: Option<String>,
    #[serde(default)]
    pub skip_rewrite: bool,
    #[serde(default)]
    pub streaming_insert: bool,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct StreamingPipelineResult {
    pub text: String,
    pub profile_id: String,
    pub rewrite_fallback_used: bool,
    pub stt_latency_ms: u64,
    pub rewrite_latency_ms: Option<u64>,
    pub audio_seconds: Option<f64>,
    pub audio_file_bytes: Option<u64>,
    pub fast_path_used: bool,
    pub no_speech: bool,
    pub rewrite_input_tokens: Option<u64>,
    pub rewrite_output_tokens: Option<u64>,
    pub rewrite_cache_hit_tokens: Option<u64>,
    pub rewrite_cache_miss_tokens: Option<u64>,
    pub streaming_used: bool,
    pub inserted_streaming: bool,
    pub first_stt_delta_ms: Option<u64>,
    pub first_rewrite_delta_ms: Option<u64>,
    pub first_insert_ms: Option<u64>,
    pub warning: Option<String>,
}

pub fn streaming_eligible(request: &StreamingPipelineRequest) -> bool {
    request.stt_provider == "openai-realtime" && request.selected_text.is_none()
}

fn local_light_rewrite_result(
    transcript: &str,
    context: &provider::PipelineContext,
    skip_rewrite: bool,
    stt_latency_ms: u64,
    first_stt_delta_ms: Option<u64>,
    audio_seconds: Option<f64>,
    audio_file_bytes: Option<u64>,
) -> Option<Result<StreamingPipelineResult, crate::light_rewrite::LightRewriteReason>> {
    let light_rewrite_profile_mode = if skip_rewrite && context.selected_text.is_none() {
        "normal".to_string()
    } else {
        context.profile_mode.clone()
    };
    let decision = crate::light_rewrite::light_rewrite(
        transcript,
        &crate::light_rewrite::LightRewriteContext {
            profile_mode: light_rewrite_profile_mode,
            selected_text: context.selected_text.clone(),
        },
    );

    match decision {
        crate::light_rewrite::LightRewriteDecision::Local(output) => {
            Some(Ok(StreamingPipelineResult {
                text: output.text,
                profile_id: context.profile_id.clone(),
                rewrite_fallback_used: false,
                stt_latency_ms,
                rewrite_latency_ms: None,
                audio_seconds,
                audio_file_bytes,
                fast_path_used: true,
                no_speech: false,
                rewrite_input_tokens: None,
                rewrite_output_tokens: None,
                rewrite_cache_hit_tokens: None,
                rewrite_cache_miss_tokens: None,
                streaming_used: true,
                inserted_streaming: false,
                first_stt_delta_ms,
                first_rewrite_delta_ms: None,
                first_insert_ms: None,
                warning: None,
            }))
        }
        crate::light_rewrite::LightRewriteDecision::NeedsModel(reason) => Some(Err(reason)),
        crate::light_rewrite::LightRewriteDecision::NoSpeech => {
            Some(Ok(no_speech_streaming_result(
                context,
                audio_seconds,
                audio_file_bytes,
                stt_latency_ms,
                first_stt_delta_ms,
            )))
        }
        crate::light_rewrite::LightRewriteDecision::NotApplicable => None,
    }
}

fn no_speech_streaming_result(
    context: &provider::PipelineContext,
    audio_seconds: Option<f64>,
    audio_file_bytes: Option<u64>,
    stt_latency_ms: u64,
    first_stt_delta_ms: Option<u64>,
) -> StreamingPipelineResult {
    StreamingPipelineResult {
        text: String::new(),
        profile_id: context.profile_id.clone(),
        rewrite_fallback_used: false,
        stt_latency_ms,
        rewrite_latency_ms: None,
        audio_seconds,
        audio_file_bytes,
        fast_path_used: false,
        no_speech: true,
        rewrite_input_tokens: None,
        rewrite_output_tokens: None,
        rewrite_cache_hit_tokens: None,
        rewrite_cache_miss_tokens: None,
        streaming_used: true,
        inserted_streaming: false,
        first_stt_delta_ms,
        first_rewrite_delta_ms: None,
        first_insert_ms: None,
        warning: None,
    }
}

fn pcm_chunks_have_speech(pcm_chunks: &[Vec<i16>]) -> bool {
    let mut total_samples = 0u64;
    let mut sum_squares = 0f64;
    let mut max_abs = 0f64;

    for sample in pcm_chunks.iter().flatten() {
        let value = f64::from(*sample);
        let abs = value.abs();
        max_abs = max_abs.max(abs);
        sum_squares += value * value;
        total_samples += 1;
    }

    if total_samples == 0 {
        return false;
    }
    let rms = (sum_squares / total_samples as f64).sqrt();
    !(max_abs < 500.0 && rms < 80.0)
}

type TextInserter<'a> = &'a dyn Fn(&str) -> Result<(), String>;

struct InsertStreamResult {
    inserted_any: bool,
    warning: Option<String>,
}

fn copy_partial_insert_failure_text<F>(text: &str, copy_text: F) -> String
where
    F: FnOnce(&str) -> Result<(), String>,
{
    if copy_text(text).is_ok() {
        PARTIAL_STREAMING_INSERT_WARNING.to_string()
    } else {
        PARTIAL_STREAMING_INSERT_COPY_FAILED_WARNING.to_string()
    }
}

fn stream_delta_to_inserter(
    delta: &str,
    pending_insert_text: &mut String,
    inserted_streaming: bool,
    inserter: TextInserter<'_>,
) -> Result<InsertStreamResult, String> {
    if delta.is_empty() {
        return Ok(InsertStreamResult {
            inserted_any: false,
            warning: None,
        });
    }

    pending_insert_text.push_str(delta);
    if pending_insert_text.trim().is_empty() {
        return Ok(InsertStreamResult {
            inserted_any: false,
            warning: None,
        });
    }

    if let Err(error) = inserter(pending_insert_text) {
        return if inserted_streaming {
            Ok(InsertStreamResult {
                inserted_any: false,
                warning: Some(PARTIAL_STREAMING_INSERT_WARNING.to_string()),
            })
        } else {
            Err(error)
        };
    }
    pending_insert_text.clear();

    Ok(InsertStreamResult {
        inserted_any: true,
        warning: None,
    })
}

pub fn run_streaming_pipeline(
    request: StreamingPipelineRequest,
    context: provider::PipelineContext,
    pcm_chunks: Vec<Vec<i16>>,
) -> Result<StreamingPipelineResult, provider::ProviderError> {
    if request.stt_provider != "openai-realtime" {
        return Err(provider::ProviderError::InvalidInput(
            "Streaming requires the OpenAI Realtime ASR provider".to_string(),
        ));
    }
    provider::validate_provider_models(
        &request.stt_provider,
        &request.stt_model,
        &request.rewrite_provider,
        &request.rewrite_model,
    )?;
    let audio_path = std::path::Path::new(&request.audio_path);
    let audio_seconds = provider::wav_duration_seconds(audio_path);
    let audio_file_bytes = provider::audio_file_bytes(audio_path);
    if !pcm_chunks_have_speech(&pcm_chunks) {
        return Ok(no_speech_streaming_result(
            &context,
            audio_seconds,
            audio_file_bytes,
            0,
            None,
        ));
    }

    let openai_key = provider::provider_key("openai")?;
    let stt_started = Instant::now();
    let (transcript, first_stt_delta_ms) =
        OpenAiRealtimeTranscription::new(openai_key.clone(), request.stt_model.clone())
            .transcribe_chunks(pcm_chunks)
            .map_err(realtime_error)?;
    let stt_latency_ms = elapsed_ms(stt_started);

    let model_reason = match local_light_rewrite_result(
        &transcript,
        &context,
        request.skip_rewrite,
        stt_latency_ms,
        first_stt_delta_ms,
        audio_seconds,
        audio_file_bytes,
    ) {
        Some(Ok(result)) => return Ok(result),
        Some(Err(reason)) => Some(reason),
        None => None,
    };

    let rendered_prompt = match model_reason {
        Some(reason) if request.skip_rewrite => {
            provider::render_light_rewrite_model_prompt(&context, &transcript, reason)
        }
        _ => provider::render_user_prompt(&context, &transcript),
    };
    let rewrite_input = provider::RewriteInput {
        transcript: transcript.clone(),
        model: request.rewrite_model,
        profile_name: context.profile_name,
        system_prompt: context.system_prompt,
        dictionary_terms: context.dictionary_terms,
        rendered_prompt,
    };

    let rewrite_provider: Box<dyn provider::StreamingRewriteProvider> =
        match request.rewrite_provider.as_str() {
            "openai" => Box::new(provider::OpenAiRewriteProvider::new(openai_key)),
            "deepseek" => Box::new(provider::DeepSeekRewriteProvider::new(
                provider::provider_key("deepseek")?,
            )),
            other => {
                return Err(provider::ProviderError::UnsupportedProvider(
                    other.to_string(),
                ))
            }
        };
    let rewrite_started = Instant::now();
    let mut first_rewrite_delta_ms = None;
    let inserted_streaming = std::cell::Cell::new(false);
    let first_insert_ms = std::cell::Cell::new(None);
    let mut streamed_text = String::new();
    let mut pending_insert_text = String::new();
    let mut handle_delta = |delta: &str| {
        if delta.is_empty() {
            return Ok(());
        }
        if first_rewrite_delta_ms.is_none() {
            first_rewrite_delta_ms = Some(elapsed_ms(rewrite_started));
        }
        streamed_text.push_str(delta);
        if request.streaming_insert {
            let inserter = |chunk: &str| match clipboard::type_text_chunk(chunk) {
                Ok(()) => Ok(()),
                Err(_error) if inserted_streaming.get() => {
                    Err(PARTIAL_STREAMING_INSERT_WARNING.to_string())
                }
                Err(error) => Err(error),
            };
            let insert_result = stream_delta_to_inserter(
                delta,
                &mut pending_insert_text,
                inserted_streaming.get(),
                &inserter,
            )
            .map_err(provider::ProviderError::ProviderResponse)?;
            if insert_result.inserted_any && !inserted_streaming.get() {
                inserted_streaming.set(true);
                first_insert_ms.set(Some(elapsed_ms(rewrite_started)));
            }
            if let Some(warning) = insert_result.warning {
                return Err(provider::ProviderError::ProviderResponse(warning));
            }
        }
        Ok(())
    };
    match rewrite_provider.rewrite_streaming(&rewrite_input, &mut handle_delta) {
        Ok(output) => Ok(StreamingPipelineResult {
            text: output.text,
            profile_id: context.profile_id,
            rewrite_fallback_used: false,
            stt_latency_ms,
            rewrite_latency_ms: Some(elapsed_ms(rewrite_started)),
            audio_seconds,
            audio_file_bytes,
            fast_path_used: false,
            no_speech: false,
            rewrite_input_tokens: output.usage.map(|usage| usage.input_tokens),
            rewrite_output_tokens: output.usage.map(|usage| usage.output_tokens),
            rewrite_cache_hit_tokens: output.usage.and_then(|usage| usage.prompt_cache_hit_tokens),
            rewrite_cache_miss_tokens: output
                .usage
                .and_then(|usage| usage.prompt_cache_miss_tokens),
            streaming_used: true,
            inserted_streaming: inserted_streaming.get(),
            first_stt_delta_ms,
            first_rewrite_delta_ms,
            first_insert_ms: first_insert_ms.get(),
            warning: None,
        }),
        Err(error) => {
            if request.streaming_insert && inserted_streaming.get() {
                let text = if streamed_text.is_empty() {
                    transcript
                } else {
                    streamed_text
                };
                let warning = copy_partial_insert_failure_text(&text, clipboard::copy_text_only);
                return Ok(StreamingPipelineResult {
                    text,
                    profile_id: context.profile_id,
                    rewrite_fallback_used: false,
                    stt_latency_ms,
                    rewrite_latency_ms: Some(elapsed_ms(rewrite_started)),
                    audio_seconds,
                    audio_file_bytes,
                    fast_path_used: false,
                    no_speech: false,
                    rewrite_input_tokens: None,
                    rewrite_output_tokens: None,
                    rewrite_cache_hit_tokens: None,
                    rewrite_cache_miss_tokens: None,
                    streaming_used: true,
                    inserted_streaming: true,
                    first_stt_delta_ms,
                    first_rewrite_delta_ms,
                    first_insert_ms: first_insert_ms.get(),
                    warning: Some(warning),
                });
            }
            if request.streaming_insert {
                return Err(error);
            }
            if model_reason.is_some() {
                return Err(error);
            }
            log::warn!("Streaming rewrite failed; falling back to raw transcript: {error}");
            Ok(StreamingPipelineResult {
                text: transcript,
                profile_id: context.profile_id,
                rewrite_fallback_used: true,
                stt_latency_ms,
                rewrite_latency_ms: Some(elapsed_ms(rewrite_started)),
                audio_seconds,
                audio_file_bytes,
                fast_path_used: false,
                no_speech: false,
                rewrite_input_tokens: None,
                rewrite_output_tokens: None,
                rewrite_cache_hit_tokens: None,
                rewrite_cache_miss_tokens: None,
                streaming_used: true,
                inserted_streaming: false,
                first_stt_delta_ms,
                first_rewrite_delta_ms,
                first_insert_ms: None,
                warning: None,
            })
        }
    }
}

fn elapsed_ms(started: Instant) -> u64 {
    started.elapsed().as_millis().try_into().unwrap_or(u64::MAX)
}

fn realtime_error(message: String) -> provider::ProviderError {
    if message.contains("websocket")
        || message.contains("timed out")
        || message.contains("request")
        || message.contains("timeout")
    {
        provider::ProviderError::Http(message)
    } else {
        provider::ProviderError::ProviderResponse(message)
    }
}

struct OpenAiRealtimeTranscription {
    api_key: String,
    transcription_model: String,
}

impl OpenAiRealtimeTranscription {
    fn new(api_key: String, transcription_model: String) -> Self {
        Self {
            api_key,
            transcription_model,
        }
    }

    fn transcribe_chunks<I>(&self, chunks: I) -> Result<(String, Option<u64>), String>
    where
        I: IntoIterator<Item = Vec<i16>>,
    {
        let started_at = Instant::now();
        let mut first_delta_ms = None;
        let (mut socket, _) = tungstenite::connect(openai_realtime_request(&self.api_key)?)
            .map_err(|_| "OpenAI realtime websocket connection failed".to_string())?;
        set_read_timeout(socket.get_mut())?;

        socket
            .send(Message::Text(realtime_session_update(
                &self.transcription_model,
            )))
            .map_err(|_| "OpenAI realtime websocket send failed".to_string())?;

        for chunk in chunks {
            let message = serde_json::json!({
                "type": "input_audio_buffer.append",
                "audio": pcm_i16_base64(&chunk),
            });
            socket
                .send(Message::Text(message.to_string()))
                .map_err(|_| "OpenAI realtime websocket send failed".to_string())?;
        }

        socket
            .send(Message::Text(
                serde_json::json!({ "type": "input_audio_buffer.commit" }).to_string(),
            ))
            .map_err(|_| "OpenAI realtime websocket send failed".to_string())?;

        loop {
            let message = socket.read().map_err(|error| match error {
                tungstenite::Error::Io(error)
                    if matches!(error.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) =>
                {
                    "OpenAI realtime transcript timed out after 30 seconds".to_string()
                }
                _ => "OpenAI realtime websocket read failed".to_string(),
            })?;
            let Message::Text(text) = message else {
                continue;
            };

            match parse_transcription_event(&text)? {
                TranscriptionEvent::Delta(delta) => {
                    if !delta.is_empty() && first_delta_ms.is_none() {
                        first_delta_ms = Some(started_at.elapsed().as_millis() as u64);
                    }
                }
                TranscriptionEvent::Completed(transcript) if !transcript.is_empty() => {
                    return Ok((transcript, first_delta_ms));
                }
                TranscriptionEvent::Error(message) => return Err(message),
                _ => {}
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TranscriptionEvent {
    Delta(String),
    Completed(String),
    Error(String),
    Ignored,
}

fn set_read_timeout(stream: &mut MaybeTlsStream<TcpStream>) -> Result<(), String> {
    let result = match stream {
        MaybeTlsStream::Plain(stream) => stream.set_read_timeout(Some(OPENAI_TRANSCRIPT_TIMEOUT)),
        MaybeTlsStream::Rustls(stream) => stream
            .get_mut()
            .set_read_timeout(Some(OPENAI_TRANSCRIPT_TIMEOUT)),
        _ => Ok(()),
    };
    result.map_err(|_| "OpenAI realtime websocket timeout setup failed".to_string())
}

fn pcm_i16_base64(samples: &[i16]) -> String {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for sample in samples {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    STANDARD.encode(bytes)
}

fn openai_realtime_request(api_key: &str) -> Result<Request<()>, String> {
    Request::builder()
        .uri(OPENAI_REALTIME_URL)
        .header("Authorization", format!("Bearer {api_key}"))
        .body(())
        .map_err(|_| "Cannot build OpenAI realtime request".to_string())
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
                        "rate": 24000,
                    },
                    "transcription": {
                        "model": transcription_model,
                    },
                    "turn_detection": null,
                },
            },
        },
    })
    .to_string()
}

pub fn parse_transcription_event(body: &str) -> Result<TranscriptionEvent, String> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|error| format!("Invalid realtime event JSON: {error}"))?;
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
        Some("error") => Ok(TranscriptionEvent::Error(
            value
                .get("error")
                .and_then(|item| item.get("message"))
                .and_then(|item| item.as_str())
                .filter(|message| !message.is_empty())
                .unwrap_or("OpenAI realtime error")
                .to_string(),
        )),
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

        assert_eq!(
            event,
            TranscriptionEvent::Completed("hello world".to_string())
        );
    }

    #[test]
    fn parses_realtime_error_event() {
        let event = parse_transcription_event(
            r#"{"type":"error","error":{"message":"transcription failed"}}"#,
        )
        .unwrap();

        assert_eq!(
            event,
            TranscriptionEvent::Error("transcription failed".to_string())
        );
    }

    #[test]
    fn encodes_pcm_i16_as_little_endian_base64() {
        assert_eq!(super::pcm_i16_base64(&[1, 256]), "AQAAAQ==");
    }

    #[test]
    fn builds_openai_realtime_request_without_exposing_key_in_url() {
        let request = super::openai_realtime_request("sk-test").unwrap();

        assert_eq!(
            request.uri().to_string(),
            "wss://api.openai.com/v1/realtime?model=gpt-realtime-2"
        );
        assert_eq!(
            request.headers().get("Authorization").unwrap(),
            "Bearer sk-test"
        );
    }

    #[test]
    fn builds_realtime_transcription_session_update() {
        let value: serde_json::Value =
            serde_json::from_str(&super::realtime_session_update("gpt-realtime-2")).unwrap();

        assert_eq!(value["type"], "session.update");
        assert_eq!(value["session"]["type"], "transcription");
        assert_eq!(value["session"]["audio"]["input"]["format"]["rate"], 24000);
        assert_eq!(
            value["session"]["audio"]["input"]["transcription"]["model"],
            "gpt-realtime-2"
        );
        assert!(value["session"].get("turn_detection").is_none());
        assert!(value["session"]["audio"]["input"]["turn_detection"].is_null());
    }

    #[test]
    fn selected_text_disables_streaming_eligibility() {
        let request = StreamingPipelineRequest {
            audio_path: "sample.wav".to_string(),
            profile_id: "normal".to_string(),
            stt_provider: "openai-realtime".to_string(),
            stt_base_url: None,
            stt_model: "gpt-realtime-2".to_string(),
            rewrite_provider: "openai".to_string(),
            rewrite_model: "gpt-5-nano".to_string(),
            selected_text: Some("edit me".to_string()),
            skip_rewrite: false,
            streaming_insert: false,
        };

        assert!(!streaming_eligible(&request));
    }

    #[test]
    fn local_light_rewrite_formats_short_streaming_list() {
        let context = provider::PipelineContext {
            profile_id: "normal".to_string(),
            profile_name: "Normal".to_string(),
            profile_mode: "normal".to_string(),
            system_prompt: "Clean it.".to_string(),
            user_prompt_template: "{{transcript}}".to_string(),
            target_language: None,
            dictionary_terms: Vec::new(),
            selected_text: None,
        };

        let result = local_light_rewrite_result(
            "\u{4ee3}\u{529e}\u{4e8b}\u{9879}\u{7b2c}\u{4e00}\u{4e70}\u{725b}\u{5976}\u{7b2c}\u{4e8c}\u{56de}\u{590d}\u{90ae}\u{4ef6}",
            &context,
            false,
            123,
            Some(45),
            Some(1.25),
            Some(2048),
        )
        .unwrap()
        .unwrap();

        assert_eq!(
            result.text,
            "\u{4ee3}\u{529e}\u{4e8b}\u{9879}\n1. \u{4e70}\u{725b}\u{5976}\n2. \u{56de}\u{590d}\u{90ae}\u{4ef6}"
        );
        assert_eq!(result.profile_id, "normal");
        assert!(!result.rewrite_fallback_used);
        assert_eq!(result.stt_latency_ms, 123);
        assert_eq!(result.rewrite_latency_ms, None);
        assert_eq!(result.audio_seconds, Some(1.25));
        assert_eq!(result.audio_file_bytes, Some(2048));
        assert!(result.fast_path_used);
        assert_eq!(result.rewrite_input_tokens, None);
        assert_eq!(result.rewrite_output_tokens, None);
        assert!(result.streaming_used);
        assert!(!result.inserted_streaming);
        assert_eq!(result.first_stt_delta_ms, Some(45));
        assert_eq!(result.first_rewrite_delta_ms, None);
        assert_eq!(result.first_insert_ms, None);
        assert_eq!(result.warning, None);
    }

    #[test]
    fn local_light_rewrite_formats_fast_streaming_prompt_profile() {
        let context = provider::PipelineContext {
            profile_id: "prompt_profile".to_string(),
            profile_name: "Prompt".to_string(),
            profile_mode: "prompt".to_string(),
            system_prompt: "Format it.".to_string(),
            user_prompt_template: "{{transcript}}".to_string(),
            target_language: None,
            dictionary_terms: Vec::new(),
            selected_text: None,
        };

        let result = local_light_rewrite_result(
            "\u{51e0}\u{4e2a}\u{70b9}\u{5e2e}\u{6211}\u{8bb0}\u{5f55}\u{4e00}\u{4e0b}\u{4e00},UI\u{9700}\u{8981}\u{5168}\u{90e8}\u{91cd}\u{6784}\u{4e8c},logo\u{9700}\u{8981}\u{6362}\u{4e00}\u{4e2a}\u{65b0}\u{7684}\u{4e09},\u{5c31}\u{662f}\u{8fd9}\u{4e2a}\u{76d1}\u{542c}\u{72b6}\u{6001}\u{7684}\u{60ac}\u{6d6e}\u{7a97}\u{7684}\u{56fe}\u{6807}\u{8981}\u{91cd}\u{65b0}\u{505a}\u{4e00}\u{4e0b}",
            &context,
            true,
            123,
            Some(45),
            Some(1.25),
            Some(2048),
        )
        .unwrap()
        .unwrap();

        assert_eq!(
            result.text,
            "\u{51e0}\u{4e2a}\u{70b9}\u{5e2e}\u{6211}\u{8bb0}\u{5f55}\u{4e00}\u{4e0b}\n1. UI\u{9700}\u{8981}\u{5168}\u{90e8}\u{91cd}\u{6784}\n2. logo\u{9700}\u{8981}\u{6362}\u{4e00}\u{4e2a}\u{65b0}\u{7684}\n3. \u{76d1}\u{542c}\u{72b6}\u{6001}\u{7684}\u{60ac}\u{6d6e}\u{7a97}\u{7684}\u{56fe}\u{6807}\u{8981}\u{91cd}\u{65b0}\u{505a}\u{4e00}\u{4e0b}"
        );
    }

    #[test]
    fn streaming_pipeline_returns_no_speech_for_empty_chunks_before_network() {
        let request = StreamingPipelineRequest {
            audio_path: "sample.wav".to_string(),
            profile_id: "normal".to_string(),
            stt_provider: "openai-realtime".to_string(),
            stt_base_url: None,
            stt_model: "gpt-realtime-2".to_string(),
            rewrite_provider: "openai".to_string(),
            rewrite_model: "gpt-5-nano".to_string(),
            selected_text: None,
            skip_rewrite: false,
            streaming_insert: false,
        };

        let result = run_streaming_pipeline(
            request,
            provider::PipelineContext {
                profile_id: "normal".to_string(),
                profile_name: "Normal".to_string(),
                profile_mode: "normal".to_string(),
                system_prompt: "Clean it.".to_string(),
                user_prompt_template: "{{transcript}}".to_string(),
                target_language: None,
                dictionary_terms: Vec::new(),
                selected_text: None,
            },
            Vec::new(),
        )
        .unwrap();

        assert!(result.no_speech);
        assert_eq!(result.text, "");
        assert!(!result.inserted_streaming);
    }

    #[test]
    fn streaming_pipeline_returns_no_speech_for_silent_chunks_before_network() {
        let request = StreamingPipelineRequest {
            audio_path: "sample.wav".to_string(),
            profile_id: "normal".to_string(),
            stt_provider: "openai-realtime".to_string(),
            stt_base_url: None,
            stt_model: "gpt-realtime-2".to_string(),
            rewrite_provider: "openai".to_string(),
            rewrite_model: "gpt-5-nano".to_string(),
            selected_text: None,
            skip_rewrite: false,
            streaming_insert: false,
        };

        let result = run_streaming_pipeline(
            request,
            provider::PipelineContext {
                profile_id: "normal".to_string(),
                profile_name: "Normal".to_string(),
                profile_mode: "normal".to_string(),
                system_prompt: "Clean it.".to_string(),
                user_prompt_template: "{{transcript}}".to_string(),
                target_language: None,
                dictionary_terms: Vec::new(),
                selected_text: None,
            },
            vec![vec![0; 4800]],
        )
        .unwrap();

        assert!(result.no_speech);
        assert_eq!(result.stt_latency_ms, 0);
    }

    #[test]
    fn marks_partial_insert_warning_after_insert_failure() {
        let mut pending_insert_text = String::new();
        let inserted = std::cell::RefCell::new(Vec::new());
        let inserted_streaming = std::cell::Cell::new(false);
        let mut warning = None;

        for delta in ["hello", " ", "world"] {
            let result = stream_delta_to_inserter(
                delta,
                &mut pending_insert_text,
                inserted_streaming.get(),
                &|chunk| {
                    inserted.borrow_mut().push(chunk.to_string());
                    if inserted.borrow().len() == 2 {
                        Err("insert failed".to_string())
                    } else {
                        Ok(())
                    }
                },
            )
            .unwrap();
            if result.inserted_any {
                inserted_streaming.set(true);
            }
            warning = result.warning;
            if warning.is_some() {
                break;
            }
        }

        assert_eq!(
            warning.as_deref(),
            Some(
                "Streaming insertion stopped after partial text was inserted. Final text was copied to clipboard."
            )
        );
        assert_eq!(*inserted.borrow(), vec!["hello", " world"]);
    }

    #[test]
    fn buffers_whitespace_delta_until_text_delta() {
        let mut pending_insert_text = String::new();
        let inserted = std::cell::RefCell::new(Vec::new());

        let whitespace = stream_delta_to_inserter(" ", &mut pending_insert_text, false, &|chunk| {
            inserted.borrow_mut().push(chunk.to_string());
            Ok(())
        })
        .unwrap();
        let text = stream_delta_to_inserter("world", &mut pending_insert_text, false, &|chunk| {
            inserted.borrow_mut().push(chunk.to_string());
            Ok(())
        })
        .unwrap();

        assert!(!whitespace.inserted_any);
        assert!(text.inserted_any);
        assert_eq!(*inserted.borrow(), vec![" world"]);
        assert!(pending_insert_text.is_empty());
    }

    #[test]
    fn copies_partial_insert_failure_text() {
        let copied = std::cell::RefCell::new(String::new());

        let warning = copy_partial_insert_failure_text(" final text ", |text| {
            *copied.borrow_mut() = text.to_string();
            Ok(())
        });

        assert_eq!(*copied.borrow(), " final text ");
        assert_eq!(warning, PARTIAL_STREAMING_INSERT_WARNING);
    }

    #[test]
    fn partial_insert_copy_failure_returns_uncopied_warning() {
        let warning = copy_partial_insert_failure_text(" final text ", |_text| {
            Err("clipboard unavailable".to_string())
        });

        assert_eq!(warning, PARTIAL_STREAMING_INSERT_COPY_FAILED_WARNING);
    }
}
