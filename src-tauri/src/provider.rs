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
    pub audio_path: String,
    pub profile_id: String,
    pub stt_model: String,
    pub rewrite_model: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PipelineContext {
    pub profile_id: String,
    pub profile_name: String,
    pub system_prompt: String,
    pub user_prompt_template: String,
    pub target_language: Option<String>,
    pub dictionary_terms: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PipelineResult {
    pub text: String,
    pub profile_id: String,
    pub rewrite_fallback_used: bool,
    pub stt_latency_ms: u64,
    pub rewrite_latency_ms: Option<u64>,
    pub audio_seconds: Option<f64>,
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
    context: PipelineContext,
) -> Result<PipelineResult, ProviderError> {
    let config = ProviderRuntimeConfig {
        stt_provider: "groq".to_string(),
        stt_model: request.stt_model.clone(),
        rewrite_provider: "openai".to_string(),
        rewrite_model: request.rewrite_model.clone(),
    };
    validate_pipeline_readiness(&config, &provider_key_status())?;

    let groq_key = provider_key("groq")?;
    let openai_key = provider_key("openai")?;
    let stt_provider = GroqSttProvider::new(groq_key);
    let rewrite_provider = OpenAiRewriteProvider::new(openai_key);

    run_alpha_pipeline_with_clients(
        &config,
        request.audio_path.clone(),
        context,
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
    pub rendered_prompt: String,
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

        let body = serde_json::json!({
          "model": input.model,
          "instructions": input.system_prompt,
          "input": input.rendered_prompt
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
    context: PipelineContext,
    stt_provider: &S,
    rewrite_provider: &R,
) -> Result<PipelineResult, ProviderError>
where
    S: SttProvider,
    R: RewriteProvider,
{
    let stt_started = std::time::Instant::now();
    let transcript = stt_provider.transcribe(&SttInput {
        audio_path: audio_path.clone(),
        model: config.stt_model.clone(),
        language: None,
        prompt: (!context.dictionary_terms.is_empty()).then(|| context.dictionary_terms.join("\n")),
    })?;
    let stt_latency_ms = elapsed_ms(stt_started);

    let rendered_prompt = render_user_prompt(&context, &transcript);
    let rewrite_input = RewriteInput {
        transcript: transcript.clone(),
        model: config.rewrite_model.clone(),
        profile_name: context.profile_name,
        system_prompt: context.system_prompt,
        dictionary_terms: context.dictionary_terms,
        rendered_prompt,
    };

    let rewrite_started = std::time::Instant::now();
    match rewrite_provider.rewrite(&rewrite_input) {
        Ok(text) => Ok(PipelineResult {
            text,
            profile_id: context.profile_id,
            rewrite_fallback_used: false,
            stt_latency_ms,
            rewrite_latency_ms: Some(elapsed_ms(rewrite_started)),
            audio_seconds: wav_duration_seconds(std::path::Path::new(&audio_path)),
        }),
        Err(error) => {
            log::warn!("Rewrite failed; falling back to raw transcript: {error}");
            Ok(PipelineResult {
                text: transcript,
                profile_id: context.profile_id,
                rewrite_fallback_used: true,
                stt_latency_ms,
                rewrite_latency_ms: Some(elapsed_ms(rewrite_started)),
                audio_seconds: wav_duration_seconds(std::path::Path::new(&audio_path)),
            })
        }
    }
}

fn render_user_prompt(context: &PipelineContext, transcript: &str) -> String {
    let dictionary = if context.dictionary_terms.is_empty() {
        "No dictionary terms.".to_string()
    } else {
        context.dictionary_terms.join("\n")
    };
    context
        .user_prompt_template
        .replace("{{transcript}}", transcript)
        .replace("{{dictionaryTerms}}", &dictionary)
        .replace(
            "{{targetLanguage}}",
            context
                .target_language
                .as_deref()
                .unwrap_or("Not specified"),
        )
}

fn elapsed_ms(started: std::time::Instant) -> u64 {
    started.elapsed().as_millis().try_into().unwrap_or(u64::MAX)
}

fn wav_duration_seconds(path: &std::path::Path) -> Option<f64> {
    let reader = hound::WavReader::open(path).ok()?;
    let spec = reader.spec();
    let samples = f64::from(reader.duration());
    let samples_per_second = f64::from(spec.sample_rate) * f64::from(spec.channels);
    (samples_per_second > 0.0).then_some(samples / samples_per_second)
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
            PipelineContext {
                profile_id: "email".to_string(),
                profile_name: "Email".to_string(),
                system_prompt: "Write a concise email.".to_string(),
                user_prompt_template: "Transcript:\n{{transcript}}\nTerms:\n{{dictionaryTerms}}"
                    .to_string(),
                target_language: None,
                dictionary_terms: vec!["Gawspeak => Gospeak".to_string()],
            },
            &MockStt,
            &MockRewrite,
        )
        .unwrap();

        assert_eq!(result.text, "polished transcript");
        assert!(!result.rewrite_fallback_used);
        assert_eq!(result.profile_id, "email");
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
            PipelineContext {
                profile_id: "normal".to_string(),
                profile_name: "Normal".to_string(),
                system_prompt: "Clean the transcript.".to_string(),
                user_prompt_template: "{{transcript}}".to_string(),
                target_language: None,
                dictionary_terms: Vec::new(),
            },
            &MockStt,
            &FailingRewrite,
        )
        .unwrap();

        assert_eq!(result.text, "raw transcript");
        assert!(result.rewrite_fallback_used);
    }

    #[test]
    fn pipeline_injects_profile_and_dictionary_into_providers() {
        struct InspectingStt;
        impl SttProvider for InspectingStt {
            fn transcribe(&self, input: &SttInput) -> Result<String, ProviderError> {
                assert_eq!(input.prompt.as_deref(), Some("Gawspeak => Gospeak"));
                Ok("Gawspeak is useful".to_string())
            }
        }

        struct InspectingRewrite;
        impl RewriteProvider for InspectingRewrite {
            fn rewrite(&self, input: &RewriteInput) -> Result<String, ProviderError> {
                assert_eq!(input.profile_name, "Product Email");
                assert_eq!(input.system_prompt, "Write a concise product email.");
                assert_eq!(input.dictionary_terms, vec!["Gawspeak => Gospeak"]);
                assert!(input.rendered_prompt.contains("Gawspeak is useful"));
                assert!(input.rendered_prompt.contains("English"));
                Ok("Gospeak is useful.".to_string())
            }
        }

        let result = run_alpha_pipeline_with_clients(
            &ProviderRuntimeConfig {
                stt_provider: "groq".to_string(),
                stt_model: "whisper-large-v3-turbo".to_string(),
                rewrite_provider: "openai".to_string(),
                rewrite_model: "gpt-5-nano".to_string(),
            },
            "sample.wav".to_string(),
            PipelineContext {
                profile_id: "product_email".to_string(),
                profile_name: "Product Email".to_string(),
                system_prompt: "Write a concise product email.".to_string(),
                user_prompt_template:
                    "Target: {{targetLanguage}}\n{{transcript}}\n{{dictionaryTerms}}".to_string(),
                target_language: Some("English".to_string()),
                dictionary_terms: vec!["Gawspeak => Gospeak".to_string()],
            },
            &InspectingStt,
            &InspectingRewrite,
        )
        .unwrap();

        assert_eq!(result.text, "Gospeak is useful.");
        assert_eq!(result.profile_id, "product_email");
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
