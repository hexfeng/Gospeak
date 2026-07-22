use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    net::{Ipv4Addr, SocketAddrV4, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::Manager;

const RUNTIME_PREFERENCE: &str = "qwen_local_runtime_dir";
const HEALTH_URL: &str = "http://127.0.0.1:8000/health";
const EXPECTED_MODEL: &str = "Qwen/Qwen3-ASR-0.6B-hf";
const START_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum QwenLocalStatusKind {
    NotConfigured,
    Stopped,
    Starting,
    Ready,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QwenLocalStatus {
    pub status: QwenLocalStatusKind,
    pub message: Option<String>,
}

impl QwenLocalStatus {
    fn new(status: QwenLocalStatusKind, message: impl Into<Option<String>>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

struct QwenLocalProcess {
    child: Option<Child>,
    status: QwenLocalStatus,
    temp_dir: Option<PathBuf>,
    generation: u64,
}

pub struct QwenLocalProcessState {
    inner: Mutex<QwenLocalProcess>,
}

impl Default for QwenLocalProcessState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(QwenLocalProcess {
                child: None,
                status: QwenLocalStatus::new(QwenLocalStatusKind::NotConfigured, None),
                temp_dir: None,
                generation: 0,
            }),
        }
    }
}

#[derive(Deserialize)]
struct HealthResponse {
    status: String,
    model: String,
}

pub fn get_status(
    app: &tauri::AppHandle,
    state: &QwenLocalProcessState,
) -> Result<QwenLocalStatus, String> {
    let configured = runtime_dir(app)?.is_some();
    let mut stale_temp_dir = None;
    let status = {
        let mut inner = state
            .inner
            .lock()
            .map_err(|_| "Qwen Local state lock poisoned".to_string())?;
        if let Some(child) = inner.child.as_mut() {
            if child
                .try_wait()
                .map_err(|_| "Could not inspect the Qwen Local process".to_string())?
                .is_some()
            {
                inner.child = None;
                stale_temp_dir = inner.temp_dir.take();
                inner.status = QwenLocalStatus::new(
                    QwenLocalStatusKind::Failed,
                    Some("Qwen Local process exited unexpectedly".to_string()),
                );
            }
        }
        if inner.child.is_none() {
            match (&inner.status.status, configured) {
                (_, false) => {
                    inner.status = QwenLocalStatus::new(QwenLocalStatusKind::NotConfigured, None)
                }
                (QwenLocalStatusKind::NotConfigured, true) => {
                    inner.status = QwenLocalStatus::new(QwenLocalStatusKind::Stopped, None)
                }
                _ => {}
            }
        }
        inner.status.clone()
    };
    cleanup_temp_dir(stale_temp_dir.as_deref());
    Ok(status)
}

pub fn start(
    app: &tauri::AppHandle,
    state: &QwenLocalProcessState,
) -> Result<QwenLocalStatus, String> {
    let runtime_dir = runtime_dir(app)?.ok_or_else(|| {
        set_failed(state, "Qwen Local runtime directory is not configured");
        "Qwen Local runtime directory is not configured".to_string()
    })?;
    let python = runtime_dir.join(".venv").join("Scripts").join("python.exe");
    let server = runtime_dir.join("server.py");

    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Qwen Local state lock poisoned".to_string())?;
    if inner.child.is_some()
        || matches!(
            inner.status.status,
            QwenLocalStatusKind::Starting | QwenLocalStatusKind::Ready
        )
    {
        return Err("Qwen Local is already running".to_string());
    }
    if !python.is_file() {
        return fail_locked(&mut inner, "Qwen Local Python executable is missing");
    }
    if !server.is_file() {
        return fail_locked(&mut inner, "Qwen Local server.py is missing");
    }
    if port_is_in_use() {
        return fail_locked(&mut inner, "Port 127.0.0.1:8000 is already in use");
    }

    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|_| "Could not resolve the Gospeak log directory".to_string())?;
    fs::create_dir_all(&log_dir)
        .map_err(|_| "Could not create the Gospeak log directory".to_string())?;
    let log = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(log_dir.join("qwen-local.log"))
        .map_err(|_| "Could not open the Qwen Local log".to_string())?;
    let stderr = log
        .try_clone()
        .map_err(|_| "Could not open the Qwen Local log".to_string())?;
    let temp_dir = std::env::temp_dir().join(format!("gospeak-qwen-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&temp_dir)
        .map_err(|_| "Could not create Qwen Local temporary directory".to_string())?;

    let mut command = Command::new(python);
    command
        .arg("-u")
        .arg(server)
        .current_dir(runtime_dir)
        .env("HF_HUB_OFFLINE", "1")
        .env("PYTHONUNBUFFERED", "1")
        .env("GOSPEAK_QWEN_TEMP_DIR", &temp_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(stderr));
    hide_console(&mut command);
    let child = match command.spawn() {
        Ok(child) => child,
        Err(_) => {
            cleanup_temp_dir(Some(&temp_dir));
            return fail_locked(&mut inner, "Could not start the Qwen Local process");
        }
    };

    inner.generation = inner.generation.wrapping_add(1);
    let generation = inner.generation;
    inner.child = Some(child);
    inner.temp_dir = Some(temp_dir);
    inner.status = QwenLocalStatus::new(
        QwenLocalStatusKind::Starting,
        Some("Loading Qwen Local model".to_string()),
    );
    let status = inner.status.clone();
    drop(inner);

    let app = app.clone();
    std::thread::spawn(move || wait_until_ready(app, generation));
    Ok(status)
}

pub fn stop(state: &QwenLocalProcessState) -> Result<QwenLocalStatus, String> {
    let (child, temp_dir, status) = {
        let mut inner = state
            .inner
            .lock()
            .map_err(|_| "Qwen Local state lock poisoned".to_string())?;
        inner.generation = inner.generation.wrapping_add(1);
        let status = QwenLocalStatus::new(QwenLocalStatusKind::Stopped, None);
        inner.status = status.clone();
        (inner.child.take(), inner.temp_dir.take(), status)
    };
    terminate_child(child);
    cleanup_temp_dir(temp_dir.as_deref());
    Ok(status)
}

pub fn ensure_ready(
    app: &tauri::AppHandle,
    state: &QwenLocalProcessState,
    base_url: Option<&str>,
) -> Result<(), String> {
    if !base_url.is_some_and(is_managed_base_url) {
        return Ok(());
    }
    let status = get_status(app, state)?;
    readiness_result(status)
}

fn readiness_result(status: QwenLocalStatus) -> Result<(), String> {
    match status.status {
        QwenLocalStatusKind::Ready => Ok(()),
        QwenLocalStatusKind::Starting => Err("Qwen Local is still starting".to_string()),
        QwenLocalStatusKind::NotConfigured => {
            Err("Qwen Local runtime directory is not configured".to_string())
        }
        QwenLocalStatusKind::Stopped => {
            Err("Qwen Local is not started. Start it from Providers.".to_string())
        }
        QwenLocalStatusKind::Failed => Err(status
            .message
            .unwrap_or_else(|| "Qwen Local failed to start".to_string())),
    }
}

pub(crate) fn is_managed_base_url(base_url: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(base_url) else {
        return false;
    };
    url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.port_or_known_default() == Some(8000)
        && url.path().trim_end_matches('/') == "/v1"
        && url.query().is_none()
        && url.fragment().is_none()
}

fn runtime_dir(app: &tauri::AppHandle) -> Result<Option<PathBuf>, String> {
    let database = crate::open_app_database(app)?;
    Ok(
        crate::storage::get_preference(&database, RUNTIME_PREFERENCE)?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .map(PathBuf::from),
    )
}

fn wait_until_ready(app: tauri::AppHandle, generation: u64) {
    let client = match reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(client) => client,
        Err(_) => {
            fail_generation(
                &app,
                generation,
                "Could not create the Qwen Local health client",
            );
            return;
        }
    };
    let started = Instant::now();
    while started.elapsed() < START_TIMEOUT {
        let state = app.state::<QwenLocalProcessState>();
        match process_is_current_and_running(&state, generation) {
            Ok(true) => {}
            Ok(false) => return,
            Err(message) => {
                fail_generation(&app, generation, &message);
                return;
            }
        }
        if client
            .get(HEALTH_URL)
            .send()
            .ok()
            .and_then(|response| response.json::<HealthResponse>().ok())
            .is_some_and(|health| health.status == "ready" && health.model == EXPECTED_MODEL)
        {
            if let Ok(mut inner) = state.inner.lock() {
                if inner.generation == generation && inner.child.is_some() {
                    inner.status = QwenLocalStatus::new(QwenLocalStatusKind::Ready, None);
                }
            }
            return;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    fail_generation(
        &app,
        generation,
        "Qwen Local did not become ready within 120 seconds",
    );
}

fn process_is_current_and_running(
    state: &QwenLocalProcessState,
    generation: u64,
) -> Result<bool, String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Qwen Local state lock poisoned".to_string())?;
    if inner.generation != generation {
        return Ok(false);
    }
    let Some(child) = inner.child.as_mut() else {
        return Ok(false);
    };
    match child.try_wait() {
        Ok(None) => Ok(true),
        Ok(Some(_)) => Err("Qwen Local process exited before becoming ready".to_string()),
        Err(_) => Err("Could not inspect the Qwen Local process".to_string()),
    }
}

fn fail_generation(app: &tauri::AppHandle, generation: u64, message: &str) {
    let state = app.state::<QwenLocalProcessState>();
    let (child, temp_dir) = match state.inner.lock() {
        Ok(mut inner) if inner.generation == generation => {
            inner.generation = inner.generation.wrapping_add(1);
            inner.status =
                QwenLocalStatus::new(QwenLocalStatusKind::Failed, Some(message.to_string()));
            (inner.child.take(), inner.temp_dir.take())
        }
        _ => return,
    };
    terminate_child(child);
    cleanup_temp_dir(temp_dir.as_deref());
}

fn set_failed(state: &QwenLocalProcessState, message: &str) {
    if let Ok(mut inner) = state.inner.lock() {
        inner.status = QwenLocalStatus::new(QwenLocalStatusKind::Failed, Some(message.to_string()));
    }
}

fn fail_locked<T>(inner: &mut QwenLocalProcess, message: &str) -> Result<T, String> {
    inner.status = QwenLocalStatus::new(QwenLocalStatusKind::Failed, Some(message.to_string()));
    Err(message.to_string())
}

fn port_is_in_use() -> bool {
    TcpStream::connect_timeout(
        &SocketAddrV4::new(Ipv4Addr::LOCALHOST, 8000).into(),
        Duration::from_millis(200),
    )
    .is_ok()
}

fn terminate_child(child: Option<Child>) {
    let Some(mut child) = child else {
        return;
    };
    if child.try_wait().ok().flatten().is_none() {
        let _ = child.kill();
    }
    let _ = child.wait();
}

fn cleanup_temp_dir(path: Option<&Path>) {
    let Some(path) = path else {
        return;
    };
    let expected_parent = std::env::temp_dir();
    let safe_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with("gospeak-qwen-"));
    if path.parent() == Some(expected_parent.as_path()) && safe_name {
        let _ = fs::remove_dir_all(path);
    }
}

#[cfg(windows)]
fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(windows::Win32::System::Threading::CREATE_NO_WINDOW.0);
}

