use serde::Serialize;
use std::{
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{
    AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder,
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder},
};

struct HarnessProcess {
    child: Mutex<Option<Child>>,
    status: Mutex<String>,
    url: Mutex<Option<String>>,
    status_menu: Mutex<Option<MenuItem<tauri::Wry>>>,
    port_menu: Mutex<Option<MenuItem<tauri::Wry>>>,
    update_menu: Mutex<Option<MenuItem<tauri::Wry>>>,
    ui_update_menu: Mutex<Option<MenuItem<tauri::Wry>>>,
    tray: Mutex<Option<TrayIcon<tauri::Wry>>>,
    quitting: AtomicBool,
    activity_path: PathBuf,
    root: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HarnessStatus {
    status: String,
    url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateStatus {
    current: String,
    latest: String,
    update_available: bool,
}

fn project_root() -> PathBuf {
    std::env::var_os("MY_HARNESS_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .and_then(|path| path.parent())
                .expect("src-tauri 必须位于 my-harness/desktop 下")
                .to_path_buf()
        })
}

fn free_port() -> Result<u16, String> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).map_err(|error| error.to_string())?;
    listener.local_addr().map(|address| address.port()).map_err(|error| error.to_string())
}

fn set_harness_status(state: &HarnessProcess, status: &str) {
    if let Ok(mut current) = state.status.lock() {
        *current = status.into();
    }
    let label = match status {
        "starting" => "启动中",
        "ready" => "运行中",
        "failed" => "启动失败",
        value if value.starts_with("exited") => "已退出",
        _ => "已停止",
    };
    if let Ok(menu) = state.status_menu.lock() {
        if let Some(menu) = menu.as_ref() {
            let _ = menu.set_text(format!("状态：{label}"));
        }
    }
    if let Ok(tray) = state.tray.lock() {
        if let Some(tray) = tray.as_ref() {
            let _ = tray.set_icon_with_as_template(
                Some(Image::new_owned(h_icon_rgba(status == "ready", false, None), 48, 48)),
                false,
            );
        }
    }
}

fn start_harness(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<HarnessProcess>();
    let core = state.root.join("core");
    if !core.join("package.json").is_file() {
        return Err(format!("缺少 Harness submodule：{}", core.display()));
    }
    let port = free_port()?;
    let url = format!("http://127.0.0.1:{port}");
    let child = Command::new("node")
        .args([
            "--import",
            "tsx/esm",
            "apps/cli/src/bin.ts",
            "web",
            "--port",
            &port.to_string(),
        ])
        .current_dir(&core)
        .env("MDSH_STATUS_FILE", &state.activity_path)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| format!("无法启动 DeepSeek Harness：{error}"))?;
    *state.child.lock().map_err(|_| "子进程锁已损坏")? = Some(child);
    *state.url.lock().map_err(|_| "URL 锁已损坏")? = Some(url.clone());
    set_harness_status(&state, "starting");
    if let Ok(menu) = state.port_menu.lock() {
        if let Some(menu) = menu.as_ref() {
            let _ = menu.set_text(format!("端口：{port}"));
        }
    }

    let handle = app.clone();
    thread::spawn(move || {
        let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
        let deadline = Instant::now() + Duration::from_secs(90);
        let ready = loop {
            if TcpStream::connect_timeout(&address, Duration::from_millis(300)).is_ok() {
                break true;
            }
            if Instant::now() >= deadline {
                break false;
            }
            thread::sleep(Duration::from_millis(250));
        };
        let state = handle.state::<HarnessProcess>();
        set_harness_status(&state, if ready { "ready" } else { "failed" });
    });
    Ok(())
}

#[tauri::command]
fn harness_status(state: State<'_, HarnessProcess>) -> Result<HarnessStatus, String> {
    let mut status = state.status.lock().map_err(|_| "状态锁已损坏")?;
    if let Some(child) = state.child.lock().map_err(|_| "子进程锁已损坏")?.as_mut() {
        if let Some(exit) = child.try_wait().map_err(|error| error.to_string())? {
            *status = format!("exited ({exit})");
            if let Ok(menu) = state.status_menu.lock() {
                if let Some(menu) = menu.as_ref() {
                    let _ = menu.set_text("状态：已退出");
                }
            }
        }
    }
    Ok(HarnessStatus {
        status: status.clone(),
        url: state.url.lock().map_err(|_| "URL 锁已损坏")?.clone(),
    })
}

