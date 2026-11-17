use super::backend::Backend;
use serde_json::json;
use std::{sync::Arc, thread, time::Duration};

#[test]
fn concurrent_requests_timeout_and_crash() {
    let b = Arc::new(Backend::start().unwrap());
    let worker = b.clone();
    let job =
        thread::spawn(move || worker.call("work", json!({"delay":200}), Duration::from_secs(2)));
    for _ in 0..100 {
        if b.call("stats", json!({}), Duration::from_secs(1)).unwrap()["executions"] == 1 {
            break;
        }
        thread::sleep(Duration::from_millis(5));
    }
    assert_eq!(
        b.call("stats", json!({}), Duration::from_secs(1)).unwrap(),
        json!({"executions":1,"completed":0})
    );
    assert_eq!(job.join().unwrap().unwrap()["completed"], true);
    assert_eq!(
        b.call("work", json!({"delay":80}), Duration::from_millis(5))
            .unwrap_err(),
        "TIMEOUT"
    );
    thread::sleep(Duration::from_millis(100));
    assert_eq!(
        b.call("stats", json!({}), Duration::from_secs(1)).unwrap()["completed"],
        2
    );
    let worker = b.clone();
    let pending =
        thread::spawn(move || worker.call("work", json!({"delay":10000}), Duration::from_secs(2)));
    for _ in 0..100 {
        if b.call("stats", json!({}), Duration::from_secs(1)).unwrap()["executions"] == 3 {
            break;
        }
        thread::sleep(Duration::from_millis(5));
    }
    b.terminate_process();
    assert_eq!(pending.join().unwrap().unwrap_err(), "BACKEND_EXITED");
    assert_eq!(
        b.call("stats", json!({}), Duration::from_secs(1))
            .unwrap_err(),
        "BACKEND_EXITED"
    );
}

#[test]
fn invalid_method_is_rejected_without_losing_backend() {
    let b = Backend::start().unwrap();
    assert_eq!(
        b.call("unknown", json!({}), Duration::from_secs(1))
            .unwrap_err(),
        "INVALID_METHOD"
    );
    assert_eq!(
        b.call("stats", json!({}), Duration::from_secs(1)).unwrap()["executions"],
        0
    );
}

#[test]
fn window_source_allows_only_local_probe_document() {
    for url in [
        "tauri://localhost",
        "tauri://localhost/",
        "tauri://localhost/index.html",
        "http://tauri.localhost/index.html",
    ] {
        assert!(
            super::allowed_url(&tauri::Url::parse(url).unwrap()),
            "{url}"
        );
    }
    for url in [
        "https://example.com/index.html",
        "tauri://evil/index.html",
        "tauri://localhost/other.html",
        "http://tauri.localhost:9999/index.html",
    ] {
        assert!(
            !super::allowed_url(&tauri::Url::parse(url).unwrap()),
            "{url}"
        );
    }
}