#[cfg(not(windows))]
fn hide_console(_command: &mut Command) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_only_the_managed_qwen_endpoint() {
        assert!(is_managed_base_url("http://127.0.0.1:8000/v1"));
        assert!(is_managed_base_url("http://127.0.0.1:8000/v1/"));
        assert!(!is_managed_base_url("http://localhost:8000/v1"));
        assert!(!is_managed_base_url("http://127.0.0.1:8001/v1"));
        assert!(!is_managed_base_url(
            "http://127.0.0.1:8000/v1?mode=external"
        ));
    }

    #[test]
    fn serializes_status_for_the_frontend() {
        let status = QwenLocalStatus::new(
            QwenLocalStatusKind::Failed,
            Some("Port is busy".to_string()),
        );

        assert_eq!(
            serde_json::to_value(status).unwrap(),
            serde_json::json!({"status": "failed", "message": "Port is busy"})
        );
    }

    #[test]
    fn reports_actionable_readiness_errors() {
        assert_eq!(
            readiness_result(QwenLocalStatus::new(QwenLocalStatusKind::Stopped, None)).unwrap_err(),
            "Qwen Local is not started. Start it from Providers."
        );
        assert_eq!(
            readiness_result(QwenLocalStatus::new(
                QwenLocalStatusKind::Starting,
                Some("Loading".to_string())
            ))
            .unwrap_err(),
            "Qwen Local is still starting"
        );
        assert_eq!(
            readiness_result(QwenLocalStatus::new(
                QwenLocalStatusKind::Failed,
                Some("Port is busy".to_string())
            ))
            .unwrap_err(),
            "Port is busy"
        );
    }
}
