use serde::{Deserialize, Serialize};
use std::io::BufRead;

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
    #[serde(default)]
    pub selected_text: Option<String>,
    #[serde(default)]
    pub skip_rewrite: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PipelineContext {
    pub profile_id: String,
    pub profile_name: String,
    pub profile_mode: String,
    pub system_prompt: String,
    pub user_prompt_template: String,
    pub target_language: Option<String>,
    pub dictionary_terms: Vec<String>,
    pub selected_text: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PipelineResult {
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
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PipelineOptions {
    pub skip_rewrite: bool,
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
    validate_pipeline_readiness_for_options(config, status, PipelineOptions::default())
}

pub fn validate_pipeline_readiness_for_options(
    config: &ProviderRuntimeConfig,
    status: &ProviderKeyStatus,
    options: PipelineOptions,
) -> Result<(), ProviderError> {
    match config.stt_provider.as_str() {
        "groq" if !status.groq => Err(ProviderError::MissingKey("groq".to_string())),
        "groq" => Ok(()),
        other => Err(ProviderError::UnsupportedProvider(other.to_string())),
    }?;

    if options.skip_rewrite {
        return Ok(());
    }

    match config.rewrite_provider.as_str() {
        "openai" if !status.openai => Err(ProviderError::MissingKey("openai".to_string())),
        "openai" => Ok(()),
        other => Err(ProviderError::UnsupportedProvider(other.to_string())),
    }
}

fn validate_audio_file_pipeline_readiness(
    config: &ProviderRuntimeConfig,
    status: &ProviderKeyStatus,
) -> Result<(), ProviderError> {
    validate_pipeline_readiness_for_options(config, status, PipelineOptions { skip_rewrite: true })
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
    let options = PipelineOptions {
        skip_rewrite: request.skip_rewrite && request.selected_text.is_none(),
    };
    validate_audio_file_pipeline_readiness(
        &config,
        &ProviderKeyStatus::from_presence(has_provider_key("groq"), false),
    )?;

    let groq_key = provider_key("groq")?;
    let stt_provider = GroqSttProvider::new(groq_key);
    let rewrite_provider = DeferredOpenAiRewriteProvider;

    run_alpha_pipeline_with_clients(
        &config,
        request.audio_path.clone(),
        context,
        options,
        &stt_provider,
        &rewrite_provider,
    )
}

fn has_provider_key(provider: &str) -> bool {
    provider_key(provider).is_ok()
}

pub(crate) fn provider_key(provider: &str) -> Result<String, ProviderError> {
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct RewriteUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RewriteOutput {
    pub text: String,
    pub usage: Option<RewriteUsage>,
}

pub trait SttProvider {
    fn transcribe(&self, input: &SttInput) -> Result<String, ProviderError>;
}

pub trait RewriteProvider {
    fn rewrite(&self, input: &RewriteInput) -> Result<RewriteOutput, ProviderError>;
}

#[derive(Debug, Clone)]
pub struct GroqSttProvider {
    api_key: String,
    base_url: String,
    client: reqwest::blocking::Client,
}

impl GroqSttProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: "https://api.groq.com/openai/v1".to_string(),
            client: shared_http_client(),
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

        let response = self
            .client
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
    client: reqwest::blocking::Client,
}

impl OpenAiRewriteProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: "https://api.openai.com/v1".to_string(),
            client: shared_http_client(),
        }
    }

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
            .map_err(|error| {
                ProviderError::Http(format!("OpenAI rewrite request failed: {error}"))
            })?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().map_err(|error| {
                ProviderError::Http(format!("OpenAI rewrite response read failed: {error}"))
            })?;
            return Err(ProviderError::Http(format!(
                "OpenAI rewrite returned HTTP {status}: {}",
                sanitize_provider_body(&body)
            )));
        }

        let mut full_text = String::new();
        for line in std::io::BufReader::new(response).lines() {
            match parse_openai_streaming_event(&line.map_err(|error| {
                ProviderError::Http(format!("OpenAI rewrite response read failed: {error}"))
            })?)? {
                OpenAiStreamingEvent::TextDelta(delta) => {
                    full_text.push_str(&delta);
                    on_delta(&delta)?;
                }
                OpenAiStreamingEvent::Done => break,
                OpenAiStreamingEvent::Ignored => {}
            }
        }

        let text = full_text.trim();
        if text.is_empty() {
            return Err(ProviderError::ProviderResponse(
                "OpenAI rewrite response did not include output_text".to_string(),
            ));
        }

        Ok(RewriteOutput {
            text: text.to_string(),
            usage: None,
        })
    }
}

impl RewriteProvider for OpenAiRewriteProvider {
    fn rewrite(&self, input: &RewriteInput) -> Result<RewriteOutput, ProviderError> {
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

        let response = self
            .client
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

        parse_openai_rewrite_response(&body)
    }
}

struct DeferredOpenAiRewriteProvider;

impl RewriteProvider for DeferredOpenAiRewriteProvider {
    fn rewrite(&self, input: &RewriteInput) -> Result<RewriteOutput, ProviderError> {
        OpenAiRewriteProvider::new(provider_key("openai")?).rewrite(input)
    }
}

