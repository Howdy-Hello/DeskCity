// Hide the console window on Windows release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, WebviewWindow,
};
#[cfg(target_os = "macos")]
use tauri::RunEvent;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Other app windows, in the town's coordinates, front to back.
#[tauri::command]
fn desktop_windows(window: WebviewWindow) -> Vec<desktop::Win> {
    let scale = window.scale_factor().unwrap_or(1.0);
    let pos = window.outer_position().unwrap_or_default();
    // macOS reports window bounds in points; Windows in physical pixels.
    if cfg!(target_os = "macos") {
        desktop::windows(pos.x as f64 / scale, pos.y as f64 / scale, scale)
    } else {
        desktop::windows(pos.x as f64, pos.y as f64, scale)
    }
}

/// While the settings panel is open, the town comes up above your windows and takes clicks and keys.
/// Closed, it goes back to the desktop layer and lets everything through.
#[tauri::command]
fn set_interactive(window: WebviewWindow, on: bool) {
    let _ = window.set_ignore_cursor_events(!on);
    #[cfg(target_os = "macos")]
    {
        let w = window.clone();
        let _ = window.run_on_main_thread(move || {
            use objc2_app_kit::{NSApplication, NSWindow};
            let Ok(ptr) = w.ns_window() else { return };
            let ns: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
            ns.setLevel(if on { 3 } else { -1 }); // 3 = floating above apps, -1 = desktop layer
            if !on {
                // Hand the keyboard back to whatever you were using.
                if let Some(mtm) = objc2::MainThreadMarker::new() {
                    NSApplication::sharedApplication(mtm).deactivate();
                }
            }
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window.set_always_on_bottom(!on);
        let _ = window.set_always_on_top(on);
    }
    if on {
        let _ = window.set_focus();
    }
}

/// Shows or hides the settings panel (the page decides which).
fn toggle_settings(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.eval("window.toggleSettings?.()");
    }
}

fn main() {
    // Control+Option+D on a Mac, Ctrl+Alt+D on Windows.
    let settings_key = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyD);

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &settings_key && event.state() == ShortcutState::Pressed {
                        toggle_settings(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![desktop_windows, set_interactive])
        .setup(move |app| {
            let win = app.get_webview_window("main").unwrap();

            // Cover the usable screen area (between the menu bar and the Dock / taskbar).
            // The window sits on the desktop layer: under every app window, above the wallpaper.
            if let Some(m) = win.primary_monitor()? {
                let area = m.work_area();
                win.set_size(area.size)?;
                win.set_position(area.position)?;
            }

            // Clicks go straight through to the desktop.
            win.set_ignore_cursor_events(true)?;

            if let Err(e) = app.global_shortcut().register(settings_key) {
                eprintln!("settings shortcut unavailable: {e}"); // another app already uses it
            }

            let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit DeskCity", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("DeskCity")
                .menu(&menu)
                .on_menu_event(|app, e| match e.id().as_ref() {
                    "settings" => toggle_settings(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // macOS: the desktop layer, just under ordinary app windows, on every Space, left alone by
            // Mission Control, with no open animation. (Tauri's alwaysOnBottom doesn't stick on macOS;
            // on Windows it does, via tauri.conf.json.)
            #[cfg(target_os = "macos")]
            {
                use objc2_app_kit::{NSWindow, NSWindowAnimationBehavior, NSWindowCollectionBehavior as B};
                let ns: &NSWindow = unsafe { &*(win.ns_window()? as *const NSWindow) };
                ns.setAnimationBehavior(NSWindowAnimationBehavior::None);
                ns.setLevel(-1);
                ns.setCollectionBehavior(B::CanJoinAllSpaces | B::Stationary | B::IgnoresCycle);
            }

            win.show()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building DeskCity")
        .run(|app, event| {
            // Clicking DeskCity's Dock icon opens the settings too.
            #[cfg(target_os = "macos")]
            if let RunEvent::Reopen { .. } = event {
                toggle_settings(app);
            }
            let _ = (app, event);
        });
}
