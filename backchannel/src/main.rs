use axum::{
    body::Bytes,
    error_handling::HandleErrorLayer,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ContentLengthLimit, Extension, Path,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Router,
};

use std::{
    borrow::Cow,
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, RwLock},
    time::Duration,
};

use futures::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tower::{BoxError, ServiceBuilder};
use tower_http::{add_extension::AddExtensionLayer, trace::TraceLayer};

struct AppState {
    db: RwLock<HashMap<String, Bytes>>,
    tx: broadcast::Sender<String>,
}

#[derive(Serialize, Deserialize)]
struct DbItem {
    key: String,
    value: String,
}

#[tokio::main]
async fn main() {
    // Set the RUST_LOG, if it hasn't been explicitly defined
    if std::env::var_os("RUST_LOG").is_none() {
        std::env::set_var("RUST_LOG", "backchannel=debug,tower_http=debug")
    }
    tracing_subscriber::fmt::init();

    let (tx, _rx) = broadcast::channel(64);
    let app_state = Arc::new(AppState {
        db: RwLock::new(HashMap::default()),
        tx,
    });

    // Build our application by composing routes
    let app = Router::new()
        .route("/:key", get(kv_get).post(kv_set))
        .route("/keys", get(list_keys))
        //.route("/sse", get(sse_handler))
        .route("/ws", get(websocket_handler))
        // Add middleware to all routes
        .layer(
            ServiceBuilder::new()
                // Handle errors from middleware
                .layer(HandleErrorLayer::new(handle_error))
                .load_shed()
                .concurrency_limit(1024)
                .timeout(Duration::from_secs(10))
                .layer(TraceLayer::new_for_http())
                .layer(AddExtensionLayer::new(app_state))
                .into_inner(),
        );

    // Run our app with hyper
    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    tracing::debug!("listening on {}", addr);
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

async fn kv_get(
    Path(key): Path<String>,
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Bytes, StatusCode> {
    let db = &state.db.read().unwrap();

    if let Some(value) = db.get(&key) {
        Ok(value.clone())
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

async fn kv_set(
    Path(key): Path<String>,
    ContentLengthLimit(bytes): ContentLengthLimit<Bytes, { 1024 * 10_000 }>, // ~10mb
    Extension(state): Extension<Arc<AppState>>,
) {
    state.db.write().unwrap().insert(key, bytes);
}

async fn list_keys(Extension(state): Extension<Arc<AppState>>) -> String {
    let db = &state.db.read().unwrap();

    db.keys()
        .map(|key| key.to_string())
        .collect::<Vec<String>>()
        .join("\n")
}

fn handle_error(error: BoxError) -> impl IntoResponse {
    if error.is::<tower::timeout::error::Elapsed>() {
        return (StatusCode::REQUEST_TIMEOUT, Cow::from("request timed out"));
    }

    if error.is::<tower::load_shed::error::Overloaded>() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Cow::from("service is overloaded, try again later"),
        );
    }

    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Cow::from(format!("Unhandled internal error: {}", error)),
    )
}

async fn websocket_handler(
    ws: WebSocketUpgrade,
    Extension(state): Extension<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| websocket(socket, state))
}

async fn websocket(stream: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = stream.split();

    // first iterate through the db and send all the values we already have
    let mut current_items = vec![];
    {
        let db = state.db.read().unwrap();
        for (k, v) in db.iter() {
            let item = DbItem {
                value: String::from_utf8(v.to_vec()).unwrap(),
                key: k.clone(),
            };
            current_items.push(item);
        }
    }

    for item in current_items {
        let _ = sender
            .send(Message::Text(serde_json::to_string(&item).unwrap()))
            .await;
    }

    let mut rx = state.tx.subscribe();
    // This task will receive broadcast messages and send text message to our client.
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            // In any websocket error, break loop.
            if sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Clone things we want to pass to the receiving task.
    let tx = state.tx.clone();

    // This task will receive messages from client and send them to broadcast subscribers.
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            let db_item: DbItem = if let Ok(db_item) = serde_json::from_str(&text) {
                db_item
            } else {
                // log the error and close this ws connection.
                tracing::error!("Invalid payload received");
                return;
            };

            state
                .db
                .write()
                .unwrap()
                .insert(db_item.key, Bytes::from(db_item.value));
            let _ = tx.send(text);
        }
    });

    // If any one of the tasks exit, abort the other.
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}
