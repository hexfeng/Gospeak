use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PreferenceRecord {
    pub key: String,
    pub value: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct StoredProviderConfiguration {
    id: String,
    name: String,
    kind: String,
    provider_id: String,
    model: String,
    #[serde(default)]
    base_url: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredProviderState {
    configurations: Vec<StoredProviderConfiguration>,
    active_asr_config_id: String,
    active_rewrite_config_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedProviderPipeline {
    pub stt_config_id: String,
    pub stt_provider: String,
    pub stt_model: String,
    pub stt_base_url: Option<String>,
    pub rewrite_config_id: String,
    pub rewrite_provider: String,
    pub rewrite_model: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DictionaryRecord {
    pub id: String,
    pub spoken: String,
    pub written: String,
    pub term_type: String,
    pub aliases_json: String,
    pub tags_json: String,
    pub enabled: bool,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProfileRecord {
    pub id: String,
    pub name: String,
    pub mode: String,
    pub system_prompt: String,
    pub user_prompt_template: String,
    pub target_language: Option<String>,
    pub enabled: bool,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppProfileRuleRecord {
    pub id: String,
    pub app_id: String,
    pub window_title_pattern: Option<String>,
    pub profile_id: String,
    pub priority: i32,
    pub enabled: bool,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UsageEventRecord {
    pub id: String,
    pub stt_provider: String,
    pub stt_model: String,
    pub llm_provider: String,
    pub llm_model: String,
    pub profile_id: String,
    pub audio_seconds: Option<f64>,
    pub stt_latency_ms: u64,
    pub rewrite_latency_ms: Option<u64>,
    pub rewrite_fallback_used: bool,
    pub stt_estimated_cost: Option<f64>,
    pub rewrite_estimated_cost: Option<f64>,
    pub estimated_cost: Option<f64>,
    pub output_character_count: u64,
    pub created_at: String,
}

pub fn prepare_database_path(
    app_data_dir: &Path,
    legacy_database: Option<&Path>,
) -> Result<PathBuf, String> {
    std::fs::create_dir_all(app_data_dir)
        .map_err(|error| format!("Cannot create app data directory: {error}"))?;
    let destination = app_data_dir.join("gospeak.sqlite3");
    if !destination.exists() {
        if let Some(legacy) = legacy_database.filter(|path| path.exists()) {
            std::fs::rename(legacy, &destination)
                .or_else(|_| {
                    std::fs::copy(legacy, &destination)?;
                    std::fs::remove_file(legacy)
                })
                .map_err(|error| format!("Cannot migrate legacy database: {error}"))?;
        }
    }
    Ok(destination)
}

pub fn open_database(path: &Path) -> Result<Connection, String> {
    let connection =
        Connection::open(path).map_err(|error| format!("Cannot open SQLite database: {error}"))?;
    migrate(&connection)?;
    Ok(connection)
}

pub fn write_json_file(path: &Path, payload: &serde_json::Value) -> Result<(), String> {
    let json = serde_json::to_string_pretty(payload)
        .map_err(|error| format!("Cannot serialize export payload: {error}"))?;
    std::fs::write(path, json).map_err(|error| format!("Cannot write export file: {error}"))
}

pub fn read_json_file(path: &Path) -> Result<serde_json::Value, String> {
    let json = std::fs::read_to_string(path)
        .map_err(|error| format!("Cannot read import file: {error}"))?;
    serde_json::from_str(&json).map_err(|error| format!("Cannot parse import JSON: {error}"))
}

pub fn migrate(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            r#"
      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dictionary_terms (
        id TEXT PRIMARY KEY,
        spoken TEXT NOT NULL,
        written TEXT NOT NULL,
        term_type TEXT NOT NULL DEFAULT 'other',
        aliases_json TEXT NOT NULL DEFAULT '[]',
        tags_json TEXT NOT NULL DEFAULT '[]',
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS prompt_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mode TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        user_prompt_template TEXT NOT NULL,
        target_language TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS app_profile_rules (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        window_title_pattern TEXT,
        profile_id TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS usage_events (
        id TEXT PRIMARY KEY,
        stt_provider TEXT,
        stt_model TEXT,
        llm_provider TEXT,
        llm_model TEXT,
        profile_id TEXT NOT NULL DEFAULT 'normal',
        audio_seconds REAL,
        stt_latency_ms INTEGER NOT NULL DEFAULT 0,
        rewrite_latency_ms INTEGER,
        rewrite_fallback_used INTEGER NOT NULL DEFAULT 0,
        stt_estimated_cost REAL,
        rewrite_estimated_cost REAL,
        estimated_cost REAL,
        output_character_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      INSERT OR IGNORE INTO preferences (key, value, updated_at)
      VALUES ('active_profile_id', 'normal', '2026-06-23T00:00:00Z');

      INSERT OR IGNORE INTO prompt_profiles
        (id, name, mode, system_prompt, user_prompt_template, target_language,
         enabled, updated_at, deleted_at)
      VALUES
        ('normal', 'Normal', 'normal',
         'Clean the transcript into natural written text without adding facts.',
         'Transcript:\n{{transcript}}\n\nDictionary terms:\n{{dictionaryTerms}}',
         NULL, 1, '2026-06-23T00:00:00Z', NULL),
        ('email', 'Email', 'email',
         'Rewrite the transcript as a concise professional email.',
         'Transcript:\n{{transcript}}\n\nDictionary terms:\n{{dictionaryTerms}}',
         NULL, 1, '2026-06-23T00:00:00Z', NULL),
        ('prompt', 'Prompt', 'prompt',
         'Convert the transcript into a clear instruction for an AI assistant.',
         'Transcript:\n{{transcript}}\n\nDictionary terms:\n{{dictionaryTerms}}',
         NULL, 1, '2026-06-23T00:00:00Z', NULL),
        ('translate', 'Translate', 'translate',
         'Translate the transcript into the target language while preserving proper nouns.',
         'Target language: {{targetLanguage}}\nTranscript:\n{{transcript}}\n\nDictionary terms:\n{{dictionaryTerms}}',
         'English', 1, '2026-06-23T00:00:00Z', NULL);
      "#,
        )
        .map_err(|error| format!("Cannot migrate SQLite database: {error}"))?;
    ensure_column(
        connection,
        "dictionary_terms",
        "term_type",
        "TEXT NOT NULL DEFAULT 'other'",
    )?;
    ensure_column(
        connection,
        "usage_events",
        "profile_id",
        "TEXT NOT NULL DEFAULT 'normal'",
    )?;
    ensure_column(
        connection,
        "usage_events",
        "stt_latency_ms",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(connection, "usage_events", "rewrite_latency_ms", "INTEGER")?;
    ensure_column(
        connection,
        "usage_events",
        "rewrite_fallback_used",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(connection, "usage_events", "stt_estimated_cost", "REAL")?;
    ensure_column(connection, "usage_events", "rewrite_estimated_cost", "REAL")?;
    ensure_column(
        connection,
        "usage_events",
        "output_character_count",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    Ok(())
}

fn ensure_column(
    connection: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|error| format!("Cannot inspect database schema: {error}"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("Cannot inspect database columns: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Cannot read database columns: {error}"))?;
    if !columns.iter().any(|existing| existing == column) {
        connection
            .execute(
                &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
                [],
            )
            .map_err(|error| format!("Cannot add database column {column}: {error}"))?;
    }
    Ok(())
}

pub fn get_preference(connection: &Connection, key: &str) -> Result<Option<String>, String> {
    let mut statement = connection
        .prepare("SELECT value FROM preferences WHERE key = ?1")
        .map_err(|error| format!("Cannot prepare preference query: {error}"))?;
    match statement.query_row([key], |row| row.get(0)) {
        Ok(value) => Ok(Some(value)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(format!("Cannot read preference: {error}")),
    }
}

pub fn upsert_preference(connection: &Connection, record: &PreferenceRecord) -> Result<(), String> {
    connection
        .execute(
            r#"
      INSERT INTO preferences (key, value, updated_at)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
      "#,
            params![record.key, record.value, record.updated_at],
        )
        .map_err(|error| format!("Cannot save preference: {error}"))?;
    Ok(())
}

pub fn list_preferences(connection: &Connection) -> Result<Vec<PreferenceRecord>, String> {
    let mut statement = connection
        .prepare("SELECT key, value, updated_at FROM preferences ORDER BY key")
        .map_err(|error| format!("Cannot prepare preference query: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(PreferenceRecord {
                key: row.get(0)?,
                value: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })
        .map_err(|error| format!("Cannot query preferences: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Cannot read preferences: {error}"))
}

pub fn upsert_dictionary_term(
    connection: &Connection,
    record: &DictionaryRecord,
) -> Result<(), String> {
    connection
        .execute(
            r#"
      INSERT INTO dictionary_terms
        (id, spoken, written, term_type, aliases_json, tags_json, enabled, updated_at, deleted_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT(id) DO UPDATE SET
        spoken = excluded.spoken,
        written = excluded.written,
        term_type = excluded.term_type,
        aliases_json = excluded.aliases_json,
        tags_json = excluded.tags_json,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
      "#,
            params![
                record.id,
                record.spoken,
                record.written,
                record.term_type,
                record.aliases_json,
                record.tags_json,
                record.enabled as i32,
                record.updated_at,
                record.deleted_at
            ],
        )
        .map_err(|error| format!("Cannot save dictionary term: {error}"))?;
    Ok(())
}

pub fn list_dictionary_terms(connection: &Connection) -> Result<Vec<DictionaryRecord>, String> {
    let mut statement = connection
        .prepare(
            r#"
      SELECT id, spoken, written, term_type, aliases_json, tags_json, enabled, updated_at, deleted_at
      FROM dictionary_terms
      WHERE deleted_at IS NULL
      ORDER BY spoken
      "#,
        )
        .map_err(|error| format!("Cannot prepare dictionary query: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(DictionaryRecord {
                id: row.get(0)?,
                spoken: row.get(1)?,
                written: row.get(2)?,
                term_type: row.get(3)?,
                aliases_json: row.get(4)?,
                tags_json: row.get(5)?,
                enabled: row.get::<_, i32>(6)? != 0,
                updated_at: row.get(7)?,
                deleted_at: row.get(8)?,
            })
        })
        .map_err(|error| format!("Cannot query dictionary terms: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Cannot read dictionary terms: {error}"))
}

pub fn upsert_profile(connection: &Connection, record: &ProfileRecord) -> Result<(), String> {
    connection
    .execute(
      r#"
      INSERT INTO prompt_profiles
        (id, name, mode, system_prompt, user_prompt_template, target_language, enabled, updated_at, deleted_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        mode = excluded.mode,
        system_prompt = excluded.system_prompt,
        user_prompt_template = excluded.user_prompt_template,
        target_language = excluded.target_language,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
      "#,
      params![
        record.id,
        record.name,
        record.mode,
        record.system_prompt,
        record.user_prompt_template,
        record.target_language,
        record.enabled as i32,
        record.updated_at,
        record.deleted_at
      ],
    )
    .map_err(|error| format!("Cannot save profile: {error}"))?;
    Ok(())
}

pub fn list_profiles(connection: &Connection) -> Result<Vec<ProfileRecord>, String> {
    let mut statement = connection
    .prepare(
      r#"
      SELECT id, name, mode, system_prompt, user_prompt_template, target_language, enabled, updated_at, deleted_at
      FROM prompt_profiles
      WHERE deleted_at IS NULL
      ORDER BY name
      "#,
    )
    .map_err(|error| format!("Cannot prepare profile query: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(ProfileRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                mode: row.get(2)?,
                system_prompt: row.get(3)?,
                user_prompt_template: row.get(4)?,
                target_language: row.get(5)?,
                enabled: row.get::<_, i32>(6)? != 0,
                updated_at: row.get(7)?,
                deleted_at: row.get(8)?,
            })
        })
        .map_err(|error| format!("Cannot query profiles: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Cannot read profiles: {error}"))
}

pub fn get_enabled_profile(
    connection: &Connection,
    profile_id: &str,
) -> Result<ProfileRecord, String> {
    list_profiles(connection)?
        .into_iter()
        .find(|profile| profile.id == profile_id && profile.enabled)
        .ok_or_else(|| format!("Enabled profile not found: {profile_id}"))
}

pub fn upsert_app_profile_rule(
    connection: &Connection,
    record: &AppProfileRuleRecord,
) -> Result<(), String> {
    connection
        .execute(
            r#"
      INSERT INTO app_profile_rules
        (id, app_id, window_title_pattern, profile_id, priority, enabled, updated_at, deleted_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(id) DO UPDATE SET
        app_id = excluded.app_id,
        window_title_pattern = excluded.window_title_pattern,
        profile_id = excluded.profile_id,
        priority = excluded.priority,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
      "#,
            params![
                record.id,
                record.app_id,
                record.window_title_pattern,
                record.profile_id,
                record.priority,
                record.enabled as i32,
                record.updated_at,
                record.deleted_at
            ],
        )
        .map_err(|error| format!("Cannot save app profile rule: {error}"))?;
    Ok(())
}

pub fn list_app_profile_rules(
    connection: &Connection,
) -> Result<Vec<AppProfileRuleRecord>, String> {
    let mut statement = connection
        .prepare(
            r#"
      SELECT id, app_id, window_title_pattern, profile_id, priority, enabled, updated_at, deleted_at
      FROM app_profile_rules
      WHERE deleted_at IS NULL
      ORDER BY priority DESC, app_id ASC
      "#,
        )
        .map_err(|error| format!("Cannot prepare app profile rules query: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(AppProfileRuleRecord {
                id: row.get(0)?,
                app_id: row.get(1)?,
                window_title_pattern: row.get(2)?,
                profile_id: row.get(3)?,
                priority: row.get(4)?,
                enabled: row.get::<_, i32>(5)? != 0,
                updated_at: row.get(6)?,
                deleted_at: row.get(7)?,
            })
        })
        .map_err(|error| format!("Cannot query app profile rules: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Cannot read app profile rules: {error}"))
}

pub fn dictionary_prompt_terms(connection: &Connection) -> Result<Vec<String>, String> {
    Ok(list_dictionary_terms(connection)?
        .into_iter()
        .filter(|term| term.enabled)
        .map(|term| format!("{} => {}", term.spoken, term.written))
        .collect())
}

pub fn insert_usage_event(connection: &Connection, event: &UsageEventRecord) -> Result<(), String> {
    connection
        .execute(
            r#"
            INSERT INTO usage_events
              (id, stt_provider, stt_model, llm_provider, llm_model, profile_id,
               audio_seconds, stt_latency_ms, rewrite_latency_ms,
               rewrite_fallback_used, stt_estimated_cost, rewrite_estimated_cost,
               estimated_cost, output_character_count, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            "#,
            params![
                event.id,
                event.stt_provider,
                event.stt_model,
                event.llm_provider,
                event.llm_model,
                event.profile_id,
                event.audio_seconds,
                i64::try_from(event.stt_latency_ms).unwrap_or(i64::MAX),
                event
                    .rewrite_latency_ms
                    .map(|value| i64::try_from(value).unwrap_or(i64::MAX)),
                event.rewrite_fallback_used as i32,
                event.stt_estimated_cost,
                event.rewrite_estimated_cost,
                event.estimated_cost,
                i64::try_from(event.output_character_count).unwrap_or(i64::MAX),
                event.created_at,
            ],
        )
        .map_err(|error| format!("Cannot record usage event: {error}"))?;
    Ok(())
}

pub fn list_usage_events(connection: &Connection) -> Result<Vec<UsageEventRecord>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, stt_provider, stt_model, llm_provider, llm_model, profile_id,
                   audio_seconds, stt_latency_ms, rewrite_latency_ms,
                   rewrite_fallback_used, stt_estimated_cost, rewrite_estimated_cost,
                   estimated_cost, output_character_count, created_at
            FROM usage_events
            ORDER BY created_at DESC
            "#,
        )
        .map_err(|error| format!("Cannot prepare usage query: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(UsageEventRecord {
                id: row.get(0)?,
                stt_provider: row.get(1)?,
                stt_model: row.get(2)?,
                llm_provider: row.get(3)?,
                llm_model: row.get(4)?,
                profile_id: row.get(5)?,
                audio_seconds: row.get(6)?,
                stt_latency_ms: u64::try_from(row.get::<_, i64>(7)?).unwrap_or_default(),
                rewrite_latency_ms: row
                    .get::<_, Option<i64>>(8)?
                    .and_then(|value| u64::try_from(value).ok()),
                rewrite_fallback_used: row.get::<_, i32>(9)? != 0,
                stt_estimated_cost: row.get(10)?,
                rewrite_estimated_cost: row.get(11)?,
                estimated_cost: row.get(12)?,
                output_character_count: u64::try_from(row.get::<_, i64>(13)?).unwrap_or_default(),
                created_at: row.get(14)?,
            })
        })
        .map_err(|error| format!("Cannot query usage events: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Cannot read usage events: {error}"))
}

fn provider_model_is_allowed(kind: &str, provider: &str, model: &str) -> bool {
    match (kind, provider) {
        ("stt", "groq") => matches!(model, "whisper-large-v3-turbo" | "whisper-large-v3"),
        ("stt", "qwen-local") => model == "Qwen/Qwen3-ASR-0.6B",
        ("stt", "qwen-api") => model == "Qwen/Qwen3-ASR-1.7B",
        ("stt", "doubao") => model == "bigmodel",
        ("stt", "openai-realtime") => model == "gpt-realtime-2",
        ("rewrite", "openai") => matches!(model, "gpt-5-nano" | "gpt-5-mini"),
        ("rewrite", "deepseek") => matches!(model, "deepseek-v4-flash" | "deepseek-v4-pro"),
        _ => false,
    }
}

fn validate_provider_state(state: &StoredProviderState) -> Result<(), String> {
    if state.configurations.is_empty() {
        return Err("Provider configurations cannot be empty".to_string());
    }
    let mut ids = HashSet::new();
    let mut names = HashSet::new();
    for configuration in &state.configurations {
        if configuration.id.trim().is_empty()
            || configuration.name.trim().is_empty()
            || configuration.created_at.trim().is_empty()
            || configuration.updated_at.trim().is_empty()
        {
            return Err("Provider configuration fields cannot be empty".to_string());
        }
        if !ids.insert(configuration.id.as_str()) {
            return Err("Provider configuration IDs must be unique".to_string());
        }
        if !provider_model_is_allowed(
            &configuration.kind,
            &configuration.provider_id,
            &configuration.model,
        ) {
            return Err(
                "Provider configuration has an unsupported kind, Provider, or model".to_string(),
            );
        }
        let name_key = format!(
            "{}\u{0}{}\u{0}{}",
            configuration.kind,
            configuration.provider_id,
            configuration.name.trim().to_lowercase()
        );
        if !names.insert(name_key) {
            return Err(
                "Provider configuration names must be unique within a Provider".to_string(),
            );
        }
        if configuration
            .base_url
            .as_ref()
            .is_some_and(|value| value.trim().is_empty())
        {
            return Err("Provider Base URL cannot be blank when present".to_string());
        }
    }
    if state.active_asr_config_id == state.active_rewrite_config_id {
        return Err("Active ASR and Rewrite configurations must be different".to_string());
    }
    let active_asr = state
        .configurations
        .iter()
        .find(|item| item.id == state.active_asr_config_id && item.kind == "stt")
        .ok_or_else(|| "Active ASR configuration is missing or has the wrong kind".to_string())?;
    let active_rewrite = state
        .configurations
        .iter()
        .find(|item| item.id == state.active_rewrite_config_id && item.kind == "rewrite")
        .ok_or_else(|| {
            "Active Rewrite configuration is missing or has the wrong kind".to_string()
        })?;
    if !provider_model_is_allowed(&active_asr.kind, &active_asr.provider_id, &active_asr.model)
        || !provider_model_is_allowed(
            &active_rewrite.kind,
            &active_rewrite.provider_id,
            &active_rewrite.model,
        )
    {
        return Err("Active Provider configuration is invalid".to_string());
    }
    Ok(())
}

fn normalized_import_payload(payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let mut normalized = payload.clone();
    if payload
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        != Some(2)
    {
        return Ok(normalized);
    }

    let dictionary = normalized
        .pointer("/data/dictionaryTerms")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "Config payload is missing dictionaryTerms".to_string())?;
    for term in dictionary {
        let term_type = term.get("type").and_then(serde_json::Value::as_str);
        if !matches!(
            term_type,
            Some(
                "person"
                    | "organization"
                    | "brand-product"
                    | "technical-term"
                    | "acronym"
                    | "other"
            )
        ) {
            return Err("Dictionary term has an invalid type".to_string());
        }
    }

    let providers = normalized
        .pointer_mut("/data/providers")
        .ok_or_else(|| "Config payload is missing providers".to_string())?;
    let state: StoredProviderState = serde_json::from_value(providers.clone())
        .map_err(|_| "Config payload has invalid Provider configurations".to_string())?;
    validate_provider_state(&state)?;

    let id_map: HashMap<String, String> = state
        .configurations
        .iter()
        .map(|configuration| {
            (
                configuration.id.clone(),
                format!("provider_{}", uuid::Uuid::new_v4()),
            )
        })
        .collect();
    let object = providers
        .as_object_mut()
        .ok_or_else(|| "Config payload providers must be an object".to_string())?;
    let configurations = object
        .get_mut("configurations")
        .and_then(serde_json::Value::as_array_mut)
        .ok_or_else(|| "Config payload has invalid Provider configurations".to_string())?;
    for configuration in configurations {
        let old_id = configuration
            .get("id")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| "Provider configuration is missing an ID".to_string())?;
        configuration["id"] = serde_json::Value::String(id_map[old_id].clone());
    }
    object.insert(
        "activeAsrConfigId".to_string(),
        serde_json::Value::String(id_map[&state.active_asr_config_id].clone()),
    );
    object.insert(
        "activeRewriteConfigId".to_string(),
        serde_json::Value::String(id_map[&state.active_rewrite_config_id].clone()),
    );
    Ok(normalized)
}

pub fn resolve_active_provider_pipeline(
    connection: &Connection,
) -> Result<ResolvedProviderPipeline, String> {
    let preference = get_preference(connection, "providers")?
        .ok_or_else(|| "Provider configuration preference is missing".to_string())?;
    let state: StoredProviderState = serde_json::from_str(&preference)
        .map_err(|_| "Stored Provider configurations are invalid".to_string())?;
    validate_provider_state(&state)?;
    let stt = state
        .configurations
        .iter()
        .find(|item| item.id == state.active_asr_config_id)
        .expect("validated active ASR configuration");
    let rewrite = state
        .configurations
        .iter()
        .find(|item| item.id == state.active_rewrite_config_id)
        .expect("validated active Rewrite configuration");
    Ok(ResolvedProviderPipeline {
        stt_config_id: stt.id.clone(),
        stt_provider: stt.provider_id.clone(),
        stt_model: stt.model.clone(),
        stt_base_url: stt.base_url.clone(),
        rewrite_config_id: rewrite.id.clone(),
        rewrite_provider: rewrite.provider_id.clone(),
        rewrite_model: rewrite.model.clone(),
    })
}

pub fn import_config_payload(
    connection: &mut Connection,
    payload: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let schema_version = payload
        .get("schemaVersion")
        .and_then(|value| value.as_u64());
    if !matches!(schema_version, Some(1 | 2)) {
        return Err("Unsupported config schema version".to_string());
    }
    let normalized = normalized_import_payload(payload)?;
    let data = normalized
        .get("data")
        .and_then(|value| value.as_object())
        .ok_or_else(|| "Config payload is missing data".to_string())?;
    let profiles = data
        .get("promptProfiles")
        .and_then(|value| value.as_array())
        .ok_or_else(|| "Config payload is missing promptProfiles".to_string())?;
    let dictionary = data
        .get("dictionaryTerms")
        .and_then(|value| value.as_array())
        .ok_or_else(|| "Config payload is missing dictionaryTerms".to_string())?;
    let app_rules: &[serde_json::Value] = match data.get("appRules") {
        Some(value) => value
            .as_array()
            .map(Vec::as_slice)
            .ok_or_else(|| "Config payload appRules must be an array".to_string())?,
        None => &[],
    };
    let active_profile_id = data
        .get("activeProfileId")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Config payload is missing activeProfileId".to_string())?;
    for key in ["providers", "hotkey", "privacy"] {
        if !data.get(key).is_some_and(serde_json::Value::is_object) {
            return Err(format!("Config payload is missing {key}"));
        }
    }
    for key in ["performance", "appRouting"] {
        if data.get(key).is_some_and(|value| !value.is_object()) {
            return Err(format!("Config payload {key} must be an object"));
        }
    }
    if profiles.is_empty() {
        return Err("Config payload must include at least one profile".to_string());
    }
    let active_profile_exists = profiles.iter().any(|profile| {
        profile.get("id").and_then(|value| value.as_str()) == Some(active_profile_id)
            && profile
                .get("enabled")
                .and_then(|value| value.as_bool())
                .unwrap_or(true)
    });
    if !active_profile_exists {
        return Err("Active profile is missing or disabled".to_string());
    }

    let transaction = connection
        .transaction()
        .map_err(|error| format!("Cannot start config import: {error}"))?;
    transaction
        .execute("DELETE FROM prompt_profiles", [])
        .map_err(|error| format!("Cannot replace profiles: {error}"))?;
    transaction
        .execute("DELETE FROM dictionary_terms", [])
        .map_err(|error| format!("Cannot replace dictionary: {error}"))?;
    transaction
        .execute("DELETE FROM app_profile_rules", [])
        .map_err(|error| format!("Cannot replace app profile rules: {error}"))?;

    for value in profiles {
        let record = profile_from_export(value)?;
        upsert_profile(&transaction, &record)?;
    }
    for value in dictionary {
        let record = dictionary_from_export(value)?;
        upsert_dictionary_term(&transaction, &record)?;
    }
    for value in app_rules {
        let record = app_rule_from_export(value)?;
        upsert_app_profile_rule(&transaction, &record)?;
    }
    upsert_preference(
        &transaction,
        &PreferenceRecord {
            key: "active_profile_id".to_string(),
            value: active_profile_id.to_string(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        },
    )?;
    for (payload_key, preference_key) in [
        ("providers", "providers"),
        ("hotkey", "hotkey"),
        ("privacy", "privacy"),
        ("performance", "performance"),
        ("appRouting", "app_routing"),
    ] {
        if let Some(value) = data.get(payload_key) {
            upsert_preference(
                &transaction,
                &PreferenceRecord {
                    key: preference_key.to_string(),
                    value: value.to_string(),
                    updated_at: chrono::Utc::now().to_rfc3339(),
                },
            )?;
        }
    }
    transaction
        .commit()
        .map_err(|error| format!("Cannot commit config import: {error}"))?;
    Ok(normalized)
}

fn profile_from_export(value: &serde_json::Value) -> Result<ProfileRecord, String> {
    Ok(ProfileRecord {
        id: required_string(value, "id")?,
        name: required_string(value, "name")?,
        mode: required_string(value, "mode")?,
        system_prompt: required_string(value, "systemPrompt")?,
        user_prompt_template: required_string(value, "userPromptTemplate")?,
        target_language: value
            .get("targetLanguage")
            .and_then(|field| field.as_str())
            .map(ToOwned::to_owned),
        enabled: value
            .get("enabled")
            .and_then(|field| field.as_bool())
            .unwrap_or(true),
        updated_at: required_string(value, "updatedAt")?,
        deleted_at: None,
    })
}

fn dictionary_from_export(value: &serde_json::Value) -> Result<DictionaryRecord, String> {
    let term_type = value
        .get("type")
        .and_then(|field| field.as_str())
        .filter(|value| {
            matches!(
                *value,
                "person"
                    | "organization"
                    | "brand-product"
                    | "technical-term"
                    | "acronym"
                    | "other"
            )
        })
        .unwrap_or("other")
        .to_string();
    Ok(DictionaryRecord {
        id: required_string(value, "id")?,
        spoken: required_string(value, "spoken")?,
        written: required_string(value, "written")?,
        term_type,
        aliases_json: value
            .get("aliases")
            .cloned()
            .unwrap_or_else(|| serde_json::json!([]))
            .to_string(),
        tags_json: value
            .get("tags")
            .cloned()
            .unwrap_or_else(|| serde_json::json!([]))
            .to_string(),
        enabled: value
            .get("enabled")
            .and_then(|field| field.as_bool())
            .unwrap_or(true),
        updated_at: required_string(value, "updatedAt")?,
        deleted_at: None,
    })
}

fn app_rule_from_export(value: &serde_json::Value) -> Result<AppProfileRuleRecord, String> {
    let priority = value
        .get("priority")
        .and_then(|field| field.as_i64())
        .ok_or_else(|| "Config field is missing: priority".to_string())
        .and_then(|priority| {
            i32::try_from(priority).map_err(|_| "Config priority is out of range".to_string())
        })?;

    Ok(AppProfileRuleRecord {
        id: required_string(value, "id")?,
        app_id: required_string(value, "appId")?,
        window_title_pattern: value
            .get("windowTitlePattern")
            .and_then(|field| field.as_str())
            .map(ToOwned::to_owned),
        profile_id: required_string(value, "profileId")?,
        priority,
        enabled: value
            .get("enabled")
            .and_then(|field| field.as_bool())
            .unwrap_or(true),
        updated_at: required_string(value, "updatedAt")?,
        deleted_at: value
            .get("deletedAt")
            .and_then(|field| field.as_str())
            .map(ToOwned::to_owned),
    })
}

fn required_string(value: &serde_json::Value, field: &str) -> Result<String, String> {
    value
        .get(field)
        .and_then(|value| value.as_str())
        .map(ToOwned::to_owned)
        .ok_or_else(|| format!("Config field is missing: {field}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn named_provider_import_payload() -> serde_json::Value {
        serde_json::json!({
          "schemaVersion": 2,
          "data": {
            "providers": {
              "stt": { "providerId": "groq", "model": "whisper-large-v3-turbo" },
              "rewrite": { "providerId": "openai", "model": "gpt-5-nano" },
              "configurations": [
                { "id": "known-local-id", "name": "Groq", "kind": "stt", "providerId": "groq", "model": "whisper-large-v3-turbo", "createdAt": "2026-07-15T00:00:00Z", "updatedAt": "2026-07-15T00:00:00Z" },
                { "id": "known-rewrite-id", "name": "OpenAI", "kind": "rewrite", "providerId": "openai", "model": "gpt-5-nano", "createdAt": "2026-07-15T00:00:00Z", "updatedAt": "2026-07-15T00:00:00Z" }
              ],
              "activeAsrConfigId": "known-local-id",
              "activeRewriteConfigId": "known-rewrite-id"
            },
            "hotkey": { "binding": "Alt+Space", "mode": "push-to-talk" },
            "privacy": { "saveRawAudio": false },
            "performance": { "fastMode": false, "speakToEdit": false },
            "appRouting": { "enabled": false },
            "activeProfileId": "normal",
            "promptProfiles": [{ "id": "normal", "name": "Normal", "mode": "normal", "systemPrompt": "Clean", "userPromptTemplate": "{{transcript}}", "enabled": true, "updatedAt": "2026-07-15T00:00:00Z" }],
            "dictionaryTerms": [{ "id": "term", "spoken": "go speak", "written": "Gospeak", "type": "brand-product", "aliases": [], "tags": [], "enabled": true, "updatedAt": "2026-07-15T00:00:00Z" }],
            "appRules": []
          }
        })
    }

    #[test]
    fn migrates_and_round_trips_preferences() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();

        upsert_preference(
            &connection,
            &PreferenceRecord {
                key: "default_stt_provider".to_string(),
                value: "groq".to_string(),
                updated_at: "2026-06-22T00:00:00Z".to_string(),
            },
        )
        .unwrap();

        assert_eq!(
            get_preference(&connection, "default_stt_provider").unwrap(),
            Some("groq".to_string())
        );
    }

    #[test]
    fn migrates_app_profile_rules_table() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();

        let columns = table_columns(&connection, "app_profile_rules");

        assert!(columns.contains(&"id".to_string()));
        assert!(columns.contains(&"app_id".to_string()));
        assert!(columns.contains(&"window_title_pattern".to_string()));
        assert!(columns.contains(&"profile_id".to_string()));
        assert!(columns.contains(&"priority".to_string()));
        assert!(columns.contains(&"enabled".to_string()));
        assert!(columns.contains(&"updated_at".to_string()));
        assert!(columns.contains(&"deleted_at".to_string()));
    }

    #[test]
    fn upserts_and_lists_app_profile_rules_by_priority_then_app_id() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();

        upsert_app_profile_rule(
            &connection,
            &AppProfileRuleRecord {
                id: "rule_low".to_string(),
                app_id: "chrome.exe".to_string(),
                window_title_pattern: None,
                profile_id: "normal".to_string(),
                priority: 1,
                enabled: true,
                updated_at: "2026-06-30T00:00:00Z".to_string(),
                deleted_at: None,
            },
        )
        .unwrap();
        upsert_app_profile_rule(
            &connection,
            &AppProfileRuleRecord {
                id: "rule_disabled".to_string(),
                app_id: "code.exe".to_string(),
                window_title_pattern: Some("Gospeak".to_string()),
                profile_id: "prompt".to_string(),
                priority: 20,
                enabled: false,
                updated_at: "2026-06-30T00:00:00Z".to_string(),
                deleted_at: None,
            },
        )
        .unwrap();
        upsert_app_profile_rule(
            &connection,
            &AppProfileRuleRecord {
                id: "rule_high".to_string(),
                app_id: "brave.exe".to_string(),
                window_title_pattern: None,
                profile_id: "email".to_string(),
                priority: 20,
                enabled: true,
                updated_at: "2026-06-30T00:00:00Z".to_string(),
                deleted_at: None,
            },
        )
        .unwrap();

        let rules = list_app_profile_rules(&connection).unwrap();

        assert_eq!(
            rules
                .iter()
                .map(|rule| rule.id.as_str())
                .collect::<Vec<_>>(),
            vec!["rule_high", "rule_disabled", "rule_low"]
        );
    }

    #[test]
    fn app_profile_rule_soft_deletes_are_hidden() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();

        upsert_app_profile_rule(
            &connection,
            &AppProfileRuleRecord {
                id: "rule_visible".to_string(),
                app_id: "chrome.exe".to_string(),
                window_title_pattern: None,
                profile_id: "prompt".to_string(),
                priority: 1,
                enabled: true,
                updated_at: "2026-06-30T00:00:00Z".to_string(),
                deleted_at: None,
            },
        )
        .unwrap();
        upsert_app_profile_rule(
            &connection,
            &AppProfileRuleRecord {
                id: "rule_deleted".to_string(),
                app_id: "code.exe".to_string(),
                window_title_pattern: None,
                profile_id: "email".to_string(),
                priority: 2,
                enabled: true,
                updated_at: "2026-06-30T00:00:00Z".to_string(),
                deleted_at: Some("2026-06-30T01:00:00Z".to_string()),
            },
        )
        .unwrap();

        let rules = list_app_profile_rules(&connection).unwrap();

        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].id, "rule_visible");
    }

    #[test]
    fn dictionary_soft_deletes_are_hidden() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();

        upsert_dictionary_term(
            &connection,
            &DictionaryRecord {
                id: "dict_1".to_string(),
                spoken: "agent security".to_string(),
                written: "AI Agent Security".to_string(),
                term_type: "technical-term".to_string(),
                aliases_json: "[]".to_string(),
                tags_json: "[\"work\"]".to_string(),
                enabled: true,
                updated_at: "2026-06-22T00:00:00Z".to_string(),
                deleted_at: None,
            },
        )
        .unwrap();

        let terms = list_dictionary_terms(&connection).unwrap();
        assert_eq!(terms.len(), 1);
        assert_eq!(terms[0].term_type, "technical-term");
    }

    #[test]
    fn export_payload_round_trips_through_json_file() {
        let file = tempfile::NamedTempFile::new().unwrap();
        let payload = serde_json::json!({
          "schemaVersion": 1,
          "data": {
            "providers": {
              "stt": { "providerId": "groq", "model": "whisper-large-v3-turbo" }
            }
          }
        });

        write_json_file(file.path(), &payload).unwrap();
        let imported = read_json_file(file.path()).unwrap();

        assert_eq!(imported["schemaVersion"], 1);
        assert_eq!(imported["data"]["providers"]["stt"]["providerId"], "groq");
    }

    #[test]
    fn imports_config_transactionally_and_rejects_unknown_schema() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        let payload = serde_json::json!({
          "schemaVersion": 1,
          "data": {
            "providers": {
              "stt": { "providerId": "groq", "model": "whisper-large-v3" },
              "rewrite": { "providerId": "openai", "model": "gpt-5-mini" }
            },
            "hotkey": { "binding": "Alt+Shift+Space", "mode": "toggle" },
            "privacy": {
              "saveRawAudio": false,
              "saveTranscriptHistory": false,
              "syncTranscriptHistory": false,
              "crashReportIncludesTranscript": false
            },
            "activeProfileId": "email",
            "promptProfiles": [{
              "id": "email",
              "name": "Email",
              "mode": "email",
              "systemPrompt": "Write an email.",
              "userPromptTemplate": "{{transcript}}",
              "enabled": true,
              "updatedAt": "2026-06-23T00:00:00Z"
            }],
            "dictionaryTerms": [{
              "id": "gospeak",
              "spoken": "Gawspeak",
              "written": "Gospeak",
              "aliases": [],
              "tags": ["product"],
              "enabled": true,
              "updatedAt": "2026-06-23T00:00:00Z"
            }]
          }
        });

        import_config_payload(&mut connection, &payload).unwrap();

        assert_eq!(list_profiles(&connection).unwrap()[0].id, "email");
        assert_eq!(
            list_dictionary_terms(&connection).unwrap()[0].written,
            "Gospeak"
        );
        assert_eq!(
            list_dictionary_terms(&connection).unwrap()[0].term_type,
            "other"
        );
        assert_eq!(
            get_preference(&connection, "active_profile_id").unwrap(),
            Some("email".to_string())
        );

        let invalid = serde_json::json!({ "schemaVersion": 3, "data": {} });
        assert!(import_config_payload(&mut connection, &invalid).is_err());
        assert_eq!(list_profiles(&connection).unwrap().len(), 1);

        let missing_settings = serde_json::json!({
          "schemaVersion": 1,
          "data": {
            "activeProfileId": "email",
            "promptProfiles": [],
            "dictionaryTerms": []
          }
        });
        assert!(import_config_payload(&mut connection, &missing_settings).is_err());
        assert_eq!(list_profiles(&connection).unwrap().len(), 1);
    }

    #[test]
    fn v2_import_validates_provider_state_and_remaps_credential_ids() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        let payload = named_provider_import_payload();

        let normalized = import_config_payload(&mut connection, &payload).unwrap();
        let providers = &normalized["data"]["providers"];
        assert_ne!(providers["activeAsrConfigId"], "known-local-id");
        assert_ne!(providers["activeRewriteConfigId"], "known-rewrite-id");
        let persisted = get_preference(&connection, "providers").unwrap().unwrap();
        let resolved = resolve_active_provider_pipeline(&connection).unwrap();
        assert!(persisted.contains(&resolved.stt_config_id));
        assert_eq!(resolved.stt_provider, "groq");
        assert_eq!(resolved.rewrite_provider, "openai");
    }

    #[test]
    fn v2_import_rejects_invalid_provider_state_before_replacing_data() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        let valid = named_provider_import_payload();
        import_config_payload(&mut connection, &valid).unwrap();
        let original_profile_count = list_profiles(&connection).unwrap().len();

        let mut invalid = named_provider_import_payload();
        invalid["data"]["providers"]["activeAsrConfigId"] =
            serde_json::Value::String("known-rewrite-id".to_string());
        assert!(import_config_payload(&mut connection, &invalid).is_err());
        assert_eq!(
            list_profiles(&connection).unwrap().len(),
            original_profile_count
        );

        let mut invalid_type = named_provider_import_payload();
        invalid_type["data"]["dictionaryTerms"][0]["type"] =
            serde_json::Value::String("custom".to_string());
        assert!(import_config_payload(&mut connection, &invalid_type).is_err());
        assert_eq!(
            list_profiles(&connection).unwrap().len(),
            original_profile_count
        );

        let mut secret_field = named_provider_import_payload();
        secret_field["data"]["providers"]["configurations"][0]["apiKey"] =
            serde_json::Value::String("must-not-import".to_string());
        assert!(import_config_payload(&mut connection, &secret_field).is_err());
    }

    #[test]
    fn imports_config_app_rules_and_defaults_missing_app_rules_to_empty() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        let base_payload = serde_json::json!({
          "schemaVersion": 1,
          "data": {
            "providers": {
              "stt": { "providerId": "groq", "model": "whisper-large-v3" },
              "rewrite": { "providerId": "openai", "model": "gpt-5-mini" }
            },
            "hotkey": { "binding": "Alt+Shift+Space", "mode": "toggle" },
            "privacy": {
              "saveRawAudio": false,
              "saveTranscriptHistory": false,
              "syncTranscriptHistory": false,
              "crashReportIncludesTranscript": false
            },
            "activeProfileId": "prompt",
            "promptProfiles": [{
              "id": "prompt",
              "name": "Prompt",
              "mode": "prompt",
              "systemPrompt": "Write a prompt.",
              "userPromptTemplate": "{{transcript}}",
              "enabled": true,
              "updatedAt": "2026-06-30T00:00:00Z"
            }],
            "dictionaryTerms": []
          }
        });

        import_config_payload(&mut connection, &base_payload).unwrap();
        assert!(list_app_profile_rules(&connection).unwrap().is_empty());

        let mut payload_with_rules = base_payload.clone();
        payload_with_rules["data"]["appRules"] = serde_json::json!([{
          "id": "rule_prompt",
          "appId": "chrome.exe",
          "windowTitlePattern": "ChatGPT",
          "profileId": "prompt",
          "priority": 10,
          "enabled": true,
          "updatedAt": "2026-06-30T01:00:00Z"
        }]);

        import_config_payload(&mut connection, &payload_with_rules).unwrap();
        let rules = list_app_profile_rules(&connection).unwrap();

        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].id, "rule_prompt");
        assert_eq!(rules[0].app_id, "chrome.exe");
        assert_eq!(rules[0].window_title_pattern.as_deref(), Some("ChatGPT"));
    }

    #[test]
    fn imports_app_routing_and_performance_preferences() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        let payload = serde_json::json!({
          "schemaVersion": 1,
          "data": {
            "providers": {
              "stt": { "providerId": "groq", "model": "whisper-large-v3" },
              "rewrite": { "providerId": "openai", "model": "gpt-5-mini" }
            },
            "performance": { "fastMode": true },
            "appRouting": { "enabled": true },
            "hotkey": { "binding": "Alt+Shift+Space", "mode": "toggle" },
            "privacy": {
              "saveRawAudio": false,
              "saveTranscriptHistory": false,
              "syncTranscriptHistory": false,
              "crashReportIncludesTranscript": false
            },
            "activeProfileId": "normal",
            "promptProfiles": [{
              "id": "normal",
              "name": "Normal",
              "mode": "normal",
              "systemPrompt": "Clean transcript.",
              "userPromptTemplate": "{{transcript}}",
              "enabled": true,
              "updatedAt": "2026-06-30T00:00:00Z"
            }],
            "dictionaryTerms": [],
            "appRules": []
          }
        });

        import_config_payload(&mut connection, &payload).unwrap();

        assert_eq!(
            get_preference(&connection, "performance").unwrap(),
            Some(r#"{"fastMode":true}"#.to_string())
        );
        assert_eq!(
            get_preference(&connection, "app_routing").unwrap(),
            Some(r#"{"enabled":true}"#.to_string())
        );
    }

    #[test]
    fn records_usage_without_transcript_content() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        let event = UsageEventRecord {
            id: "usage_1".to_string(),
            stt_provider: "groq".to_string(),
            stt_model: "whisper-large-v3-turbo".to_string(),
            llm_provider: "openai".to_string(),
            llm_model: "gpt-5-nano".to_string(),
            profile_id: "normal".to_string(),
            audio_seconds: Some(1.25),
            stt_latency_ms: 120,
            rewrite_latency_ms: Some(80),
            rewrite_fallback_used: false,
            stt_estimated_cost: Some(0.000014),
            rewrite_estimated_cost: Some(0.000032),
            estimated_cost: None,
            output_character_count: 23,
            created_at: "2026-06-23T00:00:00Z".to_string(),
        };

        insert_usage_event(&connection, &event).unwrap();
        let events = list_usage_events(&connection).unwrap();

        assert_eq!(events, vec![event]);
        let columns = table_columns(&connection, "usage_events");
        assert!(!columns.iter().any(|column| column.contains("transcript")));
        assert!(!columns.iter().any(|column| column.contains("text")));
    }

    #[test]
    fn usage_events_round_trip_output_character_count() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        let columns = table_columns(&connection, "usage_events");
        assert!(columns.contains(&"output_character_count".to_string()));

        let event = UsageEventRecord {
            id: "usage_count".to_string(),
            stt_provider: "groq".to_string(),
            stt_model: "whisper-large-v3-turbo".to_string(),
            llm_provider: "openai".to_string(),
            llm_model: "gpt-5-nano".to_string(),
            profile_id: "normal".to_string(),
            audio_seconds: Some(1.0),
            stt_latency_ms: 10,
            rewrite_latency_ms: Some(5),
            rewrite_fallback_used: false,
            stt_estimated_cost: Some(0.001),
            rewrite_estimated_cost: Some(0.002),
            estimated_cost: Some(0.003),
            output_character_count: 23,
            created_at: "2026-07-10T00:00:00Z".to_string(),
        };
        insert_usage_event(&connection, &event).unwrap();
        assert_eq!(
            list_usage_events(&connection).unwrap()[0].output_character_count,
            23
        );
    }

    #[test]
    fn migrates_legacy_database_into_app_data_once() {
        let root = tempfile::tempdir().unwrap();
        let legacy = root.path().join("legacy").join("gospeak.sqlite3");
        let app_data = root.path().join("app-data");
        std::fs::create_dir_all(legacy.parent().unwrap()).unwrap();
        std::fs::write(&legacy, b"legacy database").unwrap();

        let destination = prepare_database_path(&app_data, Some(&legacy)).unwrap();

        assert_eq!(destination, app_data.join("gospeak.sqlite3"));
        assert_eq!(std::fs::read(&destination).unwrap(), b"legacy database");
        assert!(!legacy.exists());

        std::fs::write(&destination, b"current database").unwrap();
        std::fs::write(&legacy, b"stale legacy database").unwrap();
        prepare_database_path(&app_data, Some(&legacy)).unwrap();
        assert_eq!(std::fs::read(&destination).unwrap(), b"current database");
    }

    #[test]
    fn seeds_default_profiles_for_first_run() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();

        let profiles = list_profiles(&connection).unwrap();

        assert!(profiles.iter().any(|profile| profile.id == "normal"));
        assert!(profiles.iter().any(|profile| profile.id == "email"));
        assert_eq!(
            get_preference(&connection, "active_profile_id").unwrap(),
            Some("normal".to_string())
        );
    }

    #[test]
    fn upgrades_existing_usage_table_before_recording_events() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                r#"
                CREATE TABLE usage_events (
                  id TEXT PRIMARY KEY,
                  stt_provider TEXT,
                  stt_model TEXT,
                  llm_provider TEXT,
                  llm_model TEXT,
                  audio_seconds REAL,
                  estimated_cost REAL,
                  created_at TEXT NOT NULL
                );

                INSERT INTO usage_events
                  (id, stt_provider, stt_model, llm_provider, llm_model,
                   audio_seconds, estimated_cost, created_at)
                VALUES
                  ('legacy_usage', 'groq', 'whisper-large-v3-turbo', 'openai', 'gpt-5-nano',
                   1.25, 0.003, '2026-07-10T00:00:00Z');
                "#,
            )
            .unwrap();

        migrate(&connection).unwrap();

        let columns = table_columns(&connection, "usage_events");
        assert!(columns.contains(&"profile_id".to_string()));
        assert!(columns.contains(&"stt_latency_ms".to_string()));
        assert!(columns.contains(&"rewrite_fallback_used".to_string()));
        assert!(columns.contains(&"stt_estimated_cost".to_string()));
        assert!(columns.contains(&"rewrite_estimated_cost".to_string()));
        assert!(columns.contains(&"output_character_count".to_string()));
        assert_eq!(
            list_usage_events(&connection).unwrap(),
            vec![UsageEventRecord {
                id: "legacy_usage".to_string(),
                stt_provider: "groq".to_string(),
                stt_model: "whisper-large-v3-turbo".to_string(),
                llm_provider: "openai".to_string(),
                llm_model: "gpt-5-nano".to_string(),
                profile_id: "normal".to_string(),
                audio_seconds: Some(1.25),
                stt_latency_ms: 0,
                rewrite_latency_ms: None,
                rewrite_fallback_used: false,
                stt_estimated_cost: None,
                rewrite_estimated_cost: None,
                estimated_cost: Some(0.003),
                output_character_count: 0,
                created_at: "2026-07-10T00:00:00Z".to_string(),
            }]
        );
    }

    fn table_columns(connection: &Connection, table: &str) -> Vec<String> {
        let mut statement = connection
            .prepare(&format!("PRAGMA table_info({table})"))
            .unwrap();
        statement
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
    }
}