#[cfg(target_os = "macos")]
fn set_app_icon() -> Result<(), String> {
    use objc2::{AnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    let marker = MainThreadMarker::new().ok_or("设置应用图标必须在主线程执行")?;
    let data = NSData::with_bytes(include_bytes!("../icons/icon.png"));
    let image = NSImage::initWithData(NSImage::alloc(), &data).ok_or("无法读取应用图标")?;
    unsafe {
        NSApplication::sharedApplication(marker).setApplicationIconImage(Some(&image));
    }
    Ok(())
}

fn show_harness(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<HarnessProcess>();
    let status = state.status.lock().map_err(|_| "状态锁已损坏")?.clone();
    if status != "ready" {
        return Err(format!("Harness 尚未就绪：{status}"));
    }
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Regular)
        .map_err(|error| error.to_string())?;

    if let Some(window) = app.get_webview_window("harness") {
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    let url = state
        .url
        .lock()
        .map_err(|_| "URL 锁已损坏")?
        .clone()
        .ok_or("Harness URL 不存在")?;
        let window = WebviewWindowBuilder::new(
            app,
            "harness",
            WebviewUrl::External(url.parse().map_err(|error| format!("无效 URL：{error}"))?),
        )
        .title("MDSH")
        .inner_size(1280.0, 860.0)
        .initialization_script(
            r#"
            (function() {
                const style = document.createElement('style');
                style.setAttribute('data-mdsh-hide-update-trigger', '');
                style.textContent = `
                    button[aria-label="检查更新"],
                    button[aria-label="Check for updates"],
                    button[title="检查更新"],
                    button[title="Check for updates"] {
                        display: none !important;
                    }
                `;
                (document.head || document.documentElement).appendChild(style);
            })();
            "#,
        )
        .build()
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "macos")]
    set_app_icon()?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_harness(app: AppHandle) -> Result<(), String> {
    show_harness(&app)
}

fn h_icon_rgba(core_ready: bool, request_error: bool, orbit_frame: Option<usize>) -> Vec<u8> {
    const WHITE: [u8; 4] = [255, 255, 255, 255];
    const GREEN: [u8; 4] = [52, 199, 89, 255];
    const RED: [u8; 4] = [255, 69, 58, 255];
    const CYAN: [u8; 4] = [0, 200, 255, 255];
    const EDGE: [(usize, usize); 20] = [
        (0, 0), (0, 1), (0, 2), (0, 3), (0, 4), (0, 5),
        (1, 5), (2, 5), (3, 5), (4, 5), (5, 5), (5, 4),
        (5, 3), (5, 2), (5, 1), (5, 0), (4, 0), (3, 0),
        (2, 0), (1, 0),
    ];
    let mut rgba = vec![0; 48 * 48 * 4];
    let center = if core_ready { GREEN } else { WHITE };
    let sides = if !core_ready {
        WHITE
    } else if request_error {
        RED
    } else if orbit_frame.is_some() {
        GREEN
    } else {
        WHITE
    };
    for row in 0..5 {
        for column in [0, 3] {
            paint_square(&mut rgba, row, column, sides);
        }
    }
    for column in 1..3 {
        paint_square(&mut rgba, 2, column, center);
    }
    if let Some(frame) = orbit_frame {
        for (offset, alpha) in [255, 220, 185, 150, 115].into_iter().enumerate() {
            let (row, column) = EDGE[(frame + EDGE.len() - offset) % EDGE.len()];
            let mut color = CYAN;
            color[3] = alpha;
            paint_grid_square(&mut rgba, row, column, color);
        }
    }
    rgba
}

fn paint_square(rgba: &mut [u8], row: usize, column: usize, color: [u8; 4]) {
    paint_area(rgba, 4 + row * 8, 8 + column * 8, color);
}

fn paint_grid_square(rgba: &mut [u8], row: usize, column: usize, color: [u8; 4]) {
    paint_area(rgba, row * 8, column * 8, color);
}

