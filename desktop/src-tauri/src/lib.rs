use serde::Serialize;
use std::{
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

struct HarnessProcess {
    child: Mutex<Option<Child>>,
    status: Mutex<String>,
    url: Mutex<Option<String>>,
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
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| format!("无法启动 DeepSeek Harness：{error}"))?;
    *state.child.lock().map_err(|_| "子进程锁已损坏")? = Some(child);
    *state.status.lock().map_err(|_| "状态锁已损坏")? = "starting".into();
    *state.url.lock().map_err(|_| "URL 锁已损坏")? = Some(url.clone());

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
        if let Ok(mut status) = state.status.lock() {
            *status = if ready { "ready" } else { "failed" }.into();
        }
    });
    Ok(())
}

#[tauri::command]
fn harness_status(state: State<'_, HarnessProcess>) -> Result<HarnessStatus, String> {
    let mut status = state.status.lock().map_err(|_| "状态锁已损坏")?;
    if let Some(child) = state.child.lock().map_err(|_| "子进程锁已损坏")?.as_mut() {
        if let Some(exit) = child.try_wait().map_err(|error| error.to_string())? {
            *status = format!("exited ({exit})");
        }
    }
    Ok(HarnessStatus {
        status: status.clone(),
        url: state.url.lock().map_err(|_| "URL 锁已损坏")?.clone(),
    })
}

#[tauri::command]
fn open_harness(app: AppHandle, state: State<'_, HarnessProcess>) -> Result<(), String> {
    let status = state.status.lock().map_err(|_| "状态锁已损坏")?.clone();
    if status != "ready" {
        return Err(format!("Harness 尚未就绪：{status}"));
    }
    if let Some(window) = app.get_webview_window("harness") {
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    let url = state.url.lock().map_err(|_| "URL 锁已损坏")?.clone().ok_or("Harness URL 不存在")?;
    WebviewWindowBuilder::new(
        &app,
        "harness",
        WebviewUrl::External(url.parse().map_err(|error| format!("无效 URL：{error}"))?),
    )
    .title("DeepSeek Harness")
    .inner_size(1280.0, 860.0)
    .build()
    .map_err(|error| error.to_string())?;
    Ok(())
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

#[tauri::command]
async fn check_core_update(state: State<'_, HarnessProcess>) -> Result<UpdateStatus, String> {
    let core = state.root.join("core");
    git_output(&core, &["fetch", "origin", "master", "--quiet"])?;
    let current = git_output(&core, &["rev-parse", "HEAD"])?;
    let latest = git_output(&core, &["rev-parse", "origin/master"])?;
    Ok(UpdateStatus {
        update_available: current != latest,
        current,
        latest,
    })
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
        .setup(|app| {
            app.manage(HarnessProcess {
                child: Mutex::new(None),
                status: Mutex::new("stopped".into()),
                url: Mutex::new(None),
                root: project_root(),
            });
            start_harness(app.handle()).map_err(std::io::Error::other)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![harness_status, open_harness, check_core_update])
        .build(tauri::generate_context!())
        .expect("无法构建 Tauri 应用")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }) {
                stop_harness(&app.state::<HarnessProcess>());
            }
        });
}
