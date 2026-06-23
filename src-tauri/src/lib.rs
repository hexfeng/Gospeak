pub mod audio;
pub mod clipboard;
pub mod provider;
pub mod storage;

use provider::{
    provider_key_status, run_alpha_pipeline, run_audio_file_pipeline, save_provider_key,
    AudioFilePipelineRequest, ProviderRuntimeConfig,
};
use std::sync::Mutex;

#[derive(Default)]
struct RecordingState {
    active: Mutex<Option<audio::ActiveRecording>>,
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
fn validate_alpha_pipeline(config: ProviderRuntimeConfig) -> Result<String, String> {
    run_alpha_pipeline(&config).map_err(|error| error.to_string())
}

#[tauri::command]
fn run_audio_file_dictation(request: AudioFilePipelineRequest) -> Result<String, String> {
    run_audio_file_pipeline(&request).map_err(|error| error.to_string())
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
fn cleanup_temp_audio_file(path: String) -> Result<bool, String> {
    audio::remove_gospeak_temp_audio_file(std::path::Path::new(&path))
}

#[tauri::command]
fn list_preferences() -> Result<Vec<storage::PreferenceRecord>, String> {
    let database = open_app_database()?;
    storage::list_preferences(&database)
}

#[tauri::command]
fn upsert_preference(record: storage::PreferenceRecord) -> Result<(), String> {
    let database = open_app_database()?;
    storage::upsert_preference(&database, &record)
}

#[tauri::command]
fn list_dictionary_terms() -> Result<Vec<storage::DictionaryRecord>, String> {
    let database = open_app_database()?;
    storage::list_dictionary_terms(&database)
}

#[tauri::command]
fn upsert_dictionary_term(record: storage::DictionaryRecord) -> Result<(), String> {
    let database = open_app_database()?;
    storage::upsert_dictionary_term(&database, &record)
}

#[tauri::command]
fn list_profiles() -> Result<Vec<storage::ProfileRecord>, String> {
    let database = open_app_database()?;
    storage::list_profiles(&database)
}

#[tauri::command]
fn upsert_profile(record: storage::ProfileRecord) -> Result<(), String> {
    let database = open_app_database()?;
    storage::upsert_profile(&database, &record)
}

#[tauri::command]
fn export_config_to_file(path: String, payload: serde_json::Value) -> Result<(), String> {
    storage::write_json_file(std::path::Path::new(&path), &payload)
}

#[tauri::command]
fn import_config_from_file(path: String) -> Result<serde_json::Value, String> {
    storage::read_json_file(std::path::Path::new(&path))
}

fn open_app_database() -> Result<rusqlite::Connection, String> {
    let path = storage::default_database_path()?;
    storage::open_database(&path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(RecordingState::default())
        .setup(|app| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                use tauri::Emitter;
                use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_shortcuts(["alt+space"])?
                        .with_handler(|app, shortcut, event| {
                            if event.state == ShortcutState::Pressed
                                && shortcut.matches(Modifiers::ALT, Code::Space)
                            {
                                let _ = app.emit("gospeak://global-shortcut", "Alt+Space");
                            }
                        })
                        .build(),
                )?;
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
            validate_alpha_pipeline,
            run_audio_file_dictation,
            start_recording,
            stop_recording,
            copy_text_for_paste,
            cleanup_temp_audio_file,
            list_preferences,
            upsert_preference,
            list_dictionary_terms,
            upsert_dictionary_term,
            list_profiles,
            upsert_profile,
            export_config_to_file,
            import_config_from_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
