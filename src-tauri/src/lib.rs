pub mod app_context;
pub mod audio;
pub mod clipboard;
mod light_rewrite;
pub mod provider;
mod qwen_local;
pub mod storage;
mod streaming;

use provider::{
    estimate_deepseek_rewrite_cost_usd, estimate_groq_stt_cost_usd,
    estimate_openai_rewrite_cost_usd, provider_key_status, run_alpha_pipeline,
    run_audio_file_pipeline, save_provider_key, AudioFilePipelineRequest, PipelineContext,
    PipelineResult, ProviderRuntimeConfig, RewriteUsage,
};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[derive(Default)]
struct RecordingState {
    active: Mutex<Option<audio::ActiveRecording>>,
    streaming_chunks: std::sync::Arc<Mutex<Vec<Vec<i16>>>>,
}

fn output_character_count(text: &str) -> u64 {
    u64::try_from(
        text.chars()
            .filter(|character| !character.is_whitespace())
            .count(),
    )
    .unwrap_or(u64::MAX)
}

#[tauri::command]
fn check_provider_keys() -> provider::ProviderKeyStatus {
    provider_key_status()
}

#[tauri::command]
fn save_provider_api_key(
    provider: String,
    api_key: String,
) -> Result<provider::ProviderKeyStatus, String> {
    save_provider_key(&provider, &api_key)
}

#[tauri::command]
fn remove_provider_api_key(provider: String) -> Result<(), String> {
    provider::remove_provider_key(&provider)
}

#[tauri::command]
fn check_provider_configuration_keys(
    configurations: Vec<provider::ProviderCredentialQuery>,
) -> std::collections::HashMap<String, bool> {
    provider::provider_configuration_key_status(&configurations)
}

#[tauri::command]
fn save_provider_configuration_api_key(
    config_id: String,
    provider: String,
    api_key: String,
) -> Result<(), String> {
    provider::save_provider_configuration_key(&config_id, &provider, &api_key)
}

#[tauri::command]
fn remove_provider_configuration_api_key(
    config_id: String,
    provider: String,
) -> Result<(), String> {
    provider::remove_provider_configuration_key(&config_id, &provider)
}

#[tauri::command]
fn migrate_provider_configuration_api_key(
    config_id: String,
    provider: String,
) -> Result<bool, String> {
    provider::migrate_provider_configuration_key(&config_id, &provider)
}

#[tauri::command]
fn validate_alpha_pipeline(config: ProviderRuntimeConfig) -> Result<String, String> {
    run_alpha_pipeline(&config).map_err(|error| error.to_string())
}