fn paint_area(rgba: &mut [u8], top: usize, left: usize, color: [u8; 4]) {
    for y in top..top + 8 {
        for x in left..left + 8 {
            let index = (y * 48 + x) * 4;
            rgba[index..index + 4].copy_from_slice(&color);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::h_icon_rgba;

    #[test]
    fn status_icon_is_a_block_h() {
        let rgba = h_icon_rgba(false, false, None);
        for row in 0..5 {
            for column in 0..4 {
                let alpha = rgba[((row * 8 + 7) * 48 + column * 8 + 11) * 4 + 3];
                let expected = column == 0 || column == 3 || row == 2;
                assert_eq!(alpha > 0, expected, "方块位置 {row},{column}");
            }
        }
        let ready = h_icon_rgba(true, false, None);
        let center = ((2 * 8 + 7) * 48 + 1 * 8 + 11) * 4;
        let side = ((2 * 8 + 7) * 48 + 11) * 4;
        assert_eq!(&ready[center..center + 4], &[52, 199, 89, 255]);
        assert_eq!(&ready[side..side + 4], &[255, 255, 255, 255]);
        let running = h_icon_rgba(true, false, Some(0));
        assert_eq!(&running[side..side + 4], &[52, 199, 89, 255]);
        let error = h_icon_rgba(true, true, None);
        assert_eq!(&error[side..side + 4], &[255, 69, 58, 255]);
        assert_eq!(&error[center..center + 4], &[52, 199, 89, 255]);
        assert_eq!(&h_icon_rgba(true, false, Some(0))[..4], &[0, 200, 255, 255]);
    }
}

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let status = MenuItem::with_id(app, "status", "状态：已停止", false, None::<&str>)?;
    let port = MenuItem::with_id(app, "port", "端口：--", false, None::<&str>)?;
    let status_separator = PredefinedMenuItem::separator(app)?;
    let open = MenuItem::with_id(app, "open", "打开 Harness", true, None::<&str>)?;
    let update = MenuItem::with_id(app, "update", "检查核心更新", true, None::<&str>)?;
    let ui_update = MenuItem::with_id(app, "ui-update", "检查 UI 库更新", true, None::<&str>)?;
    let action_separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出 MDSH", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &status,
            &port,
            &status_separator,
            &open,
            &update,
            &ui_update,
            &action_separator,
            &quit,
        ],
    )?;
    let state = app.state::<HarnessProcess>();
    *state.status_menu.lock().expect("状态菜单锁已损坏") = Some(status);
    *state.port_menu.lock().expect("端口菜单锁已损坏") = Some(port);
    *state.update_menu.lock().expect("更新菜单锁已损坏") = Some(update);
    *state.ui_update_menu.lock().expect("UI 更新菜单锁已损坏") = Some(ui_update);
    let tray = TrayIconBuilder::new()
        .icon(Image::new_owned(h_icon_rgba(false, false, None), 48, 48))
        .icon_as_template(false)
        .tooltip("MDSH")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                if let Err(error) = show_harness(app) {
                    eprintln!("打开 Harness 失败：{error}");
                }
            }
            "update" => check_core_update_from_tray(app),
            "ui-update" => check_ui_update_from_tray(app),
            "quit" => {
                app.state::<HarnessProcess>().quitting.store(true, Ordering::Relaxed);
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;
    *state.tray.lock().expect("状态栏图标锁已损坏") = Some(tray);
    Ok(())
}

fn start_activity_animation(app: &AppHandle) {
    let handle = app.clone();
    thread::spawn(move || {
        let mut frame = 0;
        let mut previous = String::new();
        let mut previous_core_ready = false;
        loop {
            let state = handle.state::<HarnessProcess>();
            if state.quitting.load(Ordering::Relaxed) {
                let _ = std::fs::remove_file(&state.activity_path);
                break;
            }
            let core_ready = state.status.lock().is_ok_and(|status| status.as_str() == "ready");
            let activity = std::fs::read_to_string(&state.activity_path)
                .unwrap_or_else(|_| "idle".into());
            let activity = activity.trim();
            if activity == "running" || activity != previous || core_ready != previous_core_ready {
                if let Ok(tray) = state.tray.lock() {
                    if let Some(tray) = tray.as_ref() {
                        let _ = tray.set_icon_with_as_template(
                            Some(Image::new_owned(
                                h_icon_rgba(core_ready, activity == "error", (activity == "running").then_some(frame)),
                                48,
                                48,
                            )),
                            false,
                        );
                    }
                }
            }
            previous.clear();
            previous.push_str(activity);
            previous_core_ready = core_ready;
            if activity == "running" {
                frame = (frame + 1) % 20;
            } else {
                frame = 0;
            }
            thread::sleep(Duration::from_millis(100));
        }
    });
}