pub(crate) fn render_light_rewrite_model_prompt(
    context: &PipelineContext,
    transcript: &str,
    reason: crate::light_rewrite::LightRewriteReason,
) -> String {
    let mut prompt = render_user_prompt(context, transcript);
    match reason {
        crate::light_rewrite::LightRewriteReason::SemanticList => prompt.push_str(
            "\n\nInternal formatting instruction: if the transcript contains parallel list items, return a numbered list with one item per line. Preserve any short title before the list.",
        ),
        crate::light_rewrite::LightRewriteReason::LongText => prompt.push_str(
            "\n\nInternal formatting instruction: repair punctuation and sentence breaks conservatively. Return only the final text.",
        ),
    }
    prompt
}

fn no_speech_pipeline_result(
    context: &PipelineContext,
    audio_path: &str,
    stt_latency_ms: u64,
) -> PipelineResult {
    let path = std::path::Path::new(audio_path);
    PipelineResult {
        text: String::new(),
        profile_id: context.profile_id.clone(),
        rewrite_fallback_used: false,
        stt_latency_ms,
        rewrite_latency_ms: None,
        audio_seconds: wav_duration_seconds(path),
        audio_file_bytes: audio_file_bytes(path),
        fast_path_used: false,
        no_speech: true,
        rewrite_input_tokens: None,
        rewrite_output_tokens: None,
    }
}

fn wav_has_speech(path: &std::path::Path) -> Option<bool> {
    let mut reader = hound::WavReader::open(path).ok()?;
    let spec = reader.spec();
    let duration_samples = reader.duration();
    let samples_per_second = u32::from(spec.channels).saturating_mul(spec.sample_rate);
    if samples_per_second == 0 || duration_samples < samples_per_second / 4 {
        return Some(false);
    }

    let mut total_samples = 0u64;
    let mut sum_squares = 0f64;
    let mut max_abs = 0f64;
    let mut add_sample = |value: f64| {
        let abs = value.abs();
        max_abs = max_abs.max(abs);
        sum_squares += value * value;
        total_samples += 1;
    };

    match spec.sample_format {
        hound::SampleFormat::Float => {
            for sample in reader.samples::<f32>() {
                let value = sample.ok()? as f64 * 32767.0;
                add_sample(value);
            }
        }
        hound::SampleFormat::Int if spec.bits_per_sample <= 16 => {
            for sample in reader.samples::<i16>() {
                add_sample(sample.ok()? as f64);
            }
        }
        hound::SampleFormat::Int => {
            let scale = if spec.bits_per_sample > 16 {
                2f64.powi(i32::from(spec.bits_per_sample) - 16)
            } else {
                1.0
            };
            for sample in reader.samples::<i32>() {
                add_sample(sample.ok()? as f64 / scale);
            }
        }
    }

    if total_samples == 0 {
        return Some(false);
    }
    let rms = (sum_squares / total_samples as f64).sqrt();
    Some(!(max_abs < 500.0 && rms < 80.0))
}

pub fn run_alpha_pipeline_with_clients<S, R>(
    config: &ProviderRuntimeConfig,
    audio_path: String,
    context: PipelineContext,
    options: PipelineOptions,
    stt_provider: &S,
    rewrite_provider: &R,
) -> Result<PipelineResult, ProviderError>
where
    S: SttProvider,
    R: RewriteProvider,
{
    if matches!(
        wav_has_speech(std::path::Path::new(&audio_path)),
        Some(false)
    ) {
        return Ok(no_speech_pipeline_result(&context, &audio_path, 0));
    }

    let stt_started = std::time::Instant::now();
    let transcript = stt_provider.transcribe(&SttInput {
        audio_path: audio_path.clone(),
        model: config.stt_model.clone(),
        language: None,
        prompt: (!context.dictionary_terms.is_empty()).then(|| context.dictionary_terms.join("\n")),
    })?;
    let stt_latency_ms = elapsed_ms(stt_started);
    let light_rewrite_profile_mode = if options.skip_rewrite && context.selected_text.is_none() {
        "normal".to_string()
    } else {
        context.profile_mode.clone()
    };
    let light_rewrite_decision = crate::light_rewrite::light_rewrite(
        &transcript,
        &crate::light_rewrite::LightRewriteContext {
            profile_mode: light_rewrite_profile_mode,
            selected_text: context.selected_text.clone(),
        },
    );
    let model_reason = match light_rewrite_decision {
        crate::light_rewrite::LightRewriteDecision::Local(output) => {
            return Ok(PipelineResult {
                text: output.text,
                profile_id: context.profile_id,
                rewrite_fallback_used: false,
                stt_latency_ms,
                rewrite_latency_ms: None,
                audio_seconds: wav_duration_seconds(std::path::Path::new(&audio_path)),
                audio_file_bytes: audio_file_bytes(std::path::Path::new(&audio_path)),
                fast_path_used: true,
                no_speech: false,
                rewrite_input_tokens: None,
                rewrite_output_tokens: None,
            });
        }
        crate::light_rewrite::LightRewriteDecision::NoSpeech => {
            return Ok(no_speech_pipeline_result(
                &context,
                &audio_path,
                stt_latency_ms,
            ));
        }
        crate::light_rewrite::LightRewriteDecision::NeedsModel(reason) => Some(reason),
        crate::light_rewrite::LightRewriteDecision::NotApplicable => None,
    };

    let skip_rewrite = options.skip_rewrite && context.selected_text.is_none();
    let rendered_prompt = match model_reason {
        Some(reason) if skip_rewrite => {
            render_light_rewrite_model_prompt(&context, &transcript, reason)
        }
        _ => render_user_prompt(&context, &transcript),
    };
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
        Ok(output) => {
            let usage = output.usage;
            Ok(PipelineResult {
                text: output.text,
                profile_id: context.profile_id,
                rewrite_fallback_used: false,
                stt_latency_ms,
                rewrite_latency_ms: Some(elapsed_ms(rewrite_started)),
                audio_seconds: wav_duration_seconds(std::path::Path::new(&audio_path)),
                audio_file_bytes: audio_file_bytes(std::path::Path::new(&audio_path)),
                fast_path_used: false,
                no_speech: false,
                rewrite_input_tokens: usage.map(|value| value.input_tokens),
                rewrite_output_tokens: usage.map(|value| value.output_tokens),
            })
        }
        Err(error) => {
            if let ProviderError::MissingKey(_) = &error {
                return Err(error);
            }
            if model_reason.is_some() {
                return Err(error);
            }
            if context.selected_text.is_some() {
                return Err(error);
            }
            log::warn!("Rewrite failed; falling back to raw transcript: {error}");
            Ok(PipelineResult {
                text: transcript,
                profile_id: context.profile_id,
                rewrite_fallback_used: true,
                stt_latency_ms,
                rewrite_latency_ms: Some(elapsed_ms(rewrite_started)),
                audio_seconds: wav_duration_seconds(std::path::Path::new(&audio_path)),
                audio_file_bytes: audio_file_bytes(std::path::Path::new(&audio_path)),
                fast_path_used: false,
                no_speech: false,
                rewrite_input_tokens: None,
                rewrite_output_tokens: None,
            })
        }
    }
}