#[tauri::command]
fn run_audio_file_dictation(
    app: tauri::AppHandle,
    qwen_state: tauri::State<'_, qwen_local::QwenLocalProcessState>,
    mut request: AudioFilePipelineRequest,
) -> Result<PipelineResult, String> {
    let database = open_app_database(&app)?;
    let providers = storage::resolve_active_provider_pipeline(&database)?;
    request.stt_config_id = Some(providers.stt_config_id);
    request.stt_provider = providers.stt_provider;
    request.stt_model = providers.stt_model;
    request.stt_base_url = providers.stt_base_url;
    request.rewrite_config_id = Some(providers.rewrite_config_id);
    request.rewrite_provider = providers.rewrite_provider;
    request.rewrite_model = providers.rewrite_model;
    if request.stt_provider == "qwen-local" {
        qwen_local::ensure_ready(&app, &qwen_state, request.stt_base_url.as_deref())?;
    }
    let profile = storage::get_enabled_profile(&database, &request.profile_id)?;
    let dictionary_terms = storage::dictionary_prompt_terms(&database)?;
    let result = run_audio_file_pipeline(
        &request,
        PipelineContext {
            profile_id: profile.id,
            profile_name: profile.name,
            profile_mode: profile.mode,
            system_prompt: profile.system_prompt,
            user_prompt_template: profile.user_prompt_template,
            target_language: profile.target_language,
            dictionary_terms,
            selected_text: request.selected_text.clone(),
        },
    )
    .map_err(|error| error.to_string())?;
    if result.no_speech {
        return Ok(result);
    }
    let stt_estimated_cost = match request.stt_provider.as_str() {
        "groq" => estimate_groq_stt_cost_usd(&request.stt_model, result.audio_seconds),
        "qwen-local" => Some(0.0),
        _ => None,
    };
    let rewrite_usage = result
        .rewrite_input_tokens
        .zip(result.rewrite_output_tokens)
        .map(|(input_tokens, output_tokens)| RewriteUsage {
            input_tokens,
            output_tokens,
            prompt_cache_hit_tokens: result.rewrite_cache_hit_tokens,
            prompt_cache_miss_tokens: result.rewrite_cache_miss_tokens,
        });
    let rewrite_estimated_cost = match request.rewrite_provider.as_str() {
        "openai" => estimate_openai_rewrite_cost_usd(&request.rewrite_model, rewrite_usage),
        "deepseek" => estimate_deepseek_rewrite_cost_usd(&request.rewrite_model, rewrite_usage),
        _ => None,
    };
    let estimated_cost = match (stt_estimated_cost, rewrite_estimated_cost) {
        (Some(stt), Some(rewrite)) => Some(stt + rewrite),
        _ => None,
    };
    let output_character_count = output_character_count(&result.text);
    storage::insert_usage_event(
        &database,
        &storage::UsageEventRecord {
            id: format!("usage_{}", uuid::Uuid::new_v4()),
            stt_provider: request.stt_provider,
            stt_model: request.stt_model,
            llm_provider: request.rewrite_provider,
            llm_model: request.rewrite_model,
            profile_id: result.profile_id.clone(),
            audio_seconds: result.audio_seconds,
            stt_latency_ms: result.stt_latency_ms,
            rewrite_latency_ms: result.rewrite_latency_ms,
            rewrite_fallback_used: result.rewrite_fallback_used,
            stt_estimated_cost,
            rewrite_estimated_cost,
            estimated_cost,
            output_character_count,
            created_at: chrono::Utc::now().to_rfc3339(),
        },
    )?;
    Ok(result)
}

