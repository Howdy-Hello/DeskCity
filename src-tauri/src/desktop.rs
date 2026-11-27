//! Lists the other app windows on screen (position and size only), front to back,
//! so the town can react to them. No screen recording permission is needed.

#[derive(serde::Serialize)]
pub struct Win {
    pub id: u64,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// `ox, oy`: the town window's top-left corner and `scale` its pixel ratio,
/// so results come back in the town's own coordinates.
#[cfg(target_os = "macos")]
pub fn windows(ox: f64, oy: f64, _scale: f64) -> Vec<Win> {
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;
    use core_graphics::window::{
        copy_window_info, kCGNullWindowID, kCGWindowListExcludeDesktopElements,
        kCGWindowListOptionOnScreenOnly,
    };

    type Dict = CFDictionary<CFString, CFType>;
    fn num(d: &Dict, key: &'static str) -> Option<f64> {
        d.find(CFString::from_static_string(key))?.downcast::<CFNumber>()?.to_f64()
    }

    let me = std::process::id() as f64;
    let Some(list) = copy_window_info(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
        kCGNullWindowID,
    ) else {
        return vec![];
    };

    list.iter()
        .filter_map(|item| {
            let d: Dict = unsafe { CFDictionary::wrap_under_get_rule(*item as CFDictionaryRef) };
            // Layer 0 = ordinary app windows (skips the menu bar, Dock, popups).
            if num(&d, "kCGWindowLayer")? != 0.0 || num(&d, "kCGWindowOwnerPID")? == me {
                return None;
            }
            if num(&d, "kCGWindowAlpha").unwrap_or(1.0) == 0.0 {
                return None;
            }
            let b = d.find(CFString::from_static_string("kCGWindowBounds"))?;
            let b: Dict = unsafe { CFDictionary::wrap_under_get_rule(b.as_CFTypeRef() as CFDictionaryRef) };
            Some(Win {
                id: num(&d, "kCGWindowNumber")? as u64,
                x: num(&b, "X")? - ox,
                y: num(&b, "Y")? - oy,
                w: num(&b, "Width")?,
                h: num(&b, "Height")?,
            })
        })
        .filter(|w| w.w > 40.0 && w.h > 40.0)
        .collect()
}

#[cfg(windows)]
pub fn windows(ox: f64, oy: f64, scale: f64) -> Vec<Win> {
    use windows_sys::core::BOOL;
    use windows_sys::Win32::Foundation::{HWND, LPARAM, RECT};
    use windows_sys::Win32::Graphics::Dwm::{
        DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS,
    };
    use windows_sys::Win32::System::Threading::GetCurrentProcessId;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetClassNameW, GetWindowLongW, GetWindowRect, GetWindowThreadProcessId,
        IsIconic, IsWindowVisible, GWL_EXSTYLE, WS_EX_TOOLWINDOW,
    };

    unsafe extern "system" fn each(hwnd: HWND, data: LPARAM) -> BOOL {
        let out = &mut *(data as *mut Vec<(u64, RECT)>);
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        let mut cloaked = 0u32;
        DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED as _, &mut cloaked as *mut u32 as *mut _, 4);
        let tool = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOOLWINDOW != 0;
        if IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 || cloaked != 0 || tool || pid == GetCurrentProcessId() {
            return 1;
        }
        // Skip the desktop and taskbar themselves.
        let mut class = [0u16; 32];
        let n = GetClassNameW(hwnd, class.as_mut_ptr(), 32) as usize;
        let class = String::from_utf16_lossy(&class[..n]);
        if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
            return 1;
        }
        let mut r: RECT = std::mem::zeroed();
        let size = std::mem::size_of::<RECT>() as u32;
        if DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS as _, &mut r as *mut RECT as *mut _, size) != 0 {
            GetWindowRect(hwnd, &mut r);
        }
        out.push((hwnd as u64, r));
        1
    }

    let mut found: Vec<(u64, RECT)> = Vec::new();
    unsafe { EnumWindows(Some(each), &mut found as *mut _ as LPARAM) };
    found
        .into_iter()
        .map(|(id, r)| Win {
            id,
            x: (r.left as f64 - ox) / scale,
            y: (r.top as f64 - oy) / scale,
            w: (r.right - r.left) as f64 / scale,
            h: (r.bottom - r.top) as f64 / scale,
        })
        .filter(|w| w.w > 40.0 && w.h > 40.0)
        .collect()
}

#[cfg(not(any(target_os = "macos", windows)))]
pub fn windows(_: f64, _: f64, _: f64) -> Vec<Win> {
    vec![]
}

/// Which desktop (Space) is showing: (index among ordinary desktops, how many there are,
/// whether it's a full-screen app's space). Uses the same private CoreGraphics calls as
/// window managers like yabai; if anything is off it falls back to a single desktop.
#[cfg(target_os = "macos")]
pub fn spaces() -> (usize, usize, bool) {
    let (ids, index, full) = layout();
    (index.unwrap_or(0), ids.len().max(1), full)
}

