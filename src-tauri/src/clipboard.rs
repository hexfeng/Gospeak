#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct ClipboardResult {
    pub copied: bool,
    pub paste_attempted: bool,
    pub message: String,
}

pub fn copy_text_for_paste(text: &str) -> Result<ClipboardResult, String> {
    copy_text_for_paste_with_injector(text, inject_native_paste)
}

pub fn read_selected_text_for_edit() -> Result<String, String> {
    let mut clipboard = SystemClipboard::new()?;
    read_selected_text_for_edit_with_clipboard(&mut clipboard, inject_native_copy)
}

fn validate_type_text_chunk(text: &str) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("Cannot type empty text chunk".to_string());
    }
    Ok(())
}

pub fn type_text_chunk(text: &str) -> Result<(), String> {
    validate_type_text_chunk(text)?;
    inject_unicode_text(text)
}

trait ClipboardAccess {
    fn get_text(&mut self) -> Result<Option<String>, String>;
    fn set_text(&mut self, text: &str) -> Result<(), String>;
    fn copy_selection(&mut self);
}

struct SystemClipboard {
    inner: arboard::Clipboard,
}

impl SystemClipboard {
    fn new() -> Result<Self, String> {
        Ok(Self {
            inner: arboard::Clipboard::new()
                .map_err(|error| format!("Cannot open clipboard: {error}"))?,
        })
    }
}

impl ClipboardAccess for SystemClipboard {
    fn get_text(&mut self) -> Result<Option<String>, String> {
        match self.inner.get_text() {
            Ok(text) => Ok(Some(text)),
            Err(_) => Ok(None),
        }
    }

    fn set_text(&mut self, text: &str) -> Result<(), String> {
        self.inner
            .set_text(text.to_string())
            .map_err(|error| format!("Cannot restore clipboard: {error}"))
    }

    fn copy_selection(&mut self) {}
}

fn read_selected_text_for_edit_with_clipboard<C, F>(
    clipboard: &mut C,
    inject_copy: F,
) -> Result<String, String>
where
    C: ClipboardAccess,
    F: FnOnce() -> Result<(), String>,
{
    let original = clipboard.get_text()?;
    clipboard.copy_selection();
    inject_copy()?;
    std::thread::sleep(std::time::Duration::from_millis(120));
    let selected = clipboard
        .get_text()?
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
        .ok_or_else(|| "No selected text was copied from the active app.".to_string());
    if let Some(original) = original {
        clipboard.set_text(&original)?;
    }
    selected
}

fn copy_text_for_paste_with_injector<F>(
    text: &str,
    inject_paste: F,
) -> Result<ClipboardResult, String>
where
    F: FnOnce() -> Result<(), String>,
{
    if text.trim().is_empty() {
        return Err("Cannot copy empty text".to_string());
    }

    let mut clipboard =
        arboard::Clipboard::new().map_err(|error| format!("Cannot open clipboard: {error}"))?;
    clipboard
        .set_text(text.to_string())
        .map_err(|error| format!("Cannot write clipboard: {error}"))?;

    if let Err(error) = inject_paste() {
        return Ok(ClipboardResult {
            copied: true,
            paste_attempted: false,
            message: format!("Text copied to clipboard. Native paste failed: {error}"),
        });
    }

    Ok(ClipboardResult {
        copied: true,
        paste_attempted: true,
        message: "Text copied to clipboard and pasted into the active app.".to_string(),
    })
}