pub fn run_alpha_pipeline_with_options<S, R>(
    config: &ProviderRuntimeConfig,
    audio_path: String,
    context: PipelineContext,
    options: PipelineOptions,
    stt_provider: &S,
    rewrite_provider: &R,
) -> Result<PipelineResult, ProviderError>
where
    S: SttProvider,
    R: RewriteProvider,
{
    run_alpha_pipeline_with_clients(
        config,
        audio_path,
        context,
        options,
        stt_provider,
        rewrite_provider,
    )
}

fn shared_http_client() -> reqwest::blocking::Client {
    static CLIENT: std::sync::OnceLock<reqwest::blocking::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(reqwest::blocking::Client::new).clone()
}

pub(crate) fn render_user_prompt(context: &PipelineContext, transcript: &str) -> String {
    if let Some(selected_text) = context
        .selected_text
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        return format!(
            "Selected text:\n{selected_text}\n\nSpoken edit instruction:\n{transcript}\n\nReturn only the replacement text for the selected text."
        );
    }

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

pub(crate) fn wav_duration_seconds(path: &std::path::Path) -> Option<f64> {
    let reader = hound::WavReader::open(path).ok()?;
    let spec = reader.spec();
    let samples = f64::from(reader.duration());
    let samples_per_second = f64::from(spec.sample_rate) * f64::from(spec.channels);
    (samples_per_second > 0.0).then_some(samples / samples_per_second)
}

pub(crate) fn audio_file_bytes(path: &std::path::Path) -> Option<u64> {
    std::fs::metadata(path).ok().map(|metadata| metadata.len())
}

pub fn estimate_groq_stt_cost_usd(model: &str, audio_seconds: Option<f64>) -> Option<f64> {
    let price_per_hour = match model {
        "whisper-large-v3-turbo" => 0.04,
        "whisper-large-v3" => 0.111,
        _ => return None,
    };
    audio_seconds
        .filter(|seconds| seconds.is_finite() && *seconds >= 0.0)
        .map(|seconds| (price_per_hour / 3600.0) * seconds)
}

pub fn estimate_openai_rewrite_cost_usd(model: &str, usage: Option<RewriteUsage>) -> Option<f64> {
    let (input_per_million, output_per_million) = match model {
        "gpt-5-nano" => (0.05, 0.4),
        "gpt-5-mini" => (0.25, 2.0),
        _ => return None,
    };
    usage.map(|usage| {
        (input_per_million / 1_000_000.0) * usage.input_tokens as f64
            + (output_per_million / 1_000_000.0) * usage.output_tokens as f64
    })
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

#[cfg(test)]
fn parse_openai_output_text(body: &str) -> Result<String, ProviderError> {
    Ok(parse_openai_rewrite_response(body)?.text)
}

fn parse_openai_rewrite_response(body: &str) -> Result<RewriteOutput, ProviderError> {
    let value: serde_json::Value = serde_json::from_str(body).map_err(|error| {
        ProviderError::ProviderResponse(format!("OpenAI rewrite returned invalid JSON: {error}"))
    })?;

    let text = if let Some(text) = value
        .get("output_text")
        .and_then(|output_text| output_text.as_str())
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        text.to_string()
    } else {
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
            })?
    };
    let usage = value.get("usage").and_then(|usage| {
        Some(RewriteUsage {
            input_tokens: usage.get("input_tokens")?.as_u64()?,
            output_tokens: usage.get("output_tokens")?.as_u64()?,
        })
    });
    Ok(RewriteOutput { text, usage })
}

