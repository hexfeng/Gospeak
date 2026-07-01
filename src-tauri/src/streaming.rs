#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TranscriptionEvent {
    Delta(String),
    Completed(String),
    Ignored,
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
}
