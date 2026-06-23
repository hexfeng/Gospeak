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

pub fn default_database_path() -> Result<PathBuf, String> {
    let base = std::env::current_dir().map_err(|error| format!("Cannot resolve cwd: {error}"))?;
    Ok(base.join("gospeak.sqlite3"))
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
        audio_seconds REAL,
        estimated_cost REAL,
        created_at TEXT NOT NULL
      );
      "#,
        )
        .map_err(|error| format!("Cannot migrate SQLite database: {error}"))?;
    Ok(())
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
            list_preferences(&connection).unwrap(),
            vec![PreferenceRecord {
                key: "default_stt_provider".to_string(),
                value: "groq".to_string(),
                updated_at: "2026-06-22T00:00:00Z".to_string(),
            }]
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
}