#[derive(Debug, PartialEq, Eq)]
enum OpenAiStreamingEvent {
    TextDelta(String),
    Done,
    Ignored,
}

fn parse_openai_streaming_event(line: &str) -> Result<OpenAiStreamingEvent, ProviderError> {
    let Some(body) = line.strip_prefix("data: ") else {
        return Ok(OpenAiStreamingEvent::Ignored);
    };
    if body.trim() == "[DONE]" {
        return Ok(OpenAiStreamingEvent::Done);
    }

    let value: serde_json::Value = serde_json::from_str(body).map_err(|error| {
        ProviderError::ProviderResponse(format!(
            "OpenAI streaming rewrite returned invalid JSON: {error}"
        ))
    })?;

    if value.get("type").and_then(|kind| kind.as_str()) == Some("response.output_text.delta") {
        Ok(value
            .get("delta")
            .and_then(|delta| delta.as_str())
            .map(|delta| OpenAiStreamingEvent::TextDelta(delta.to_string()))
            .unwrap_or(OpenAiStreamingEvent::Ignored))
    } else {
        Ok(OpenAiStreamingEvent::Ignored)
    }
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
    fn parses_openai_usage_tokens_for_cost_tracking() {
        let output = parse_openai_rewrite_response(
            r#"{"output_text":" Polished text. ","usage":{"input_tokens":1234,"output_tokens":456}}"#,
        )
        .unwrap();

        assert_eq!(output.text, "Polished text.");
        assert_eq!(
            output.usage,
            Some(RewriteUsage {
                input_tokens: 1234,
                output_tokens: 456,
            }),
        );
    }

    #[test]
    fn parses_openai_response_text_delta_from_sse_line() {
        let line = r#"data: {"type":"response.output_text.delta","delta":"hello"}"#;

        assert_eq!(
            super::parse_openai_streaming_event(line).unwrap(),
            OpenAiStreamingEvent::TextDelta("hello".to_string())
        );
    }

    #[test]
    fn parses_openai_streaming_done_from_sse_line() {
        assert_eq!(
            super::parse_openai_streaming_event("data: [DONE]").unwrap(),
            OpenAiStreamingEvent::Done
        );
    }

    #[test]
    fn ignores_openai_streaming_non_data_line() {
        assert_eq!(
            super::parse_openai_streaming_event("event: response.output_text.delta").unwrap(),
            OpenAiStreamingEvent::Ignored
        );
    }

    #[test]
    fn rejects_invalid_openai_streaming_json_after_data_prefix() {
        assert!(matches!(
            super::parse_openai_streaming_event("data: {not json"),
            Err(ProviderError::ProviderResponse(message))
                if message.starts_with("OpenAI streaming rewrite returned invalid JSON:")
        ));
    }

    #[test]
    fn estimates_provider_costs_from_real_usage_units() {
        assert_eq!(
            estimate_groq_stt_cost_usd("whisper-large-v3-turbo", Some(90.0)),
            Some(0.001),
        );
        assert_eq!(
            estimate_openai_rewrite_cost_usd(
                "gpt-5-mini",
                Some(RewriteUsage {
                    input_tokens: 1000,
                    output_tokens: 2000,
                }),
            ),
            Some(0.00425),
        );
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
            fn rewrite(&self, input: &RewriteInput) -> Result<RewriteOutput, ProviderError> {
                assert_eq!(input.model, "gpt-5-nano");
                assert_eq!(input.transcript, "raw transcript");
                Ok(RewriteOutput {
                    text: "polished transcript".to_string(),
                    usage: Some(RewriteUsage {
                        input_tokens: 100,
                        output_tokens: 25,
                    }),
                })
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
                profile_mode: "prompt".to_string(),
                system_prompt: "Write a concise email.".to_string(),
                user_prompt_template: "Transcript:\n{{transcript}}\nTerms:\n{{dictionaryTerms}}"
                    .to_string(),
                target_language: None,
                dictionary_terms: vec!["Gawspeak => Gospeak".to_string()],
                selected_text: None,
            },
            PipelineOptions::default(),
            &MockStt,
            &MockRewrite,
        )
        .unwrap();

        assert_eq!(result.text, "polished transcript");
        assert!(!result.rewrite_fallback_used);
        assert_eq!(result.profile_id, "email");
        assert_eq!(result.rewrite_input_tokens, Some(100));
        assert_eq!(result.rewrite_output_tokens, Some(25));
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
            fn rewrite(&self, _input: &RewriteInput) -> Result<RewriteOutput, ProviderError> {
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
                profile_mode: "prompt".to_string(),
                system_prompt: "Clean the transcript.".to_string(),
                user_prompt_template: "{{transcript}}".to_string(),
                target_language: None,
                dictionary_terms: Vec::new(),
                selected_text: None,
            },
            PipelineOptions::default(),
            &MockStt,
            &FailingRewrite,
        )
        .unwrap();

        assert_eq!(result.text, "raw transcript");
        assert!(result.rewrite_fallback_used);
    }

    #[test]
    fn returns_missing_rewrite_key_instead_of_raw_transcript() {
        struct MockStt;
        impl SttProvider for MockStt {
            fn transcribe(&self, _input: &SttInput) -> Result<String, ProviderError> {
                Ok("raw transcript".to_string())
            }
        }

        struct MissingKeyRewrite;
        impl RewriteProvider for MissingKeyRewrite {
            fn rewrite(&self, _input: &RewriteInput) -> Result<RewriteOutput, ProviderError> {
                Err(ProviderError::MissingKey("openai".to_string()))
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
                profile_id: "normal".to_string(),
                profile_name: "Normal".to_string(),
                profile_mode: "prompt".to_string(),
                system_prompt: "Clean the transcript.".to_string(),
                user_prompt_template: "{{transcript}}".to_string(),
                target_language: None,
                dictionary_terms: Vec::new(),
                selected_text: None,
            },
            PipelineOptions::default(),
            &MockStt,
            &MissingKeyRewrite,
        );

        assert!(matches!(result, Err(ProviderError::MissingKey(provider)) if provider == "openai"));
    }

    #[test]
    fn fast_mode_applies_light_rewrite_without_llm_rewrite() {
        struct MockStt;
        impl SttProvider for MockStt {
            fn transcribe(&self, _input: &SttInput) -> Result<String, ProviderError> {
                Ok("raw transcript".to_string())
            }
        }

        struct PanickingRewrite;
        impl RewriteProvider for PanickingRewrite {
            fn rewrite(&self, _input: &RewriteInput) -> Result<RewriteOutput, ProviderError> {
                panic!("fast mode should not call rewrite");
            }
        }

        let result = run_alpha_pipeline_with_options(
            &ProviderRuntimeConfig {
                stt_provider: "groq".to_string(),
                stt_model: "whisper-large-v3-turbo".to_string(),
                rewrite_provider: "openai".to_string(),
                rewrite_model: "gpt-5-nano".to_string(),
            },
            "sample.wav".to_string(),
            PipelineContext {
                profile_id: "normal".to_string(),
                profile_name: "Normal".to_string(),
                profile_mode: "prompt".to_string(),
                system_prompt: "Clean the transcript.".to_string(),
                user_prompt_template: "{{transcript}}".to_string(),
                target_language: None,
                dictionary_terms: Vec::new(),
                selected_text: None,
            },
            PipelineOptions { skip_rewrite: true },
            &MockStt,
            &PanickingRewrite,
        )
        .unwrap();

        assert_eq!(result.text, "Raw transcript.");
        assert!(result.fast_path_used);
        assert_eq!(result.rewrite_latency_ms, None);
    }

    #[test]
    fn fast_mode_applies_light_rewrite_for_prompt_profile() {
        struct MockStt;
        impl SttProvider for MockStt {
            fn transcribe(&self, _input: &SttInput) -> Result<String, ProviderError> {
                Ok("\u{51e0}\u{4e2a}\u{70b9}\u{5e2e}\u{6211}\u{8bb0}\u{5f55}\u{4e00}\u{4e0b}\u{4e00},UI\u{9700}\u{8981}\u{5168}\u{90e8}\u{91cd}\u{6784}\u{4e8c},logo\u{9700}\u{8981}\u{6362}\u{4e00}\u{4e2a}\u{65b0}\u{7684}\u{4e09},\u{5c31}\u{662f}\u{8fd9}\u{4e2a}\u{76d1}\u{542c}\u{72b6}\u{6001}\u{7684}\u{60ac}\u{6d6e}\u{7a97}\u{7684}\u{56fe}\u{6807}\u{8981}\u{91cd}\u{65b0}\u{505a}\u{4e00}\u{4e0b}".to_string())
            }
        }

        struct PanickingRewrite;
        impl RewriteProvider for PanickingRewrite {
            fn rewrite(&self, _input: &RewriteInput) -> Result<RewriteOutput, ProviderError> {
                panic!("fast light rewrite should not call rewrite");
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
                profile_id: "prompt_profile".to_string(),
                profile_name: "Prompt".to_string(),
                profile_mode: "prompt".to_string(),
                system_prompt: "Format notes.".to_string(),
                user_prompt_template: "{{transcript}}".to_string(),
                target_language: None,
                dictionary_terms: Vec::new(),
                selected_text: None,
            },
            PipelineOptions { skip_rewrite: true },
            &MockStt,
            &PanickingRewrite,
        )
        .unwrap();

        assert_eq!(
            result.text,
            "\u{51e0}\u{4e2a}\u{70b9}\u{5e2e}\u{6211}\u{8bb0}\u{5f55}\u{4e00}\u{4e0b}\n1. UI\u{9700}\u{8981}\u{5168}\u{90e8}\u{91cd}\u{6784}\n2. logo\u{9700}\u{8981}\u{6362}\u{4e00}\u{4e2a}\u{65b0}\u{7684}\n3. \u{76d1}\u{542c}\u{72b6}\u{6001}\u{7684}\u{60ac}\u{6d6e}\u{7a97}\u{7684}\u{56fe}\u{6807}\u{8981}\u{91cd}\u{65b0}\u{505a}\u{4e00}\u{4e0b}"
        );
        assert!(result.fast_path_used);
        assert_eq!(result.rewrite_latency_ms, None);
    }

    #[test]
    fn speak_to_edit_ignores_fast_mode_skip_rewrite() {
        struct MockStt;
        impl SttProvider for MockStt {
            fn transcribe(&self, _input: &SttInput) -> Result<String, ProviderError> {
                Ok("make it concise".to_string())
            }
        }

        struct CountingRewrite {
            calls: std::cell::Cell<u32>,
        }
        impl RewriteProvider for CountingRewrite {
            fn rewrite(&self, input: &RewriteInput) -> Result<RewriteOutput, ProviderError> {
                self.calls.set(self.calls.get() + 1);
                assert_eq!(input.transcript, "make it concise");
                Ok(RewriteOutput {
                    text: "Concise selected text.".to_string(),
                    usage: None,
                })
            }
        }

        let rewrite = CountingRewrite {
            calls: std::cell::Cell::new(0),
        };
        let result = run_alpha_pipeline_with_clients(
            &ProviderRuntimeConfig {
                stt_provider: "groq".to_string(),
                stt_model: "whisper-large-v3-turbo".to_string(),
                rewrite_provider: "openai".to_string(),
                rewrite_model: "gpt-5-nano".to_string(),
            },
            "sample.wav".to_string(),
            PipelineContext {
                profile_id: "normal".to_string(),
                profile_name: "Normal".to_string(),
                profile_mode: "normal".to_string(),
                system_prompt: "Edit the selected text.".to_string(),
                user_prompt_template: "{{transcript}}".to_string(),
                target_language: None,
                dictionary_terms: Vec::new(),
                selected_text: Some("Selected text that should be rewritten.".to_string()),
            },
            PipelineOptions { skip_rewrite: true },
            &MockStt,
            &rewrite,
        )
        .unwrap();

        assert_eq!(result.text, "Concise selected text.");
        assert_eq!(rewrite.calls.get(), 1);
        assert!(!result.fast_path_used);
    }

    #[test]
    fn light_rewrite_formats_short_list_in_fast_mode_without_rewrite_provider() {
        struct MockStt;
        impl SttProvider for MockStt {
            fn transcribe(&self, _input: &SttInput) -> Result<String, ProviderError> {
                Ok("\u{4ee3}\u{529e}\u{4e8b}\u{9879}\u{7b2c}\u{4e00}\u{4e70}\u{725b}\u{5976}\u{7b2c}\u{4e8c}\u{56de}\u{590d}\u{90ae}\u{4ef6}".to_string())
            }
        }

        struct PanickingRewrite;
        impl RewriteProvider for PanickingRewrite {
            fn rewrite(&self, _input: &RewriteInput) -> Result<RewriteOutput, ProviderError> {
                panic!("light rewrite should not call rewrite");
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
                profile_id: "normal".to_string(),
                profile_name: "Normal".to_string(),
                profile_mode: "normal".to_string(),
                system_prompt: "Clean the transcript.".to_string(),
                user_prompt_template: "{{transcript}}".to_string(),
                target_language: None,
                dictionary_terms: Vec::new(),
                selected_text: None,
            },
            PipelineOptions { skip_rewrite: true },
            &MockStt,
            &PanickingRewrite,
        )
        .unwrap();

        assert_eq!(
            result.text,
            "\u{4ee3}\u{529e}\u{4e8b}\u{9879}\n1. \u{4e70}\u{725b}\u{5976}\n2. \u{56de}\u{590d}\u{90ae}\u{4ef6}"
        );
        assert!(result.fast_path_used);
        assert_eq!(result.rewrite_latency_ms, None);
    }

    #[test]
    fn fast_mode_uses_rewrite_when_light_rewrite_needs_model() {
        struct MockStt;
        impl SttProvider for MockStt {
            fn transcribe(&self, _input: &SttInput) -> Result<String, ProviderError> {
                Ok("\u{4eca}\u{5929}\u{6211}\u{4eec}\u{9700}\u{8981}\u{8ba8}\u{8bba}\u{4ea7}\u{54c1}\u{5ef6}\u{8fdf}\u{7684}\u{539f}\u{56e0}\u{548c}\u{540e}\u{7eed}\u{4fee}\u{590d}\u{8ba1}\u{5212}\u{7136}\u{540e}\u{628a}\u{7ed3}\u{8bba}\u{540c}\u{6b65}\u{7ed9}\u{8bbe}\u{8ba1}\u{548c}\u{5de5}\u{7a0b}\u{56e2}\u{961f}\u{5e76}\u{660e}\u{786e}\u{8d23}\u{4efb}\u{4eba}\u{548c}\u{65f6}\u{95f4}\u{8282}\u{70b9}\u{4ee5}\u{53ca}\u{9a8c}\u{6536}\u{6807}\u{51c6}".to_string())
            }
        }

        struct CountingRewrite {
            calls: std::cell::Cell<u32>,
        }
        impl RewriteProvider for CountingRewrite {
            fn rewrite(&self, input: &RewriteInput) -> Result<RewriteOutput, ProviderError> {
                self.calls.set(self.calls.get() + 1);
                assert!(input.rendered_prompt.contains("\u{4eca}\u{5929}"));
                Ok(RewriteOutput {
                    text: "\u{4eca}\u{5929}\u{9700}\u{8981}\u{8ba8}\u{8bba}\u{4ea7}\u{54c1}\u{5ef6}\u{8fdf}\u{3002}".to_string(),
                    usage: None,
                })
            }
        }

        let rewrite = CountingRewrite {
            calls: std::cell::Cell::new(0),
        };
        let result = run_alpha_pipeline_with_clients(
            &ProviderRuntimeConfig {
                stt_provider: "groq".to_string(),
                stt_model: "whisper-large-v3-turbo".to_string(),
                rewrite_provider: "openai".to_string(),
                rewrite_model: "gpt-5-nano".to_string(),
            },
            "sample.wav".to_string(),
            PipelineContext {
                profile_id: "normal".to_string(),
                profile_name: "Normal".to_string(),
                profile_mode: "normal".to_string(),
                system_prompt: "Clean the transcript.".to_string(),
                user_prompt_template: "{{transcript}}".to_string(),
                target_language: None,
                dictionary_terms: Vec::new(),
                selected_text: None,
            },
            PipelineOptions { skip_rewrite: true },
            &MockStt,
            &rewrite,
        )
        .unwrap();

        assert_eq!(rewrite.calls.get(), 1);
        assert_eq!(result.text, "\u{4eca}\u{5929}\u{9700}\u{8981}\u{8ba8}\u{8bba}\u{4ea7}\u{54c1}\u{5ef6}\u{8fdf}\u{3002}");
        assert!(!result.fast_path_used);
    }

    #[test]
    fn fast_mode_missing_rewrite_key_does_not_paste_raw_when_model_is_required() {
        struct MockStt;
        impl SttProvider for MockStt {
            fn transcribe(&self, _input: &SttInput) -> Result<String, ProviderError> {
                Ok("\u{4eca}\u{5929}\u{6211}\u{4eec}\u{9700}\u{8981}\u{8ba8}\u{8bba}\u{4ea7}\u{54c1}\u{5ef6}\u{8fdf}\u{7684}\u{539f}\u{56e0}\u{548c}\u{540e}\u{7eed}\u{4fee}\u{590d}\u{8ba1}\u{5212}\u{7136}\u{540e}\u{628a}\u{7ed3}\u{8bba}\u{540c}\u{6b65}\u{7ed9}\u{8bbe}\u{8ba1}\u{548c}\u{5de5}\u{7a0b}\u{56e2}\u{961f}\u{5e76}\u{660e}\u{786e}\u{8d23}\u{4efb}\u{4eba}\u{548c}\u{65f6}\u{95f4}\u{8282}\u{70b9}\u{4ee5}\u{53ca}\u{9a8c}\u{6536}\u{6807}\u{51c6}".to_string())
            }
        }

        struct MissingKeyRewrite;
        impl RewriteProvider for MissingKeyRewrite {
            fn rewrite(&self, _input: &RewriteInput) -> Result<RewriteOutput, ProviderError> {
                Err(ProviderError::MissingKey("openai".to_string()))
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
                profile_id: "normal".to_string(),
                profile_name: "Normal".to_string(),
                profile_mode: "normal".to_string(),
                system_prompt: "Clean the transcript.".to_string(),
                user_prompt_template: "{{transcript}}".to_string(),
                target_language: None,
                dictionary_terms: Vec::new(),
                selected_text: None,
            },
            PipelineOptions { skip_rewrite: true },
            &MockStt,
            &MissingKeyRewrite,
        );

        assert!(matches!(result, Err(ProviderError::MissingKey(provider)) if provider == "openai"));
    }

    #[test]
    fn filler_only_stt_result_returns_no_speech_without_rewrite() {
        struct MockStt;
        impl SttProvider for MockStt {
            fn transcribe(&self, _input: &SttInput) -> Result<String, ProviderError> {
                Ok("\u{55ef} \u{5443}".to_string())
            }
        }

        struct PanickingRewrite;
        impl RewriteProvider for PanickingRewrite {
            fn rewrite(&self, _input: &RewriteInput) -> Result<RewriteOutput, ProviderError> {
                panic!("no speech should not call rewrite");
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
                profile_id: "normal".to_string(),
                profile_name: "Normal".to_string(),
                profile_mode: "normal".to_string(),
                system_prompt: "Clean the transcript.".to_string(),
                user_prompt_template: "{{transcript}}".to_string(),
                target_language: None,
                dictionary_terms: Vec::new(),
                selected_text: None,
            },
            PipelineOptions::default(),
            &MockStt,
            &PanickingRewrite,
        )
        .unwrap();

        assert!(result.no_speech);
        assert_eq!(result.text, "");
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
            fn rewrite(&self, input: &RewriteInput) -> Result<RewriteOutput, ProviderError> {
                assert_eq!(input.profile_name, "Product Email");
                assert_eq!(input.system_prompt, "Write a concise product email.");
                assert_eq!(input.dictionary_terms, vec!["Gawspeak => Gospeak"]);
                assert!(input.rendered_prompt.contains("Gawspeak is useful"));
                assert!(input.rendered_prompt.contains("English"));
                Ok(RewriteOutput {
                    text: "Gospeak is useful.".to_string(),
                    usage: None,
                })
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
                profile_mode: "prompt".to_string(),
                system_prompt: "Write a concise product email.".to_string(),
                user_prompt_template:
                    "Target: {{targetLanguage}}\n{{transcript}}\n{{dictionaryTerms}}".to_string(),
                target_language: Some("English".to_string()),
                dictionary_terms: vec!["Gawspeak => Gospeak".to_string()],
                selected_text: None,
            },
            PipelineOptions::default(),
            &InspectingStt,
            &InspectingRewrite,
        )
        .unwrap();

        assert_eq!(result.text, "Gospeak is useful.");
        assert_eq!(result.profile_id, "product_email");
    }

    #[test]
    fn speak_to_edit_prompt_uses_selected_text_and_spoken_instruction() {
        struct MockStt;
        impl SttProvider for MockStt {
            fn transcribe(&self, _input: &SttInput) -> Result<String, ProviderError> {
                Ok("make this clearer and fix the typo".to_string())
            }
        }

        struct InspectingRewrite;
        impl RewriteProvider for InspectingRewrite {
            fn rewrite(&self, input: &RewriteInput) -> Result<RewriteOutput, ProviderError> {
                assert_eq!(input.transcript, "make this clearer and fix the typo");
                assert!(input.rendered_prompt.contains("Selected text:"));
                assert!(input
                    .rendered_prompt
                    .contains("Turing research center will all of you"));
                assert!(input.rendered_prompt.contains("Spoken edit instruction:"));
                assert!(input
                    .rendered_prompt
                    .contains("make this clearer and fix the typo"));
                assert!(input
                    .rendered_prompt
                    .contains("Return only the replacement text"));
                Ok(RewriteOutput {
                    text: "I would like to share our vision and mission for the Turing Research Center with all of you.".to_string(),
                    usage: None,
                })
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
                profile_id: "normal".to_string(),
                profile_name: "Normal".to_string(),
                profile_mode: "normal".to_string(),
                system_prompt: "Clean the transcript.".to_string(),
                user_prompt_template: "{{transcript}}".to_string(),
                target_language: None,
                dictionary_terms: Vec::new(),
                selected_text: Some(
                    "Looking forward, I would like to share our vision and mission for Turing research center will all of you.".to_string(),
                ),
            },
            PipelineOptions::default(),
            &MockStt,
            &InspectingRewrite,
        )
        .unwrap();

        assert_eq!(
            result.text,
            "I would like to share our vision and mission for the Turing Research Center with all of you."
        );
    }

    #[test]
    fn speak_to_edit_returns_rewrite_error_instead_of_raw_instruction() {
        struct MockStt;
        impl SttProvider for MockStt {
            fn transcribe(&self, _input: &SttInput) -> Result<String, ProviderError> {
                Ok("make it shorter".to_string())
            }
        }

        struct MissingKeyRewrite;
        impl RewriteProvider for MissingKeyRewrite {
            fn rewrite(&self, _input: &RewriteInput) -> Result<RewriteOutput, ProviderError> {
                Err(ProviderError::MissingKey("openai".to_string()))
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
                profile_id: "normal".to_string(),
                profile_name: "Normal".to_string(),
                profile_mode: "normal".to_string(),
                system_prompt: "Clean the transcript.".to_string(),
                user_prompt_template: "{{transcript}}".to_string(),
                target_language: None,
                dictionary_terms: Vec::new(),
                selected_text: Some("This sentence is too long.".to_string()),
            },
            PipelineOptions::default(),
            &MockStt,
            &MissingKeyRewrite,
        );

        assert!(matches!(result, Err(ProviderError::MissingKey(provider)) if provider == "openai"));
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

    #[test]
    fn fast_mode_readiness_allows_missing_openai_key() {
        let config = ProviderRuntimeConfig {
            stt_provider: "groq".to_string(),
            stt_model: "whisper-large-v3-turbo".to_string(),
            rewrite_provider: "openai".to_string(),
            rewrite_model: "gpt-5-nano".to_string(),
        };

        let result = validate_pipeline_readiness_for_options(
            &config,
            &ProviderKeyStatus::from_presence(true, false),
            PipelineOptions { skip_rewrite: true },
        );

        assert!(result.is_ok());
    }

    #[test]
    fn audio_file_pipeline_readiness_only_requires_stt_key() {
        let config = ProviderRuntimeConfig {
            stt_provider: "groq".to_string(),
            stt_model: "whisper-large-v3-turbo".to_string(),
            rewrite_provider: "openai".to_string(),
            rewrite_model: "gpt-5-nano".to_string(),
        };

        let result = validate_audio_file_pipeline_readiness(
            &config,
            &ProviderKeyStatus::from_presence(true, false),
        );

        assert!(result.is_ok());
    }
}
