use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::{
    io::ErrorKind,
    net::TcpStream,
    time::{Duration, Instant},
};
use tungstenite::{http::Request, stream::MaybeTlsStream, Message};

const OPENAI_REALTIME_URL: &str = "wss://api.openai.com/v1/realtime?model=gpt-realtime-2";
const OPENAI_TRANSCRIPT_TIMEOUT: Duration = Duration::from_secs(30);

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
            serde_json::from_str(&super::realtime_session_update("gpt-realtime-whisper")).unwrap();

        assert_eq!(value["type"], "session.update");
        assert_eq!(value["session"]["type"], "transcription");
        assert_eq!(value["session"]["audio"]["input"]["format"]["rate"], 24000);
        assert_eq!(
            value["session"]["audio"]["input"]["transcription"]["model"],
            "gpt-realtime-whisper"
        );
        assert!(value["session"].get("turn_detection").is_none());
        assert!(value["session"]["audio"]["input"]["turn_detection"].is_null());
    }
}
