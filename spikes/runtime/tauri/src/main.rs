// Desktop loading prerequisite probe; NOT equivalent to the Electron backend workload.
#[tauri::command]
fn probe_ready(app: tauri::AppHandle, instances: u32) {
    println!("{{\"event\":\"tauri-ui-ready\",\"instances\":{instances}}}");
    if std::env::var_os("WORKBENCH_VERIFY").is_some() {
        app.exit(if instances == 2 { 0 } else { 1 });
    }
}
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            if std::env::var_os("WORKBENCH_VERIFY").is_some() {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(20));
                    eprintln!("verification-timeout");
                    handle.exit(1);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![probe_ready])
        .run(tauri::generate_context!())
        .expect("Tauri build probe failed");
}
