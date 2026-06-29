use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PreferenceRecord {
    pub key: String,
    pub value: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DictionaryRecord {
    pub id: String,
    pub spoken: String,
    pub written: String,
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
    pub estimated_cost: Option<f64>,
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
        estimated_cost REAL,
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
        (id, spoken, written, aliases_json, tags_json, enabled, updated_at, deleted_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(id) DO UPDATE SET
        spoken = excluded.spoken,
        written = excluded.written,
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
      SELECT id, spoken, written, aliases_json, tags_json, enabled, updated_at, deleted_at
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
                aliases_json: row.get(3)?,
                tags_json: row.get(4)?,
                enabled: row.get::<_, i32>(5)? != 0,
                updated_at: row.get(6)?,
                deleted_at: row.get(7)?,
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
               rewrite_fallback_used, estimated_cost, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
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
                event.estimated_cost,
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
                   rewrite_fallback_used, estimated_cost, created_at
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
                estimated_cost: row.get(10)?,
                created_at: row.get(11)?,
            })
        })
        .map_err(|error| format!("Cannot query usage events: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Cannot read usage events: {error}"))
}

pub fn import_config_payload(
    connection: &mut Connection,
    payload: &serde_json::Value,
) -> Result<(), String> {
    if payload
        .get("schemaVersion")
        .and_then(|value| value.as_u64())
        != Some(1)
    {
        return Err("Unsupported config schema version".to_string());
    }
    let data = payload
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
    let active_profile_id = data
        .get("activeProfileId")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Config payload is missing activeProfileId".to_string())?;
    for key in ["providers", "hotkey", "privacy"] {
        if !data.get(key).is_some_and(serde_json::Value::is_object) {
            return Err(format!("Config payload is missing {key}"));
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

    for value in profiles {
        let record = profile_from_export(value)?;
        upsert_profile(&transaction, &record)?;
    }
    for value in dictionary {
        let record = dictionary_from_export(value)?;
        upsert_dictionary_term(&transaction, &record)?;
    }
    upsert_preference(
        &transaction,
        &PreferenceRecord {
            key: "active_profile_id".to_string(),
            value: active_profile_id.to_string(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        },
    )?;
    for key in ["providers", "hotkey", "privacy"] {
        if let Some(value) = data.get(key) {
            upsert_preference(
                &transaction,
                &PreferenceRecord {
                    key: key.to_string(),
                    value: value.to_string(),
                    updated_at: chrono::Utc::now().to_rfc3339(),
                },
            )?;
        }
    }
    transaction
        .commit()
        .map_err(|error| format!("Cannot commit config import: {error}"))
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
    Ok(DictionaryRecord {
        id: required_string(value, "id")?,
        spoken: required_string(value, "spoken")?,
        written: required_string(value, "written")?,
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
    fn dictionary_soft_deletes_are_hidden() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();

        upsert_dictionary_term(
            &connection,
            &DictionaryRecord {
                id: "dict_1".to_string(),
                spoken: "agent security".to_string(),
                written: "AI Agent Security".to_string(),
                aliases_json: "[]".to_string(),
                tags_json: "[\"work\"]".to_string(),
                enabled: true,
                updated_at: "2026-06-22T00:00:00Z".to_string(),
                deleted_at: None,
            },
        )
        .unwrap();

        assert_eq!(list_dictionary_terms(&connection).unwrap().len(), 1);
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
            get_preference(&connection, "active_profile_id").unwrap(),
            Some("email".to_string())
        );

        let invalid = serde_json::json!({ "schemaVersion": 2, "data": {} });
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
            estimated_cost: None,
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
                "#,
            )
            .unwrap();

        migrate(&connection).unwrap();

        let columns = table_columns(&connection, "usage_events");
        assert!(columns.contains(&"profile_id".to_string()));
        assert!(columns.contains(&"stt_latency_ms".to_string()));
        assert!(columns.contains(&"rewrite_fallback_used".to_string()));
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
