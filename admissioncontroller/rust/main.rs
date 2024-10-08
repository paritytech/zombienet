use warp::Filter;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use json_patch::{Patch, PatchOperation};
use base64;
use tokio_rustls::rustls::{ServerConfig, Certificate, PrivateKey};
use tokio_rustls::TlsAcceptor;
use tokio_rustls::rustls::internal::pemfile::{certs, rsa_private_keys};
use std::fs::File;
use std::io::{BufReader, Error as IoError};
use std::sync::Arc;

#[derive(Debug, Deserialize)]
struct AdmissionReview {
    request: AdmissionRequest,
}

#[derive(Debug, Deserialize)]
struct AdmissionRequest {
    namespace: String,
    object: PodObject,
}

#[derive(Debug, Deserialize)]
struct PodObject {
    metadata: PodMetadata,
    spec: PodSpec,
}

#[derive(Debug, Deserialize)]
struct PodMetadata {
    labels: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct PodSpec {
    nodeSelector: Option<Value>,
}

#[derive(Serialize)]
struct AdmissionResponse {
    response: Response,
}

#[derive(Serialize)]
struct Response {
    allowed: bool,
    status: ResponseStatus,
    patchType: Option<String>,
    patch: Option<String>,
}

#[derive(Serialize)]
struct ResponseStatus {
    message: String,
}

#[tokio::main]
async fn main() {
    // Healthz route
    let healthz = warp::path("healthz")
        .map(|| warp::reply::json(&json!({"status": "ok"})));

    // Mutation route
    let mutate = warp::path("mutate")
        .and(warp::path("pods"))
        .and(warp::post())
        .and(warp::body::json())
        .and_then(handle_mutation);

    // Load the certificate and key files for TLS
    let tls_config = load_tls_config().expect("Failed to load TLS configuration");

    let tls_acceptor = TlsAcceptor::from(Arc::new(tls_config));

    // Serve the server using TLS
    warp::serve(healthz.or(mutate))
        .tls_with_acceptor(tls_acceptor)
        .run(([0, 0, 0, 0], 4443))
        .await;
}

async fn handle_mutation(admission_review: AdmissionReview) -> Result<impl warp::Reply, Infallible> {
    let namespace = admission_review.request.namespace;
    let labels = admission_review
        .request
        .object
        .metadata
        .labels
        .clone()
        .unwrap_or(json!({}));

    let has_node_selector = admission_review.request.object.spec.nodeSelector.is_some();

    let json_patch = if namespace.starts_with("zombie-") {
        match labels.get("x-infra-instance") {
            Some(label_value) => match label_value.as_str() {
                Some("ondemand") => create_patch("large-testnet", "large-network"),
                Some("ondemand-iops") => create_patch("large-testnet-iops", "large-network-iops"),
                Some("spot-iops") => create_patch("xlarge-testnet-iops", "xlarge-network-iops"),
                _ => create_patch("xlarge-testnet", "xlarge-network"),
            },
            None => {
                if !has_node_selector {
                    create_patch("large-testnet", "large-network")
                } else {
                    Patch(vec![])
                }
            }
        }
    } else {
        Patch(vec![])
    };

    let base64_patch = base64::encode(serde_json::to_string(&json_patch).unwrap());

    let admission_response = AdmissionResponse {
        response: Response {
            allowed: true,
            status: ResponseStatus {
                message: String::from("Mutating webhook applied"),
            },
            patchType: Some(String::from("JSONPatch")),
            patch: Some(base64_patch),
        },
    };

    Ok(warp::reply::json(&admission_response))
}

fn create_patch(toleration_value: &str, node_selector_value: &str) -> Patch {
    Patch(vec![
        PatchOperation::Add {
            path: "/spec/tolerations".to_string(),
            value: json!([{
                "effect": "NoExecute",
                "key": "workload-type",
                "operator": "Equal",
                "value": toleration_value
            }]),
        },
        PatchOperation::Add {
            path: "/spec/nodeSelector".to_string(),
            value: json!({ "nodetype": node_selector_value }),
        },
    ])
}

fn load_tls_config() -> Result<ServerConfig, IoError> {
    // Load the certificate file
    let certs = load_certs("keys/server.crt")?;
    // Load the private key file
    let key = load_private_key("keys/server.key")?;

    // Create a new ServerConfig and set the certs and keys
    let mut config = ServerConfig::new(rustls::NoClientAuth::new());
    config.set_single_cert(certs, key)?;

    Ok(config)
}

fn load_certs(path: &str) -> Result<Vec<Certificate>, IoError> {
    let certfile = File::open(path)?;
    let mut reader = BufReader::new(certfile);
    Ok(certs(&mut reader).map_err(|_| IoError::new(std::io::ErrorKind::InvalidInput, "Invalid certificate"))?)
}

fn load_private_key(path: &str) -> Result<PrivateKey, IoError> {
    let keyfile = File::open(path)?;
    let mut reader = BufReader::new(keyfile);
    let keys = rsa_private_keys(&mut reader)
        .map_err(|_| IoError::new(std::io::ErrorKind::InvalidInput, "Invalid private key"))?;
    if keys.len() != 1 {
        return Err(IoError::new(std::io::ErrorKind::InvalidInput, "Expected a single private key"));
    }
    Ok(PrivateKey(keys[0].clone()))
}
