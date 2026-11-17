use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    path::Path,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, Sender},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
type Reply = Result<Value, String>;
type Pending = Arc<Mutex<HashMap<u64, Sender<Reply>>>>;

// Trusted single-plugin probe, not a sandbox or production supervisor.
pub struct Backend {
    child: Arc<Mutex<Child>>,
    input: Mutex<ChildStdin>,
    pending: Pending,
    alive: Arc<AtomicBool>,
    sequence: AtomicU64,
}
impl Backend {
    pub fn start() -> Result<Self, String> {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let node = std::env::var_os("WORKBENCH_NODE").unwrap_or_else(|| "node".into());
        let mut child = Command::new(node)
            .arg(root.join("shared/stdio-worker.mjs"))
            .arg(root.join("fixtures/counter"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| e.to_string())?;
        let input = child.stdin.take().unwrap();
        let output = child.stdout.take().unwrap();
        let child = Arc::new(Mutex::new(child));
        let reader_child = child.clone();
        let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
        let reader_pending = pending.clone();
        let alive = Arc::new(AtomicBool::new(true));
        let reader_alive = alive.clone();
        let (ready_tx, ready_rx) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(output).lines() {
                let Ok(line) = line else { break };
                let Ok(message) = serde_json::from_str::<Value>(&line) else {
                    break;
                };
                if message["type"] == "ready" {
                    let _ = ready_tx.send(Ok(()));
                    continue;
                }
                if let Some(id) = message["id"].as_u64() {
                    if let Some(tx) = reader_pending.lock().unwrap().remove(&id) {
                        let result = if let Some(error) = message["error"].as_str() {
                            Err(error.into())
                        } else {
                            Ok(message["result"].clone())
                        };
                        let _ = tx.send(result);
                    }
                }
            }
            reader_alive.store(false, Ordering::SeqCst);
            {
                let mut child = reader_child.lock().unwrap();
                if child.try_wait().ok().flatten().is_none() {
                    let _ = child.kill();
                }
                let _ = child.wait();
            }
            for (_, tx) in reader_pending.lock().unwrap().drain() {
                let _ = tx.send(Err("BACKEND_EXITED".into()));
            }
            let _ = ready_tx.send(Err("ACTIVATION_EXIT".to_string()));
        });
        match ready_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(())) => Ok(Self {
                child,
                input: Mutex::new(input),
                pending,
                alive,
                sequence: AtomicU64::new(0),
            }),
            result => {
                let mut child = child.lock().unwrap();
                let _ = child.kill();
                let _ = child.wait();
                Err(format!("ACTIVATION_FAILED: {result:?}"))
            }
        }
    }
    pub fn call(&self, method: &str, params: Value, timeout: Duration) -> Reply {
        if !["stats", "work"].contains(&method) {
            return Err("INVALID_METHOD".into());
        }
        let id = self.sequence.fetch_add(1, Ordering::SeqCst) + 1;
        let (tx, rx) = mpsc::channel();
        {
            let mut pending = self.pending.lock().unwrap();
            if !self.alive.load(Ordering::SeqCst) {
                return Err("BACKEND_EXITED".into());
            }
            pending.insert(id, tx);
        }
        let request = json!({"id":id,"method":method,"params":params}).to_string() + "\n";
        if self
            .input
            .lock()
            .unwrap()
            .write_all(request.as_bytes())
            .is_err()
        {
            self.pending.lock().unwrap().remove(&id);
            return Err("BACKEND_EXITED".into());
        }
        match rx.recv_timeout(timeout) {
            Ok(result) => result,
            Err(_) => {
                self.pending.lock().unwrap().remove(&id);
                Err("TIMEOUT".into())
            }
        }
    }
    pub fn terminate_process(&self) {
        // Fault injection: no pending drain/alive mutation; EOF handling must do recovery.
        let _ = self.child.lock().unwrap().kill();
    }
    pub fn stop(&self) {
        self.alive.store(false, Ordering::SeqCst);
        let mut child = self.child.lock().unwrap();
        let _ = child.kill();
        let _ = child.wait();
        for (_, tx) in self.pending.lock().unwrap().drain() {
            let _ = tx.send(Err("BACKEND_EXITED".into()));
        }
    }
}
impl Drop for Backend {
    fn drop(&mut self) {
        self.stop();
    }
}
