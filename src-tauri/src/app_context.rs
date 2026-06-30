use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundAppContext {
    pub app_id: Option<String>,
    pub window_title: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppProfileRule {
    pub id: String,
    pub app_id: String,
    pub window_title_pattern: Option<String>,
    pub profile_id: String,
    pub priority: i32,
    pub enabled: bool,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

impl AppProfileRule {
    #[cfg(test)]
    fn new_for_test(
        id: &str,
        app_id: &str,
        window_title_pattern: Option<&str>,
        profile_id: &str,
        priority: i32,
        enabled: bool,
    ) -> Self {
        Self {
            id: id.to_string(),
            app_id: app_id.to_string(),
            window_title_pattern: window_title_pattern.map(ToOwned::to_owned),
            profile_id: profile_id.to_string(),
            priority,
            enabled,
            updated_at: "2026-06-30T00:00:00Z".to_string(),
            deleted_at: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProfileResolutionSource {
    AppRule,
    ActiveProfile,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedProfile {
    pub profile_id: String,
    pub source: ProfileResolutionSource,
    pub matched_rule_id: Option<String>,
}

pub fn resolve_profile_for_app_context(
    rules: &[AppProfileRule],
    context: &ForegroundAppContext,
    active_profile_id: &str,
) -> ResolvedProfile {
    let Some(context_app_id) = context
        .app_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_lowercase)
    else {
        return active_profile(active_profile_id);
    };
    let context_title = context.window_title.as_deref().map(str::to_lowercase);

    rules
        .iter()
        .filter(|rule| rule.enabled && rule.deleted_at.is_none())
        .filter(|rule| rule.app_id.trim().to_lowercase() == context_app_id)
        .filter(|rule| {
            match rule
                .window_title_pattern
                .as_deref()
                .map(str::trim)
                .filter(|pattern| !pattern.is_empty())
            {
                Some(pattern) => context_title
                    .as_deref()
                    .is_some_and(|title| title.contains(&pattern.to_lowercase())),
                None => true,
            }
        })
        .max_by_key(|rule| rule.priority)
        .map(|rule| ResolvedProfile {
            profile_id: rule.profile_id.clone(),
            source: ProfileResolutionSource::AppRule,
            matched_rule_id: Some(rule.id.clone()),
        })
        .unwrap_or_else(|| active_profile(active_profile_id))
}

fn active_profile(active_profile_id: &str) -> ResolvedProfile {
    ResolvedProfile {
        profile_id: active_profile_id.to_string(),
        source: ProfileResolutionSource::ActiveProfile,
        matched_rule_id: None,
    }
}

#[cfg(target_os = "windows")]
pub fn current_foreground_app_context() -> ForegroundAppContext {
    current_foreground_app_context_windows().unwrap_or_default()
}

#[cfg(not(target_os = "windows"))]
pub fn current_foreground_app_context() -> ForegroundAppContext {
    ForegroundAppContext::default()
}

#[cfg(target_os = "windows")]
fn current_foreground_app_context_windows() -> Option<ForegroundAppContext> {
    use std::path::Path;
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    unsafe {
        let window = GetForegroundWindow();
        if window.is_invalid() {
            return None;
        }

        let mut process_id = 0;
        GetWindowThreadProcessId(window, Some(&mut process_id));
        if process_id == 0 {
            return Some(ForegroundAppContext {
                app_id: None,
                window_title: read_window_title(window),
            });
        }

        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id).ok()?;
        let mut image_buffer = vec![0u16; 32768];
        let mut image_len = image_buffer.len() as u32;
        let image_result = QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(image_buffer.as_mut_ptr()),
            &mut image_len,
        );
        let _ = CloseHandle(process);

        let app_id = image_result.ok().and_then(|_| {
            let image_path = String::from_utf16_lossy(&image_buffer[..image_len as usize]);
            Path::new(&image_path)
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.to_lowercase())
        });

        Some(ForegroundAppContext {
            app_id,
            window_title: read_window_title(window),
        })
    }
}

#[cfg(target_os = "windows")]
unsafe fn read_window_title(window: windows::Win32::Foundation::HWND) -> Option<String> {
    use windows::Win32::UI::WindowsAndMessaging::GetWindowTextW;

    let mut title_buffer = vec![0u16; 512];
    let title_len = GetWindowTextW(window, &mut title_buffer);
    if title_len <= 0 {
        return None;
    }
    let title = String::from_utf16_lossy(&title_buffer[..title_len as usize]);
    let trimmed = title.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_to_highest_priority_matching_rule() {
        let rules = vec![
            AppProfileRule::new_for_test("rule_normal", "chrome.exe", None, "normal", 1, true),
            AppProfileRule::new_for_test(
                "rule_prompt",
                "chrome.exe",
                Some("ChatGPT"),
                "prompt",
                10,
                true,
            ),
        ];
        let context = ForegroundAppContext {
            app_id: Some("chrome.exe".to_string()),
            window_title: Some("ChatGPT - Chrome".to_string()),
        };

        let resolved = resolve_profile_for_app_context(&rules, &context, "email");

        assert_eq!(resolved.profile_id, "prompt");
        assert_eq!(resolved.source, ProfileResolutionSource::AppRule);
        assert_eq!(resolved.matched_rule_id.as_deref(), Some("rule_prompt"));
    }

    #[test]
    fn ignores_disabled_and_deleted_rules() {
        let rules = vec![
            AppProfileRule::new_for_test(
                "rule_disabled",
                "chrome.exe",
                Some("ChatGPT"),
                "prompt",
                20,
                false,
            ),
            AppProfileRule {
                deleted_at: Some("2026-06-30T00:00:00Z".to_string()),
                ..AppProfileRule::new_for_test(
                    "rule_deleted",
                    "chrome.exe",
                    Some("ChatGPT"),
                    "translate",
                    10,
                    true,
                )
            },
        ];
        let context = ForegroundAppContext {
            app_id: Some("chrome.exe".to_string()),
            window_title: Some("ChatGPT - Chrome".to_string()),
        };

        let resolved = resolve_profile_for_app_context(&rules, &context, "email");

        assert_eq!(resolved.profile_id, "email");
        assert_eq!(resolved.source, ProfileResolutionSource::ActiveProfile);
        assert_eq!(resolved.matched_rule_id, None);
    }

    #[test]
    fn app_only_rule_matches_without_title() {
        let rules = vec![AppProfileRule::new_for_test(
            "rule_chrome",
            "CHROME.EXE",
            None,
            "normal",
            1,
            true,
        )];
        let context = ForegroundAppContext {
            app_id: Some("chrome.exe".to_string()),
            window_title: None,
        };

        let resolved = resolve_profile_for_app_context(&rules, &context, "email");

        assert_eq!(resolved.profile_id, "normal");
        assert_eq!(resolved.source, ProfileResolutionSource::AppRule);
        assert_eq!(resolved.matched_rule_id.as_deref(), Some("rule_chrome"));
    }

    #[test]
    fn title_pattern_is_case_insensitive_substring() {
        let rules = vec![AppProfileRule::new_for_test(
            "rule_chatgpt",
            "chrome.exe",
            Some("chatgpt"),
            "prompt",
            1,
            true,
        )];
        let context = ForegroundAppContext {
            app_id: Some("chrome.exe".to_string()),
            window_title: Some("ChatGPT - Chrome".to_string()),
        };

        let resolved = resolve_profile_for_app_context(&rules, &context, "email");

        assert_eq!(resolved.profile_id, "prompt");
        assert_eq!(resolved.source, ProfileResolutionSource::AppRule);
    }

    #[test]
    fn falls_back_to_active_profile_when_context_is_missing_or_unmatched() {
        let rules = vec![AppProfileRule::new_for_test(
            "rule_chrome",
            "chrome.exe",
            None,
            "prompt",
            1,
            true,
        )];

        let missing = resolve_profile_for_app_context(
            &rules,
            &ForegroundAppContext {
                app_id: None,
                window_title: Some("ChatGPT - Chrome".to_string()),
            },
            "email",
        );
        let unmatched = resolve_profile_for_app_context(
            &rules,
            &ForegroundAppContext {
                app_id: Some("notepad.exe".to_string()),
                window_title: Some("Notes".to_string()),
            },
            "email",
        );

        assert_eq!(missing.profile_id, "email");
        assert_eq!(missing.source, ProfileResolutionSource::ActiveProfile);
        assert_eq!(unmatched.profile_id, "email");
        assert_eq!(unmatched.source, ProfileResolutionSource::ActiveProfile);
    }
}
