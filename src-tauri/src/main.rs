// Hide the console window on Windows release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, WebviewWindow,
};
#[cfg(target_os = "macos")]
use tauri::{WebviewUrl, WebviewWindowBuilder};
#[cfg(target_os = "macos")]
use tauri::RunEvent;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[derive(serde::Serialize)]
struct DesktopState {
    windows: Vec<desktop::Win>, // other app windows, in the town's coordinates, front to back
    ground: f64,                // where the Dock / taskbar starts: the town's street level
    space: usize,               // which desktop (Space) you're on, counting from 0
    spaces: usize,              // how many desktops there are
    fullscreen: bool,           // a full-screen app's space: no town there
}

#[tauri::command]
fn desktop_state(window: WebviewWindow) -> DesktopState {
    let scale = window.scale_factor().unwrap_or(1.0);
    let pos = window.outer_position().unwrap_or_default();
    // macOS reports window bounds in points; Windows in physical pixels.
    let windows = if cfg!(target_os = "macos") {
        desktop::windows(pos.x as f64 / scale, pos.y as f64 / scale, scale)
    } else {
        desktop::windows(pos.x as f64, pos.y as f64, scale)
    };
    let ground = window
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| { let a = m.work_area(); (a.position.y as f64 + a.size.height as f64 - pos.y as f64) / scale })
        .unwrap_or(0.0);
    let (space, spaces, fullscreen) = desktop::spaces();
    DesktopState { windows, ground, space, spaces, fullscreen }
}

/// Where the mouse pointer is, in this window's coordinates (the town lets clicks through, so it never
/// sees the mouse itself). For showing a building's inside while you point at it.
#[tauri::command]
fn cursor(window: WebviewWindow) -> Option<(f64, f64)> {
    let scale = window.scale_factor().unwrap_or(1.0);
    let pos = window.outer_position().ok()?;
    let c = window.cursor_position().ok()?;
    Some(((c.x - pos.x as f64) / scale, (c.y - pos.y as f64) / scale))
}

/// While a panel's open: let clicks through to the apps underneath (the pointer's not on a panel or
/// on someone in town) or take them, without moving the window up or down a layer.
#[tauri::command]
fn set_passthrough(window: WebviewWindow, on: bool) { let _ = window.set_ignore_cursor_events(on); }

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

/// Shows or hides the settings panel (the page decides which), on the desktop you're looking at.
fn toggle_settings(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let active = desktop::active_space();
        if active != MAIN_SPACE.load(std::sync::atomic::Ordering::Relaxed) {
            if let Some(win) = app.get_webview_window(&desk_label(active)) {
                let _ = win.eval("window.toggleSettings?.()");
                return;
            }
        }
    }
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.eval("window.toggleSettings?.()");
    }
}

/// Cover the screen from under the menu bar right down to the bottom edge, so the street can run
/// underneath the Dock / taskbar.
fn cover_screen(win: &WebviewWindow) -> tauri::Result<()> {
    if let Some(m) = win.primary_monitor()? {
        let area = m.work_area();
        let bottom = m.position().y + m.size().height as i32;
        win.set_size(tauri::PhysicalSize::new(area.size.width, (bottom - area.position.y) as u32))?;
        win.set_position(area.position)?;
    }
    Ok(())
}

// ---------- macOS: a live window on every desktop ----------
// Every ordinary desktop gets its own town window, pinned to that desktop, so macOS slides the
// right part of town in and out with its own animation and nothing has to catch up after a switch.
// The 'main' window runs the town; the others draw their stretch of it (see src/sync.js).

#[cfg(target_os = "macos")]
static MAIN_SPACE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
#[cfg(target_os = "macos")]
fn desk_label(space_id: u64) -> String { format!("desk-{space_id}") }

/// The desktop (Space) id a town window belongs to.
#[cfg(target_os = "macos")]
fn space_of(label: &str) -> Option<u64> {
    if label == "main" { Some(MAIN_SPACE.load(std::sync::atomic::Ordering::Relaxed)) } else { label.strip_prefix("desk-")?.parse().ok() }
}

/// A line in the app's log from one of the town windows (when started from a terminal).
#[tauri::command]
fn note(window: WebviewWindow, msg: String) { eprintln!("DeskCity [{}]: {msg}", window.label()); }

/// Which stretch of the street this window shows: its desktop's place among your desktops.
#[tauri::command]
fn my_desk(window: WebviewWindow) -> Option<usize> {
    #[cfg(target_os = "macos")]
    {
        let id = space_of(window.label())?;
        return desktop::layout().0.iter().position(|&s| s == id);
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = window; Some(0) }
}

