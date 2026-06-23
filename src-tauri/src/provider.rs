use serde::{Deserialize, Serialize};

const KEYRING_SERVICE: &str = "com.gospeak.alpha";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderKeyStatus {
    pub groq: bool,
    pub openai: bool,
}

impl ProviderKeyStatus {
    pub fn from_presence(groq: bool, openai: bool) -> Self {
        Self { groq, openai }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderRuntimeConfig {
    pub stt_provider: String,
    pub stt_model: String,
    pub rewrite_provider: String,
    pub rewrite_model: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AudioFilePipelineRequest {
    pub config: ProviderRuntimeConfig,
    pub audio_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderError {
    MissingKey(String),
    UnsupportedProvider(String),
    NotImplemented(String),
    InvalidInput(String),
    Http(String),
    ProviderResponse(String),
}

pub fn validate_pipeline_readiness(
    config: &ProviderRuntimeConfig,
    status: &ProviderKeyStatus,
) -> Result<(), ProviderError> {
    match config.stt_provider.as_str() {
        "groq" if !status.groq => Err(ProviderError::MissingKey("groq".to_string())),
        "groq" => Ok(()),
        other => Err(ProviderError::UnsupportedProvider(other.to_string())),
    }?;

    match config.rewrite_provider.as_str() {
        "openai" if !status.openai => Err(ProviderError::MissingKey("openai".to_string())),
        "openai" => Ok(()),
        other => Err(ProviderError::UnsupportedProvider(other.to_string())),
    }
}

pub fn provider_key_status() -> ProviderKeyStatus {
    ProviderKeyStatus::from_presence(has_provider_key("groq"), has_provider_key("openai"))
}

pub fn save_provider_key(provider: &str, api_key: &str) -> Result<ProviderKeyStatus, String> {
    if !matches!(provider, "groq" | "openai") {
        return Err(format!("Unsupported provider: {provider}"));
    }

    if api_key.trim().is_empty() {
        return Err("API key cannot be empty".to_string());
    }

    let entry = keyring::Entry::new(KEYRING_SERVICE, provider).map_err(to_safe_error)?;
    entry.set_password(api_key).map_err(to_safe_error)?;
    Ok(provider_key_status())
}

pub fn run_alpha_pipeline(config: &ProviderRuntimeConfig) -> Result<String, ProviderError> {
    validate_pipeline_readiness(config, &provider_key_status())?;
    Err(ProviderError::NotImplemented(
    "Pass an audio file through run_alpha_pipeline_with_clients to execute Groq STT and OpenAI rewrite.".to_string(),
  ))
}

pub fn run_audio_file_pipeline(
    request: &AudioFilePipelineRequest,
) -> Result<String, ProviderError> {
    validate_pipeline_readiness(&request.config, &provider_key_status())?;

    let groq_key = provider_key("groq")?;
    let openai_key = provider_key("openai")?;
    let stt_provider = GroqSttProvider::new(groq_key);
    let rewrite_provider = OpenAiRewriteProvider::new(openai_key);

    run_alpha_pipeline_with_clients(
        &request.config,
        request.audio_path.clone(),
        &stt_provider,
        &rewrite_provider,
    )
}

fn has_provider_key(provider: &str) -> bool {
    provider_key(provider).is_ok()
}

fn provider_key(provider: &str) -> Result<String, ProviderError> {
    let env_name = match provider {
        "groq" => "GROQ_API_KEY",
        "openai" => "OPENAI_API_KEY",
        _ => return Err(ProviderError::UnsupportedProvider(provider.to_string())),
    };

    if let Ok(value) = std::env::var(env_name) {
        if !value.trim().is_empty() {
            return Ok(value);
        }
    }

    let key = keyring::Entry::new(KEYRING_SERVICE, provider)
        .ok()
        .and_then(|entry| entry.get_password().ok())
        .filter(|value| !value.trim().is_empty());

    key.ok_or_else(|| ProviderError::MissingKey(provider.to_string()))
}

fn to_safe_error(error: keyring::Error) -> String {
    format!("Credential store error: {error}")
}

impl std::fmt::Display for ProviderError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProviderError::MissingKey(provider) => {
                write!(formatter, "Missing {provider} API key")
            }
            ProviderError::UnsupportedProvider(provider) => {
                write!(formatter, "Unsupported provider: {provider}")
            }
            ProviderError::NotImplemented(message) => formatter.write_str(message),
            ProviderError::InvalidInput(message) => formatter.write_str(message),
            ProviderError::Http(message) => formatter.write_str(message),
            ProviderError::ProviderResponse(message) => formatter.write_str(message),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SttInput {
    pub audio_path: String,
    pub model: String,
    pub language: Option<String>,
    pub prompt: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RewriteInput {
    pub transcript: String,
    pub model: String,
    pub profile_name: String,
    pub system_prompt: String,
    pub dictionary_terms: Vec<String>,
}

pub trait SttProvider {
    fn transcribe(&self, input: &SttInput) -> Result<String, ProviderError>;
}

pub trait RewriteProvider {
    fn rewrite(&self, input: &RewriteInput) -> Result<String, ProviderError>;
}

#[derive(Debug, Clone)]
pub struct GroqSttProvider {
    api_key: String,
    base_url: String,
}

impl GroqSttProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: "https://api.groq.com/openai/v1".to_string(),
        }
    }
}

impl SttProvider for GroqSttProvider {
    fn transcribe(&self, input: &SttInput) -> Result<String, ProviderError> {
        let audio_path = std::path::Path::new(&input.audio_path);
        if !audio_path.exists() {
            return Err(ProviderError::InvalidInput(format!(
                "Audio file does not exist: {}",
                input.audio_path
            )));
        }

        let file_part = reqwest::blocking::multipart::Part::file(audio_path).map_err(|error| {
            ProviderError::InvalidInput(format!("Cannot read audio file: {error}"))
        })?;
        let mut form = reqwest::blocking::multipart::Form::new()
            .part("file", file_part)
            .text("model", input.model.clone());

        if let Some(language) = &input.language {
            form = form.text("language", language.clone());
        }
        if let Some(prompt) = &input.prompt {
            form = form.text("prompt", prompt.clone());
        }

        let response = reqwest::blocking::Client::new()
            .post(format!("{}/audio/transcriptions", self.base_url))
            .bearer_auth(&self.api_key)
            .multipart(form)
            .send()
            .map_err(|error| ProviderError::Http(format!("Groq STT request failed: {error}")))?;

        let status = response.status();
        let body = response.text().map_err(|error| {
            ProviderError::Http(format!("Groq STT response read failed: {error}"))
        })?;

        if !status.is_success() {
            return Err(ProviderError::Http(format!(
                "Groq STT returned HTTP {status}: {}",
                sanitize_provider_body(&body)
            )));
        }

        parse_groq_transcription_text(&body)
    }
}

#[derive(Debug, Clone)]
pub struct OpenAiRewriteProvider {
    api_key: String,
    base_url: String,
}

impl OpenAiRewriteProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: "https://api.openai.com/v1".to_string(),
        }
    }
}

