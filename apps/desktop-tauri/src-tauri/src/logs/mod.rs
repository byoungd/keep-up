use serde::Serialize;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    sync::mpsc,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tracing::{Event, Subscriber};
use tracing_subscriber::{
    layer::{Context, SubscriberExt},
    registry::LookupSpan,
    Layer,
};

const LOG_EVENT_NAME: &str = "native-logs";
const LOG_BATCH_WINDOW_MS: u64 = 16;

#[derive(Clone)]
pub struct LogEmitter {
    sender: mpsc::Sender<LogEntry>,
}

impl LogEmitter {
    pub fn new(app: AppHandle) -> Self {
        let (sender, receiver) = mpsc::channel();
        spawn_log_worker(app, receiver);
        Self { sender }
    }

    pub fn layer(&self) -> LogsLayer {
        LogsLayer {
            sender: self.sender.clone(),
        }
    }
}

pub fn init(app: AppHandle) -> LogEmitter {
    let emitter = LogEmitter::new(app);
    let layer = emitter.layer();

    let subscriber = tracing_subscriber::registry()
        .with(layer)
        .with(tracing_subscriber::fmt::layer().with_target(false));

    let _ = subscriber.try_init();
    emitter
}

#[derive(Clone)]
pub struct LogsLayer {
    sender: mpsc::Sender<LogEntry>,
}

impl<S> Layer<S> for LogsLayer
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let metadata = event.metadata();
        let mut visitor = JsonVisitor::default();
        event.record(&mut visitor);

        let mut fields = visitor.fields;
        let message = fields
            .remove("message")
            .map(|value| match value {
                Value::String(text) => text,
                other => other.to_string(),
            });

        let entry = LogEntry {
            level: metadata.level().as_str().to_string(),
            target: metadata.target().to_string(),
            message,
            fields,
            timestamp_ms: now_ms(),
        };

        let _ = self.sender.send(entry);
    }
}

#[derive(Serialize)]
pub struct LogBatch {
    pub entries: Vec<LogEntry>,
}

#[derive(Serialize)]
pub struct LogEntry {
    pub level: String,
    pub target: String,
    pub message: Option<String>,
    pub fields: BTreeMap<String, Value>,
    pub timestamp_ms: u64,
}

#[derive(Default)]
struct JsonVisitor {
    fields: BTreeMap<String, Value>,
}

impl tracing_subscriber::field::Visit for JsonVisitor {
    fn record_bool(&mut self, field: &tracing::field::Field, value: bool) {
        self.fields
            .insert(field.name().to_string(), Value::Bool(value));
    }

    fn record_i64(&mut self, field: &tracing::field::Field, value: i64) {
        self.fields
            .insert(field.name().to_string(), Value::Number(value.into()));
    }

    fn record_u64(&mut self, field: &tracing::field::Field, value: u64) {
        self.fields
            .insert(field.name().to_string(), Value::Number(value.into()));
    }

    fn record_f64(&mut self, field: &tracing::field::Field, value: f64) {
        let number = serde_json::Number::from_f64(value)
            .unwrap_or_else(|| serde_json::Number::from(0));
        self.fields
            .insert(field.name().to_string(), Value::Number(number));
    }

    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        self.fields
            .insert(field.name().to_string(), Value::String(value.to_string()));
    }

    fn record_error(
        &mut self,
        field: &tracing::field::Field,
        value: &(dyn std::error::Error + 'static),
    ) {
        self.fields
            .insert(field.name().to_string(), Value::String(value.to_string()));
    }

    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        self.fields.insert(
            field.name().to_string(),
            Value::String(format!("{value:?}")),
        );
    }
}

fn spawn_log_worker(app: AppHandle, receiver: mpsc::Receiver<LogEntry>) {
    thread::spawn(move || {
        let debounce = Duration::from_millis(LOG_BATCH_WINDOW_MS);
        let mut buffer = Vec::new();

        loop {
            let entry = match receiver.recv() {
                Ok(entry) => entry,
                Err(_) => break,
            };

            buffer.push(entry);
            let start = Instant::now();

            while start.elapsed() < debounce {
                let timeout = debounce.saturating_sub(start.elapsed());
                match receiver.recv_timeout(timeout) {
                    Ok(entry) => buffer.push(entry),
                    Err(mpsc::RecvTimeoutError::Timeout) => break,
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }

            if buffer.is_empty() {
                continue;
            }

            let batch = LogBatch {
                entries: std::mem::take(&mut buffer),
            };
            let _ = app.emit(LOG_EVENT_NAME, batch);
        }
    });
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
