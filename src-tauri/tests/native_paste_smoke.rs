use app_lib::clipboard::copy_text_for_paste;

#[test]
#[ignore = "manual desktop smoke test; focuses the current foreground app"]
fn paste_into_foreground_app() {
    focus_target_window_if_requested();

    let text = std::env::var("GOSPEAK_NATIVE_PASTE_TEXT")
        .unwrap_or_else(|_| "Gospeak native paste smoke".to_string());

    let result = copy_text_for_paste(&text).expect("native paste should copy text");

    assert!(result.copied);
    assert!(result.paste_attempted, "native paste was not attempted");
}

#[cfg(target_os = "windows")]
fn focus_target_window_if_requested() {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
    use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;

    let Ok(raw_hwnd) = std::env::var("GOSPEAK_TARGET_HWND") else {
        return;
    };
    let Ok(hwnd) = raw_hwnd.parse::<isize>() else {
        return;
    };

    let hwnd = HWND(hwnd as *mut std::ffi::c_void);
    unsafe {
        let _ = SetForegroundWindow(hwnd);
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_ok() {
            let x = rect.left + ((rect.right - rect.left) / 2);
            let y = rect.top + ((rect.bottom - rect.top) / 2);
            let _ = windows::Win32::UI::WindowsAndMessaging::SetCursorPos(x, y);
            let inputs = [
                mouse_input(MOUSEEVENTF_LEFTDOWN),
                mouse_input(MOUSEEVENTF_LEFTUP),
            ];
            let _ = SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
    }
    std::thread::sleep(std::time::Duration::from_millis(300));
}

#[cfg(target_os = "windows")]
fn mouse_input(
    flags: windows::Win32::UI::Input::KeyboardAndMouse::MOUSE_EVENT_FLAGS,
) -> windows::Win32::UI::Input::KeyboardAndMouse::INPUT {
    use windows::Win32::UI::Input::KeyboardAndMouse::{INPUT, INPUT_0, INPUT_MOUSE, MOUSEINPUT};

    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

#[cfg(not(target_os = "windows"))]
fn focus_target_window_if_requested() {}
