#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct ClipboardResult {
    pub copied: bool,
    pub paste_attempted: bool,
    pub message: String,
}

pub fn copy_text_for_paste(text: &str) -> Result<ClipboardResult, String> {
    copy_text_for_paste_with_injector(text, inject_native_paste)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_clipboard_text() {
        assert!(copy_text_for_paste("   ").is_err());
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
}
