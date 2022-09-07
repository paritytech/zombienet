use super::*;
use serde_json;

const NETWORK: &str = "Network: ./a.toml";
const CREDS: &str = "Creds: config";


#[test]
fn is_up_parse_ok() {
    let line: &str = "alice: is up within 5 secs";
    let data = r#"{
        "description": null,
        "network": "./a.toml",
        "creds": "config",
        "assertions": [
            {
                "original_line": "alice: is up within 5 secs",
                "parsed": {
                    "fn": "IsUp",
                    "args": {
                        "node_name": "alice",
                        "timeout": 5
                    }
                }
            }
        ]
    }"#;
    let t: TestDefinition = serde_json::from_str(data).unwrap();

    let result = parse(&[NETWORK, CREDS, line].join("\n")).unwrap();
    assert_eq!(result, t);
}

#[test]
fn para_is_registered_parse_ok() {
    let line: &str = "alice: parachain 100 is registered within 225 seconds";
    let data = r#"{
        "description": null,
        "network": "./a.toml",
        "creds": "config",
        "assertions": [
            {
                "original_line": "alice: parachain 100 is registered within 225 seconds",
                "parsed": {
                    "fn": "ParaIsRegistered",
                    "args": {
                        "node_name": "alice",
                        "para_id": 100,
                        "timeout": 225
                    }
                }
            }
        ]
    }"#;
    let t: TestDefinition = serde_json::from_str(data).unwrap();

    let result = parse(&[NETWORK, CREDS, line].join("\n")).unwrap();
    assert_eq!(result, t);
}

#[test]
fn histogram_parse_ok() {
    let line: &str = r#"alice: reports histogram polkadot_pvf_preparation_time has at least 1 samples in buckets ["0.1", "0.5", "1", "2", "3", "10"] within 10 seconds"#;
    let data = r#"{
        "description": null,
        "network": "./a.toml",
        "creds": "config",
        "assertions": [
            {
                "original_line": "alice: reports histogram polkadot_pvf_preparation_time has at least 1 samples in buckets [\"0.1\", \"0.5\", \"1\", \"2\", \"3\", \"10\"] within 10 seconds",
                "parsed": {
                    "fn": "Histogram",
                    "args": {
                        "node_name": "alice",
                        "metric_name": "polkadot_pvf_preparation_time",
                        "op": "IsAtLeast",
                        "target_value": 1,
                        "buckets":  "[\"0.1\", \"0.5\", \"1\", \"2\", \"3\", \"10\"]",
                        "timeout": 10
                    }
                }
            }
        ]
    }"#;
    let t: TestDefinition = serde_json::from_str(data).unwrap();

    let result = parse(&[NETWORK, CREDS, line].join("\n")).unwrap();
    assert_eq!(result, t);
}

#[test]
fn report_parse_ok() {
    let line: &str = r#"eve: reports parachain_candidate_dispute_concluded{validity="invalid"} is 0 within 15 seconds"#;
    let data = r#"{
        "description": null,
        "network": "./a.toml",
        "creds": "config",
        "assertions": [
            {
                "original_line": "eve: reports parachain_candidate_dispute_concluded{validity=\"invalid\"} is 0 within 15 seconds",
                "parsed": {
                    "fn": "Report",
                    "args": {
                        "node_name": "eve",
                        "metric_name": "parachain_candidate_dispute_concluded{validity=\"invalid\"}",
                        "op": "Equal",
                        "target_value": 0,
                        "timeout": 15
                    }
                }
            }
        ]
    }"#;
    let t: TestDefinition = serde_json::from_str(data).unwrap();

    let result = parse(&[NETWORK, CREDS, line].join("\n")).unwrap();
    assert_eq!(result, t);
}

#[test]
fn is_up_parse_err() {
    let result = parse("alice: is upp");
    assert!(result.is_err());
}