/// The ordinary desktops on the display that's showing, in Mission Control order, which of them is
/// showing (None on a full-screen app's space), and whether a full-screen app's space is showing.
#[cfg(target_os = "macos")]
pub fn layout() -> (Vec<u64>, Option<usize>, bool) {
    use core_foundation::array::{CFArray, CFArrayRef};
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGSMainConnectionID() -> i32;
        fn CGSGetActiveSpace(cid: i32) -> u64;
        fn CGSCopyManagedDisplaySpaces(cid: i32) -> CFArrayRef;
    }
    type Dict = CFDictionary<CFString, CFType>;
    let num = |d: &Dict, k: &'static str| d.find(CFString::from_static_string(k)).and_then(|v| v.downcast::<CFNumber>()).and_then(|n| n.to_i64());
    unsafe {
        let cid = CGSMainConnectionID();
        let active = CGSGetActiveSpace(cid) as i64;
        let raw = CGSCopyManagedDisplaySpaces(cid);
        if raw.is_null() {
            return (vec![], None, false);
        }
        let displays: CFArray<CFType> = CFArray::wrap_under_create_rule(raw);
        for d in displays.iter() {
            let d: Dict = CFDictionary::wrap_under_get_rule(d.as_CFTypeRef() as CFDictionaryRef);
            let Some(list) = d.find(CFString::from_static_string("Spaces")) else { continue };
            let list: CFArray<CFType> = CFArray::wrap_under_get_rule(list.as_CFTypeRef() as CFArrayRef);
            let (mut ids, mut index, mut full, mut found) = (vec![], None, false, false);
            for s in list.iter() {
                let s: Dict = CFDictionary::wrap_under_get_rule(s.as_CFTypeRef() as CFDictionaryRef);
                let id = num(&s, "ManagedSpaceID").unwrap_or(-1);
                let kind = num(&s, "type").unwrap_or(0); // 0 = ordinary desktop, 4 = full-screen app
                if id == active { found = true; if kind == 0 { index = Some(ids.len()) } else { full = true } }
                if kind == 0 { ids.push(id as u64) }
            }
            if found {
                return (ids, index, full);
            }
        }
        (vec![], None, false)
    }
}

/// Moves one of our own windows onto one desktop (and off every other).
#[cfg(target_os = "macos")]
pub fn move_window_to_space(window_number: isize, space: u64) {
    use core_foundation::array::{CFArray, CFArrayRef};
    use core_foundation::base::TCFType;
    use core_foundation::number::CFNumber;
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGSMainConnectionID() -> i32;
        fn CGSAddWindowsToSpaces(cid: i32, windows: CFArrayRef, spaces: CFArrayRef);
        fn CGSRemoveWindowsFromSpaces(cid: i32, windows: CFArrayRef, spaces: CFArrayRef);
    }
    let others: Vec<CFNumber> = window_spaces(window_number).into_iter().filter(|&s| s != space as i64).map(CFNumber::from).collect();
    unsafe {
        let cid = CGSMainConnectionID();
        let wins = CFArray::from_CFTypes(&[CFNumber::from(window_number as i64)]);
        CGSAddWindowsToSpaces(cid, wins.as_concrete_TypeRef(), CFArray::from_CFTypes(&[CFNumber::from(space as i64)]).as_concrete_TypeRef());
        if !others.is_empty() {
            CGSRemoveWindowsFromSpaces(cid, wins.as_concrete_TypeRef(), CFArray::from_CFTypes(&others).as_concrete_TypeRef());
        }
    }
}

/// Which desktops one of our windows is on.
#[cfg(target_os = "macos")]
pub fn window_spaces(window_number: isize) -> Vec<i64> {
    use core_foundation::array::{CFArray, CFArrayRef};
    use core_foundation::base::TCFType;
    use core_foundation::number::CFNumber;
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGSMainConnectionID() -> i32;
        fn CGSCopySpacesForWindows(cid: i32, mask: i32, windows: CFArrayRef) -> CFArrayRef;
    }
    unsafe {
        let list = CFArray::from_CFTypes(&[CFNumber::from(window_number as i64)]);
        let raw = CGSCopySpacesForWindows(CGSMainConnectionID(), 7, list.as_concrete_TypeRef());
        if raw.is_null() { return vec![]; }
        let out: CFArray<CFNumber> = CFArray::wrap_under_create_rule(raw);
        out.iter().filter_map(|n| n.to_i64()).collect()
    }
}

/// The id of the Space showing right now: a very cheap call, used to notice a switch instantly.
#[cfg(target_os = "macos")]
pub fn active_space() -> u64 {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGSMainConnectionID() -> i32;
        fn CGSGetActiveSpace(cid: i32) -> u64;
    }
    unsafe { CGSGetActiveSpace(CGSMainConnectionID()) }
}

#[cfg(not(target_os = "macos"))]
pub fn active_space() -> u64 {
    0
}

#[cfg(not(target_os = "macos"))]
pub fn spaces() -> (usize, usize, bool) {
    (0, 1, false) // Windows virtual desktops: not yet; one neighbourhood
}

#[cfg(test)]
mod tests {
    #[test]
    fn lists_other_windows() {
        let wins = super::windows(0.0, 0.0, 1.0);
        for w in &wins {
            assert!(w.w > 40.0 && w.h > 40.0);
        }
        println!("{} windows: {:?}", wins.len(), wins.iter().map(|w| (w.x, w.y, w.w, w.h)).collect::<Vec<_>>());
    }
}

#[cfg(test)]
mod space_tests {
    #[test]
    fn reads_current_space() {
        let (index, count, full) = super::spaces();
        assert!(index < count);
        println!("desktop {} of {}, fullscreen: {}", index + 1, count, full);
    }
}