impl RewriteProvider for OpenAiRewriteProvider {
    fn rewrite(&self, input: &RewriteInput) -> Result<String, ProviderError> {
        if input.transcript.trim().is_empty() {
            return Err(ProviderError::InvalidInput(
                "Transcript cannot be empty".to_string(),
            ));
        }

        let dictionary = if input.dictionary_terms.is_empty() {
            "No dictionary terms.".to_string()
        } else {
            input.dictionary_terms.join("\n")
        };

        let body = serde_json::json!({
          "model": input.model,
          "instructions": input.system_prompt,
          "input": format!(
            "Profile: {}\n\nTranscript:\n{}\n\nDictionary terms:\n{}",
            input.profile_name, input.transcript, dictionary
          )
        });

        let response = reqwest::blocking::Client::new()
            .post(format!("{}/responses", self.base_url))
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .map_err(|error| {
                ProviderError::Http(format!("OpenAI rewrite request failed: {error}"))
            })?;

        let status = response.status();
        let body = response.text().map_err(|error| {
            ProviderError::Http(format!("OpenAI rewrite response read failed: {error}"))
        })?;

        if !status.is_success() {
            return Err(ProviderError::Http(format!(
                "OpenAI rewrite returned HTTP {status}: {}",
                sanitize_provider_body(&body)
            )));
        }

        parse_openai_output_text(&body)
    }
}

pub fn run_alpha_pipeline_with_clients<S, R>(
    config: &ProviderRuntimeConfig,
    audio_path: String,
    stt_provider: &S,
    rewrite_provider: &R,
) -> Result<String, ProviderError>
where
    S: SttProvider,
    R: RewriteProvider,
{
    let transcript = stt_provider.transcribe(&SttInput {
        audio_path,
        model: config.stt_model.clone(),
        language: None,
        prompt: None,
    })?;

    let rewrite_input = RewriteInput {
    transcript: transcript.clone(),
    model: config.rewrite_model.clone(),
    profile_name: "Normal".to_string(),
    system_prompt: "Clean the transcript into natural written text. Preserve meaning exactly. Do not add new facts.".to_string(),
    dictionary_terms: Vec::new(),
  };

    match rewrite_provider.rewrite(&rewrite_input) {
        Ok(text) => Ok(text),
        Err(error) => {
            log::warn!("Rewrite failed; falling back to raw transcript: {error}");
            Ok(transcript)
        }
    }
}

fn parse_groq_transcription_text(body: &str) -> Result<String, ProviderError> {
    let value: serde_json::Value = serde_json::from_str(body).map_err(|error| {
        ProviderError::ProviderResponse(format!("Groq STT returned invalid JSON: {error}"))
    })?;

    value
        .get("text")
        .and_then(|text| text.as_str())
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| {
            ProviderError::ProviderResponse("Groq STT response did not include text".to_string())
        })
}