#[tauri::command]
fn run_streaming_dictation(
    app: tauri::AppHandle,
    state: tauri::State<'_, RecordingState>,
    mut request: streaming::StreamingPipelineRequest,
) -> Result<streaming::StreamingPipelineResult, String> {
    let database = open_app_database(&app)?;
    let providers = storage::resolve_active_provider_pipeline(&database)?;
    request.stt_config_id = Some(providers.stt_config_id);
    request.stt_provider = providers.stt_provider;
    request.stt_model = providers.stt_model;
    request.stt_base_url = providers.stt_base_url;
    request.rewrite_config_id = Some(providers.rewrite_config_id);
    request.rewrite_provider = providers.rewrite_provider;
    request.rewrite_model = providers.rewrite_model;
    if !streaming::streaming_eligible(&request) {
        return Err(
            "Streaming dictation is disabled for the active ASR configuration.".to_string(),
        );
    }
    let profile = storage::get_enabled_profile(&database, &request.profile_id)?;
    let dictionary_terms = storage::dictionary_prompt_terms(&database)?;
    let stt_model = request.stt_model.clone();
    let stt_provider = request.stt_provider.clone();
    let llm_model = request.rewrite_model.clone();
    let llm_provider = request.rewrite_provider.clone();
    let pcm_chunks = state
        .streaming_chunks
        .lock()
        .map_err(|_| "Streaming recorder lock poisoned".to_string())?
        .clone();
    let result = streaming::run_streaming_pipeline(
        request,
        PipelineContext {
            profile_id: profile.id,
            profile_name: profile.name,
            profile_mode: profile.mode,
            system_prompt: profile.system_prompt,
            user_prompt_template: profile.user_prompt_template,
            target_language: profile.target_language,
            dictionary_terms,
            selected_text: None,
        },
        pcm_chunks,
    )
    .map_err(|error| error.to_string())?;
    if result.no_speech {
        return Ok(result);
    }
    let rewrite_usage = result
        .rewrite_input_tokens
        .zip(result.rewrite_output_tokens)
        .map(|(input_tokens, output_tokens)| RewriteUsage {
            input_tokens,
            output_tokens,
            prompt_cache_hit_tokens: result.rewrite_cache_hit_tokens,
            prompt_cache_miss_tokens: result.rewrite_cache_miss_tokens,
        });
    let rewrite_estimated_cost = match llm_provider.as_str() {
        "openai" => estimate_openai_rewrite_cost_usd(&llm_model, rewrite_usage),
        "deepseek" => estimate_deepseek_rewrite_cost_usd(&llm_model, rewrite_usage),
        _ => None,
    };
    let output_character_count = output_character_count(&result.text);
    match storage::insert_usage_event(
        &database,
        &storage::UsageEventRecord {
            id: format!("usage_{}", uuid::Uuid::new_v4()),
            stt_provider,
            stt_model,
            llm_provider,
            llm_model,
            profile_id: result.profile_id.clone(),
            audio_seconds: result.audio_seconds,
            stt_latency_ms: result.stt_latency_ms,
            rewrite_latency_ms: result.rewrite_latency_ms,
            rewrite_fallback_used: result.rewrite_fallback_used,
            stt_estimated_cost: None,
            rewrite_estimated_cost,
            estimated_cost: None,
            output_character_count,
            created_at: chrono::Utc::now().to_rfc3339(),
        },
    ) {
        Ok(()) => Ok(result),
        Err(error) if result.inserted_streaming => {
            log::warn!(
                "Streaming usage event insert failed after text was inserted; returning streaming result to avoid duplicate fallback: {error}"
            );
            Ok(result)
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
fn start_recording(state: tauri::State<'_, RecordingState>) -> Result<String, String> {
    let mut active = state
        .active
        .lock()
        .map_err(|_| "Recorder lock poisoned".to_string())?;
    if active.is_some() {
        return Err("Recording is already active".to_string());
    }

    let recording = audio::start_recording_to_temp()?;
    let path = recording.path.to_string_lossy().to_string();
    *active = Some(recording);
    Ok(path)
}

#[tauri::command]
fn start_streaming_recording(state: tauri::State<'_, RecordingState>) -> Result<String, String> {
    let chunks = state.streaming_chunks.clone();
    let mut active = state
        .active
        .lock()
        .map_err(|_| "Recorder lock poisoned".to_string())?;
    if active.is_some() {
        return Err("Recording is already active".to_string());
    }

    chunks
        .lock()
        .map_err(|_| "Streaming recorder lock poisoned".to_string())?
        .clear();
    let consumer_chunks = chunks.clone();
    let consumer: audio::PcmChunkConsumer = Arc::new(move |chunk| {
        if let Ok(mut guard) = consumer_chunks.lock() {
            guard.push(chunk);
        }
    });
    let recording = audio::start_recording_to_temp_with_consumer(Some(consumer))?;
    let path = recording.path.to_string_lossy().to_string();
    *active = Some(recording);
    Ok(path)
}

#[tauri::command]
fn stop_recording(state: tauri::State<'_, RecordingState>) -> Result<String, String> {
    let recording = state
        .active
        .lock()
        .map_err(|_| "Recorder lock poisoned".to_string())?
        .take()
        .ok_or_else(|| "No active recording".to_string())?;

    recording
        .stop()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn copy_text_for_paste(text: String) -> Result<clipboard::ClipboardResult, String> {
    clipboard::copy_text_for_paste(&text)
}

#[tauri::command]
fn type_text_chunk(text: String) -> Result<(), String> {
    clipboard::type_text_chunk(&text)
}

#[tauri::command]
fn read_selected_text_for_edit() -> Result<String, String> {
    clipboard::read_selected_text_for_edit()
}

#[tauri::command]
fn cleanup_temp_audio_file(path: String) -> Result<bool, String> {
    audio::remove_gospeak_temp_audio_file(std::path::Path::new(&path))
}

#[tauri::command]
fn update_global_shortcut(
    app: tauri::AppHandle,
    binding: String,
    previous_binding: Option<String>,
) -> Result<(), String> {
    if binding.trim().is_empty() {
        return Err("Global shortcut cannot be empty".to_string());
    }
    let shortcuts = app.global_shortcut();
    shortcuts
        .unregister_all()
        .map_err(|error| format!("Cannot unregister the previous shortcut: {error}"))?;
    if let Err(error) = shortcuts.register(binding.as_str()) {
        if let Some(previous) = previous_binding.filter(|value| !value.trim().is_empty()) {
            let _ = shortcuts.register(previous.as_str());
        }
        return Err(format!(
            "Shortcut is invalid or already registered by another application: {error}"
        ));
    }
    Ok(())
}

#[tauri::command]
fn get_foreground_app_context() -> app_context::ForegroundAppContext {
    app_context::current_foreground_app_context()
}

#[tauri::command]
fn list_preferences(app: tauri::AppHandle) -> Result<Vec<storage::PreferenceRecord>, String> {
    let database = open_app_database(&app)?;
    storage::list_preferences(&database)
}

#[tauri::command]
fn upsert_preference(
    app: tauri::AppHandle,
    record: storage::PreferenceRecord,
) -> Result<(), String> {
    let database = open_app_database(&app)?;
    storage::upsert_preference(&database, &record)
}

#[tauri::command]
fn get_qwen_local_status(
    app: tauri::AppHandle,
    state: tauri::State<'_, qwen_local::QwenLocalProcessState>,
) -> Result<qwen_local::QwenLocalStatus, String> {
    qwen_local::get_status(&app, &state)
}

#[tauri::command]
fn start_qwen_local(
    app: tauri::AppHandle,
    state: tauri::State<'_, qwen_local::QwenLocalProcessState>,
) -> Result<qwen_local::QwenLocalStatus, String> {
    qwen_local::start(&app, &state)
}

#[tauri::command]
fn stop_qwen_local(
    state: tauri::State<'_, qwen_local::QwenLocalProcessState>,
) -> Result<qwen_local::QwenLocalStatus, String> {
    qwen_local::stop(&state)
}

#[tauri::command]
fn list_dictionary_terms(app: tauri::AppHandle) -> Result<Vec<storage::DictionaryRecord>, String> {
    let database = open_app_database(&app)?;
    storage::list_dictionary_terms(&database)
}

#[tauri::command]
fn upsert_dictionary_term(
    app: tauri::AppHandle,
    record: storage::DictionaryRecord,
) -> Result<(), String> {
    let database = open_app_database(&app)?;
    storage::upsert_dictionary_term(&database, &record)
}

#[tauri::command]
fn list_profiles(app: tauri::AppHandle) -> Result<Vec<storage::ProfileRecord>, String> {
    let database = open_app_database(&app)?;
    storage::list_profiles(&database)
}

#[tauri::command]
fn upsert_profile(app: tauri::AppHandle, record: storage::ProfileRecord) -> Result<(), String> {
    let database = open_app_database(&app)?;
    storage::upsert_profile(&database, &record)
}

#[tauri::command]
fn list_app_profile_rules(
    app: tauri::AppHandle,
) -> Result<Vec<storage::AppProfileRuleRecord>, String> {
    let database = open_app_database(&app)?;
    storage::list_app_profile_rules(&database)
}

#[tauri::command]
fn upsert_app_profile_rule(
    app: tauri::AppHandle,
    record: storage::AppProfileRuleRecord,
) -> Result<(), String> {
    let database = open_app_database(&app)?;
    storage::upsert_app_profile_rule(&database, &record)
}

#[tauri::command]
fn list_usage_events(app: tauri::AppHandle) -> Result<Vec<storage::UsageEventRecord>, String> {
    let database = open_app_database(&app)?;
    storage::list_usage_events(&database)
}

#[tauri::command]
fn export_config_to_file(path: String, payload: serde_json::Value) -> Result<(), String> {
    storage::write_json_file(std::path::Path::new(&path), &payload)
}

#[tauri::command]
fn import_config_from_file(
    app: tauri::AppHandle,
    path: String,
) -> Result<serde_json::Value, String> {
    let payload = storage::read_json_file(std::path::Path::new(&path))?;
    let mut database = open_app_database(&app)?;
    storage::import_config_payload(&mut database, &payload)
}

fn open_app_database(app: &tauri::AppHandle) -> Result<rusqlite::Connection, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Cannot resolve app data directory: {error}"))?;
    let legacy_path = std::env::current_dir()
        .ok()
        .map(|directory| directory.join("gospeak.sqlite3"));
    let path = storage::prepare_database_path(&app_data_dir, legacy_path.as_deref())?;
    storage::open_database(&path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(RecordingState::default())
        .manage(qwen_local::QwenLocalProcessState::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                use tauri_plugin_global_shortcut::ShortcutState;

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_shortcuts(["alt+space"])?
                        .with_handler(|app, _shortcut, event| {
                            let state = match event.state {
                                ShortcutState::Pressed => "pressed",
                                ShortcutState::Released => "released",
                            };
                            let _ = app.emit(
                                "gospeak://global-shortcut",
                                serde_json::json!({ "state": state }),
                            );
                        })
                        .build(),
                )?;

                let toggle = tauri::menu::MenuItem::with_id(
                    app,
                    "toggle",
                    "Start / Stop Dictation",
                    true,
                    None::<&str>,
                )?;
                let normal = tauri::menu::MenuItem::with_id(
                    app,
                    "profile:normal",
                    "Normal",
                    true,
                    None::<&str>,
                )?;
                let email = tauri::menu::MenuItem::with_id(
                    app,
                    "profile:email",
                    "Email",
                    true,
                    None::<&str>,
                )?;
                let prompt = tauri::menu::MenuItem::with_id(
                    app,
                    "profile:prompt",
                    "Prompt",
                    true,
                    None::<&str>,
                )?;
                let translate = tauri::menu::MenuItem::with_id(
                    app,
                    "profile:translate",
                    "Translate",
                    true,
                    None::<&str>,
                )?;
                let profiles = tauri::menu::Submenu::with_items(
                    app,
                    "Profile",
                    true,
                    &[&normal, &email, &prompt, &translate],
                )?;
                let open = tauri::menu::MenuItem::with_id(
                    app,
                    "open",
                    "Open Gospeak",
                    true,
                    None::<&str>,
                )?;
                let quit = tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
                let menu = tauri::menu::Menu::with_items(
                    app,
                    &[&toggle, &profiles, &separator, &open, &quit],
                )?;
                tauri::tray::TrayIconBuilder::new()
                    .icon(app.default_window_icon().cloned().unwrap())
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "quit" => app.exit(0),
                        "open" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        action => {
                            let _ = app.emit("gospeak://tray-action", action);
                        }
                    })
                    .build(app)?;
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_provider_keys,
            save_provider_api_key,
            remove_provider_api_key,
            check_provider_configuration_keys,
            save_provider_configuration_api_key,
            remove_provider_configuration_api_key,
            migrate_provider_configuration_api_key,
            validate_alpha_pipeline,
            run_audio_file_dictation,
            run_streaming_dictation,
            start_recording,
            start_streaming_recording,
            stop_recording,
            copy_text_for_paste,
            type_text_chunk,
            read_selected_text_for_edit,
            cleanup_temp_audio_file,
            update_global_shortcut,
            get_foreground_app_context,
            list_preferences,
            upsert_preference,
            get_qwen_local_status,
            start_qwen_local,
            stop_qwen_local,
            list_dictionary_terms,
            upsert_dictionary_term,
            list_profiles,
            upsert_profile,
            list_app_profile_rules,
            upsert_app_profile_rule,
            list_usage_events,
            export_config_to_file,
            import_config_from_file
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            let state = app.state::<qwen_local::QwenLocalProcessState>();
            let _ = qwen_local::stop(&state);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_non_whitespace_unicode_characters() {
        assert_eq!(output_character_count("Hello 世界\n"), 7);
    }
}