/// The desktop layer, no open animation, left alone by Mission Control, clicks passing through,
/// and kept drawing while covered (WebKit would otherwise pause a window it thinks is hidden).
#[cfg(target_os = "macos")]
fn town_window(win: &WebviewWindow) {
    let _ = cover_screen(win);
    let _ = win.set_ignore_cursor_events(true);
    let _ = win.with_webview(|wv| unsafe {
        use objc2::{msg_send, runtime::AnyObject, sel};
        let view = wv.inner() as *mut AnyObject;
        let able: bool = msg_send![view, respondsToSelector: sel!(_setWindowOcclusionDetectionEnabled:)];
        if able {
            let _: () = msg_send![view, _setWindowOcclusionDetectionEnabled: false];
        }
    });
}

/// Puts a window on one desktop only (and shows it), then checks it landed there.
#[cfg(target_os = "macos")]
fn pin(win: &WebviewWindow, space: u64) {
    let w = win.clone();
    let _ = win.run_on_main_thread(move || {
        use objc2_app_kit::{NSWindow, NSWindowAnimationBehavior, NSWindowCollectionBehavior as B};
        let Ok(ptr) = w.ns_window() else { return };
        let ns: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
        ns.setAnimationBehavior(NSWindowAnimationBehavior::None);
        ns.setLevel(-1);
        ns.setCollectionBehavior(B::Stationary | B::IgnoresCycle);
        ns.orderFrontRegardless();
        let wid = ns.windowNumber();
        desktop::move_window_to_space(wid, space);
        let now = desktop::window_spaces(wid);
        if now != vec![space as i64] {
            eprintln!("DeskCity: window {} is on spaces {:?}, wanted {}", w.label(), now, space);
        }
    });
}

/// One town window per desktop: make any that are missing, close any whose desktop is gone.
#[cfg(target_os = "macos")]
fn sync_desk_windows(app: &AppHandle) {
    let (ids, _, _) = desktop::layout();
    if ids.is_empty() {
        return;
    }
    let main_space = MAIN_SPACE.load(std::sync::atomic::Ordering::Relaxed);
    if !ids.contains(&main_space) { // the leader's desktop was removed: it moves to the first one
        if let Some(main) = app.get_webview_window("main") {
            let first = ids[0];
            MAIN_SPACE.store(first, std::sync::atomic::Ordering::Relaxed);
            if let Some(old) = app.get_webview_window(&desk_label(first)) { let _ = old.close(); }
            pin(&main, first);
        }
    }
    let main_space = MAIN_SPACE.load(std::sync::atomic::Ordering::Relaxed);
    for &id in &ids {
        if id == main_space || app.get_webview_window(&desk_label(id)).is_some() {
            continue;
        }
        let Ok(win) = WebviewWindowBuilder::new(app, desk_label(id), WebviewUrl::App("index.html".into()))
            .title("DeskCity")
            .transparent(true)
            .decorations(false)
            .shadow(false)
            .resizable(false)
            .skip_taskbar(true)
            .focused(false)
            .visible(false)
            .build()
        else {
            continue;
        };
        town_window(&win);
        pin(&win, id);
    }
    for (label, win) in app.webview_windows() {
        if let Some(id) = label.strip_prefix("desk-").and_then(|s| s.parse::<u64>().ok()) {
            if !ids.contains(&id) || id == main_space { let _ = win.close(); }
        }
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
        .invoke_handler(tauri::generate_handler![desktop_state, set_interactive, my_desk, note, cursor, set_passthrough])
        .setup(move |app| {
            let win = app.get_webview_window("main").unwrap();

            // The whole screen, on the desktop layer: under every app window, above the wallpaper.
            cover_screen(&win)?;

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

            // macOS: keep the town awake when its windows are covered (App Nap would slow it down),
            // and pin the main window to the desktop you started on.
            #[cfg(target_os = "macos")]
            {
                use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};
                let token = NSProcessInfo::processInfo().beginActivityWithOptions_reason(
                    NSActivityOptions::UserInitiatedAllowingIdleSystemSleep | NSActivityOptions::LatencyCritical,
                    &NSString::from_str("Animating the town on the desktop"),
                );
                std::mem::forget(token); // held for the life of the app
                let (ids, index, _) = desktop::layout();
                let here = index.and_then(|i| ids.get(i).copied()).or(ids.first().copied()).unwrap_or(0);
                MAIN_SPACE.store(here, std::sync::atomic::Ordering::Relaxed);
                town_window(&win);
                pin(&win, here);
            }

            win.show()?;

            // Watch for desktop (Space) switches: tell the town which desktop you're looking at (your
            // windows are on it), and keep one town window per desktop as desktops come and go.
            let w = win.clone();
            #[cfg(target_os = "macos")]
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let (mut last_id, mut last_ids) = (u64::MAX, vec![]);
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(20));
                    let id = desktop::active_space();
                    #[cfg(target_os = "macos")]
                    {
                        let ids = desktop::layout().0;
                        if ids != last_ids { last_ids = ids; sync_desk_windows(&handle); }
                    }
                    if id == last_id {
                        continue;
                    }
                    last_id = id;
                    let (space, spaces, full) = desktop::spaces();
                    let _ = w.eval(&format!("window.onSpace?.({space},{spaces},{full})"));
                }
            });
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