fn parse_openai_output_text(body: &str) -> Result<String, ProviderError> {
    let value: serde_json::Value = serde_json::from_str(body).map_err(|error| {
        ProviderError::ProviderResponse(format!("OpenAI rewrite returned invalid JSON: {error}"))
    })?;

    if let Some(text) = value
        .get("output_text")
        .and_then(|output_text| output_text.as_str())
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        return Ok(text.to_string());
    }

    value
        .get("output")
        .and_then(|output| output.as_array())
        .and_then(|items| {
            items.iter().find_map(|item| {
                item.get("content")
                    .and_then(|content| content.as_array())
                    .and_then(|content| {
                        content.iter().find_map(|part| {
                            part.get("text")
                                .and_then(|text| text.as_str())
                                .map(str::trim)
                                .filter(|text| !text.is_empty())
                        })
                    })
            })
        })
        .map(ToOwned::to_owned)
        .ok_or_else(|| {
            ProviderError::ProviderResponse(
                "OpenAI rewrite response did not include output_text".to_string(),
            )
        })
}

fn sanitize_provider_body(body: &str) -> String {
    body.chars().take(500).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_key_status_never_contains_secret_values() {
        let status = ProviderKeyStatus::from_presence(false, true);

        assert!(!status.groq);
        assert!(status.openai);
        assert!(!serde_json::to_string(&status).unwrap().contains("sk-"));
    }

    #[test]
    fn alpha_pipeline_fails_before_network_when_keys_are_missing() {
        let config = ProviderRuntimeConfig {
            stt_provider: "groq".to_string(),
            stt_model: "whisper-large-v3-turbo".to_string(),
            rewrite_provider: "openai".to_string(),
            rewrite_model: "gpt-5-nano".to_string(),
        };

        let result = validate_pipeline_readiness(&config, &ProviderKeyStatus::default());

        assert!(matches!(result, Err(ProviderError::MissingKey(provider)) if provider == "groq"));
    }

    #[test]
    fn parses_groq_transcription_text() {
        let text = parse_groq_transcription_text(r#"{"text":" hello world "}"#).unwrap();
        assert_eq!(text, "hello world");
    }

    #[test]
    fn parses_openai_output_text() {
        let text = parse_openai_output_text(r#"{"output_text":" Polished text. "}"#).unwrap();
        assert_eq!(text, "Polished text.");
    }

    #[test]
    fn orchestrates_stt_then_rewrite_with_mock_providers() {
        struct MockStt;
        impl SttProvider for MockStt {
            fn transcribe(&self, input: &SttInput) -> Result<String, ProviderError> {
                assert_eq!(input.model, "whisper-large-v3-turbo");
                assert_eq!(input.audio_path, "sample.wav");
                Ok("raw transcript".to_string())
            }
        }

        struct MockRewrite;
        impl RewriteProvider for MockRewrite {
            fn rewrite(&self, input: &RewriteInput) -> Result<String, ProviderError> {
                assert_eq!(input.model, "gpt-5-nano");
                assert_eq!(input.transcript, "raw transcript");
                Ok("polished transcript".to_string())
            }
        }

        let config = ProviderRuntimeConfig {
            stt_provider: "groq".to_string(),
            stt_model: "whisper-large-v3-turbo".to_string(),
            rewrite_provider: "openai".to_string(),
            rewrite_model: "gpt-5-nano".to_string(),
        };

        let result = run_alpha_pipeline_with_clients(
            &config,
            "sample.wav".to_string(),
            &MockStt,
            &MockRewrite,
        )
        .unwrap();

        assert_eq!(result, "polished transcript");
    }

    #[test]
    fn falls_back_to_raw_transcript_when_rewrite_fails() {
        struct MockStt;
        impl SttProvider for MockStt {
            fn transcribe(&self, _input: &SttInput) -> Result<String, ProviderError> {
                Ok("raw transcript".to_string())
            }
        }

        struct FailingRewrite;
        impl RewriteProvider for FailingRewrite {
            fn rewrite(&self, _input: &RewriteInput) -> Result<String, ProviderError> {
                Err(ProviderError::Http("rewrite unavailable".to_string()))
            }
        }

        let config = ProviderRuntimeConfig {
            stt_provider: "groq".to_string(),
            stt_model: "whisper-large-v3-turbo".to_string(),
            rewrite_provider: "openai".to_string(),
            rewrite_model: "gpt-5-nano".to_string(),
        };

        let result = run_alpha_pipeline_with_clients(
            &config,
            "sample.wav".to_string(),
            &MockStt,
            &FailingRewrite,
        )
        .unwrap();

        assert_eq!(result, "raw transcript");
    }

    #[test]
    fn pipeline_readiness_fails_when_openai_key_is_missing() {
        let config = ProviderRuntimeConfig {
            stt_provider: "groq".to_string(),
            stt_model: "whisper-large-v3-turbo".to_string(),
            rewrite_provider: "openai".to_string(),
            rewrite_model: "gpt-5-nano".to_string(),
        };

        let result =
            validate_pipeline_readiness(&config, &ProviderKeyStatus::from_presence(true, false));

        assert!(matches!(result, Err(ProviderError::MissingKey(provider)) if provider == "openai"));
    }
}