#[cfg(target_os = "windows")]
fn inject_native_copy() -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VK_C, VK_CONTROL,
    };

    let inputs = [
        keyboard_input(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
        keyboard_input(VK_C, KEYBD_EVENT_FLAGS(0)),
        keyboard_input(VK_C, KEYEVENTF_KEYUP),
        keyboard_input(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent as usize == inputs.len() {
        Ok(())
    } else {
        Err(format!("SendInput sent {sent} of {} events", inputs.len()))
    }
}

#[cfg(not(target_os = "windows"))]
fn inject_native_copy() -> Result<(), String> {
    Err("Native copy is only implemented on Windows".to_string())
}

#[cfg(target_os = "windows")]
fn inject_native_paste() -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VK_CONTROL, VK_V,
    };

    let inputs = [
        keyboard_input(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
        keyboard_input(VK_V, KEYBD_EVENT_FLAGS(0)),
        keyboard_input(VK_V, KEYEVENTF_KEYUP),
        keyboard_input(VK_CONTROL, KEYEVENTF_KEYUP),
    ];

    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent as usize == inputs.len() {
        Ok(())
    } else {
        Err(format!("SendInput sent {sent} of {} events", inputs.len()))
    }
}

#[cfg(target_os = "windows")]
fn keyboard_input(
    key: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY,
    flags: windows::Win32::UI::Input::KeyboardAndMouse::KEYBD_EVENT_FLAGS,
) -> windows::Win32::UI::Input::KeyboardAndMouse::INPUT {
    use windows::Win32::UI::Input::KeyboardAndMouse::{INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT};

    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

#[cfg(not(target_os = "windows"))]
fn inject_native_paste() -> Result<(), String> {
    Err("Native paste is only implemented on Windows".to_string())
}

#[cfg(target_os = "windows")]
fn inject_unicode_text(text: &str) -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
    };

    let inputs = text
        .encode_utf16()
        .flat_map(|unit| {
            [
                unicode_keyboard_input(unit, KEYEVENTF_UNICODE),
                unicode_keyboard_input(unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP),
            ]
        })
        .collect::<Vec<_>>();

    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent as usize == inputs.len() {
        Ok(())
    } else {
        Err(format!("SendInput sent {sent} of {} events", inputs.len()))
    }
}

#[cfg(target_os = "windows")]
fn unicode_keyboard_input(
    scan: u16,
    flags: windows::Win32::UI::Input::KeyboardAndMouse::KEYBD_EVENT_FLAGS,
) -> windows::Win32::UI::Input::KeyboardAndMouse::INPUT {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, VIRTUAL_KEY,
    };

    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(0),
                wScan: scan,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

#[cfg(not(target_os = "windows"))]
fn inject_unicode_text(_text: &str) -> Result<(), String> {
    Err("Streaming insertion is only implemented on Windows".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_clipboard_text() {
        assert!(copy_text_for_paste("   ").is_err());
    }

    #[test]
    fn rejects_empty_streaming_type_chunk() {
        assert!(super::validate_type_text_chunk("  ").is_err());
    }

    #[test]
    fn reports_native_paste_when_injection_succeeds() {
        let result = copy_text_for_paste_with_injector("hello", || Ok(())).unwrap();

        assert!(result.copied);
        assert!(result.paste_attempted);
        assert_eq!(
            result.message,
            "Text copied to clipboard and pasted into the active app."
        );
    }

    #[test]
    fn reads_selected_text_by_copying_and_restores_original_clipboard() {
        let mut clipboard = MemoryClipboard {
            current: Some("original clipboard".to_string()),
            selected: "selected text".to_string(),
            writes: Vec::new(),
        };

        let selected =
            read_selected_text_for_edit_with_clipboard(&mut clipboard, || Ok(())).unwrap();

        assert_eq!(selected, "selected text");
        assert_eq!(clipboard.current.as_deref(), Some("original clipboard"));
        assert_eq!(clipboard.writes, vec!["original clipboard"]);
    }

    struct MemoryClipboard {
        current: Option<String>,
        selected: String,
        writes: Vec<String>,
    }

    impl ClipboardAccess for MemoryClipboard {
        fn get_text(&mut self) -> Result<Option<String>, String> {
            Ok(self.current.clone())
        }

        fn set_text(&mut self, text: &str) -> Result<(), String> {
            self.writes.push(text.to_string());
            self.current = Some(text.to_string());
            Ok(())
        }

        fn copy_selection(&mut self) {
            self.current = Some(self.selected.clone());
        }
    }
}
