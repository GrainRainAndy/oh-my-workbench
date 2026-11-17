mod backend;
#[cfg(test)]
mod backend_tests;
mod verify;
use backend::Backend;
use serde_json::{json, Value};
use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::Sender,
        Arc,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct Probe {
    backend: Arc<Backend>,
    ready: Sender<Value>,
    closed_at: AtomicU64,
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}
fn allowed_url(url: &tauri::Url) -> bool {
    let origin = (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"));
    origin
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && ["", "/", "/index.html"].contains(&url.path())
        && url.query().is_none()
}
fn allowed_caller(window: &tauri::WebviewWindow) -> bool {
    window.label() == "main" && window.url().map(|url| allowed_url(&url)).unwrap_or(false)
}
#[tauri::command]
async fn fixture_call(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Probe>,
    method: String,
    params: Value,
) -> Result<Value, String> {
    if !allowed_caller(&window) {
        return Err("INVALID_CALLER".into());
    }
    let backend = state.backend.clone();
    tauri::async_runtime::spawn_blocking(move || {
        backend.call(&method, params, Duration::from_secs(35))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn probe_ready(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Probe>,
    instances: u32,
    stats: Value,
    node_absent: bool,
) {
    if allowed_caller(&window) {
        let _ = state
            .ready
            .send(json!({"instances":instances,"stats":stats,"nodeAbsent":node_absent}));
    }
}
fn show(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.show()?;
        window.set_focus()?;
    } else {
        WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
            .title("Workbench Tauri Runtime Probe")
            .inner_size(900., 600.)
            .on_navigation(allowed_url)
            .build()?;
    }
    Ok(())
}
fn main() {
    let backend = Arc::new(Backend::start().expect("backend activation failed"));
    let (ready_tx, ready_rx) = std::sync::mpsc::channel();
    let verifying = std::env::var_os("WORKBENCH_VERIFY").is_some();
    if verifying {
        let _ = std::fs::remove_file(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../../docs/qa/evidence/tauri-runtime.json"),
        );
    }
    tauri::Builder::default()
        .manage(Probe {
            backend,
            ready: ready_tx,
            closed_at: AtomicU64::new(0),
        })
        .setup(move |app| {
            let quit = tauri::menu::MenuItem::with_id(
                app,
                "quit",
                "Quit Spike",
                true,
                Some("CmdOrCtrl+Q"),
            )?;
            let submenu = tauri::menu::SubmenuBuilder::new(app, "Spike")
                .text("reopen", "Reopen workspace")
                .item(&quit)
                .build()?;
            let menu = tauri::menu::MenuBuilder::new(app).item(&submenu).build()?;
            app.set_menu(menu)?;
            show(app.handle())?;
            if verifying {
                let watchdog = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(20));
                    eprintln!("verification-timeout");
                    watchdog.exit(1);
                });
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let result = verify::run(&handle, ready_rx);
                    if let Err(error) = &result {
                        eprintln!("verification-failed: {error}");
                    }
                    handle.exit(if result.is_ok() { 0 } else { 1 });
                });
            }
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "quit" => app.exit(0),
            "reopen" => {
                if let Err(e) = show(app) {
                    eprintln!("{e}");
                }
            }
            _ => {}
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window
                    .state::<Probe>()
                    .closed_at
                    .store(now(), Ordering::SeqCst);
                println!("{}", json!({"event":"window-destroyed","at":now()}));
            }
        })
        .invoke_handler(tauri::generate_handler![fixture_call, probe_ready])
        .build(tauri::generate_context!())
        .expect("Tauri build failed")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested {
                code: None, api, ..
            } => api.prevent_exit(),
            tauri::RunEvent::Exit => app.state::<Probe>().backend.stop(),
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                if let Err(e) = show(app) {
                    eprintln!("{e}");
                }
            }
            _ => {}
        });
}
