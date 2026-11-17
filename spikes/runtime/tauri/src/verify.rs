use super::*;
use std::{sync::mpsc::Receiver, thread, time::Instant};
fn ensure(condition: bool, message: &str) -> Result<(), String> {
    if condition {
        Ok(())
    } else {
        Err(message.into())
    }
}
fn check(checks: &mut Vec<&'static str>, name: &'static str) {
    checks.push(name);
    println!("{}", json!({"event":"verified","name":name}));
}
pub fn run(app: &tauri::AppHandle, ready: Receiver<Value>) -> Result<(), String> {
    let mut checks = vec![];
    let initial = ready
        .recv_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    ensure(initial["instances"] == 2, "expected two DOM instances")?;
    check(&mut checks, "independent ESM mounts two DOM instances");
    ensure(initial["nodeAbsent"] == true, "renderer exposed Node")?;
    check(&mut checks, "renderer has no Node process global");
    ensure(
        initial["stats"]["executions"] == 0,
        "initial IPC stats mismatch",
    )?;
    check(&mut checks, "renderer invokes scoped Rust command");
    let b = app.state::<Probe>().backend.clone();
    let job_backend = b.clone();
    let job = thread::spawn(move || {
        job_backend.call("work", json!({"delay":800}), Duration::from_secs(5))
    });
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        if b.call("stats", json!({}), Duration::from_secs(1))?["executions"] == 1 {
            break;
        }
        ensure(Instant::now() < deadline, "job did not start")?;
        thread::sleep(Duration::from_millis(5));
    }
    app.get_webview_window("main")
        .ok_or("missing window")?
        .close()
        .map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(2);
    while app.state::<Probe>().closed_at.load(Ordering::SeqCst) == 0 {
        ensure(Instant::now() < deadline, "window did not destroy")?;
        thread::sleep(Duration::from_millis(5));
    }
    let closed_at = app.state::<Probe>().closed_at.load(Ordering::SeqCst);
    let outcome = job.join().map_err(|_| "job thread panicked")??;
    ensure(
        outcome["completed"] == true && outcome["completedAt"].as_u64().unwrap_or(0) > closed_at,
        "job finished before close",
    )?;
    println!(
        "{}",
        json!({"event":"job-completed-after-close","closedAt":closed_at,"completedAt":outcome["completedAt"]})
    );
    check(
        &mut checks,
        "Node backend completes after actual Tauri window destruction",
    );
    show(app).map_err(|e| e.to_string())?;
    let reopened = ready
        .recv_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    ensure(
        reopened["instances"] == 2 && reopened["stats"]["completed"] == 1,
        "restored UI stats mismatch",
    )?;
    check(&mut checks, "recreated window retrieves backend result");
    let crashing = b.clone();
    let pending = thread::spawn(move || {
        crashing.call("work", json!({"delay":10000}), Duration::from_secs(5))
    });
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        if b.call("stats", json!({}), Duration::from_secs(1))?["executions"] == 2 {
            break;
        }
        ensure(Instant::now() < deadline, "crash job did not start")?;
        thread::sleep(Duration::from_millis(5));
    }
    b.terminate_process();
    ensure(
        pending
            .join()
            .map_err(|_| "pending thread panicked")?
            .unwrap_err()
            == "BACKEND_EXITED",
        "pending call did not fail on crash",
    )?;
    check(
        &mut checks,
        "unexpected backend termination rejects pending calls while host survives",
    );
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../docs/qa/evidence/tauri-runtime.json");
    let report = json!({"tauri":"2.12.6","platform":std::env::consts::OS,"arch":std::env::consts::ARCH,"packaged":false,"node":"system Node (WORKBENCH_NODE or PATH); not bundled","checks":checks});
    std::fs::write(path, serde_json::to_string_pretty(&report).unwrap())
        .map_err(|e| e.to_string())?;
    Ok(())
}