fn git_output(core: &PathBuf, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(core)
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

fn repository_update_status(repository: &PathBuf, branch: &str) -> Result<UpdateStatus, String> {
    git_output(repository, &["fetch", "origin", branch, "--quiet"])?;
    let current = git_output(repository, &["rev-parse", "HEAD"])?;
    let latest = git_output(repository, &["rev-parse", &format!("origin/{branch}")])?;
    Ok(UpdateStatus {
        update_available: current != latest,
        current,
        latest,
    })
}

fn start_update_check(
    menu: Option<MenuItem<tauri::Wry>>,
    repository: PathBuf,
    branch: &'static str,
    labels: [&'static str; 4],
) {
    let Some(menu) = menu else { return };
    let _ = menu.set_text(labels[0]);
    let _ = menu.set_enabled(false);
    thread::spawn(move || {
        let label = match repository_update_status(&repository, branch) {
            Ok(status) if status.update_available => labels[1],
            Ok(_) => labels[2],
            Err(_) => labels[3],
        };
        let _ = menu.set_text(label);
        let _ = menu.set_enabled(true);
    });
}

fn check_core_update_from_tray(app: &AppHandle) {
    let state = app.state::<HarnessProcess>();
    let menu = state.update_menu.lock().ok().and_then(|menu| menu.clone());
    start_update_check(
        menu,
        state.root.join("core"),
        "master",
        ["正在检查核心更新…", "发现核心更新", "核心已是最新", "核心更新检查失败"],
    );
}

fn check_ui_update_from_tray(app: &AppHandle) {
    let state = app.state::<HarnessProcess>();
    let menu = state.ui_update_menu.lock().ok().and_then(|menu| menu.clone());
    start_update_check(
        menu,
        state.root.join("web-ui"),
        "main",
        ["正在检查 UI 库更新…", "发现 UI 库更新", "UI 库已是最新", "UI 库更新检查失败"],
    );
}

#[tauri::command]
async fn check_core_update(state: State<'_, HarnessProcess>) -> Result<UpdateStatus, String> {
    repository_update_status(&state.root.join("core"), "master")
}

fn stop_harness(state: &HarnessProcess) {
    if let Ok(mut guard) = state.child.lock() {
        if let Some(child) = guard.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        *guard = None;
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .on_window_event(|window, event| {
            #[cfg(target_os = "macos")]
            if window.label() == "harness" && matches!(event, tauri::WindowEvent::Destroyed) {
                if let Err(error) = window
                    .app_handle()
                    .set_activation_policy(tauri::ActivationPolicy::Accessory)
                {
                    eprintln!("隐藏应用图标失败：{error}");
                }
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                set_app_icon().map_err(std::io::Error::other)?;
            }

            let activity_path = std::env::temp_dir().join(format!("mdsh-model-{}.status", std::process::id()));
            let _ = std::fs::remove_file(&activity_path);
            app.manage(HarnessProcess {
                child: Mutex::new(None),
                status: Mutex::new("stopped".into()),
                url: Mutex::new(None),
                status_menu: Mutex::new(None),
                port_menu: Mutex::new(None),
                update_menu: Mutex::new(None),
                ui_update_menu: Mutex::new(None),
                tray: Mutex::new(None),
                quitting: AtomicBool::new(false),
                activity_path,
                root: project_root(),
            });
            create_tray(app.handle())?;
            start_harness(app.handle()).map_err(std::io::Error::other)?;
            start_activity_animation(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![harness_status, open_harness, check_core_update])
        .build(tauri::generate_context!())
        .expect("无法构建 Tauri 应用")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested { api, .. }
                if !app.state::<HarnessProcess>().quitting.load(Ordering::Relaxed) =>
            {
                api.prevent_exit();
            }
            tauri::RunEvent::Exit => stop_harness(&app.state::<HarnessProcess>()),
            _ => {}
        });
}
