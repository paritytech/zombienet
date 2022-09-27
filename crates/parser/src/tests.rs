use super::*;

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
fn para_dummy_upgrade_parse_ok() {
    let line: &str = r#"alice: parachain 100 perform dummy upgrade within 200 seconds"#;
    let data = r#"{
        "description": null,
        "network": "./a.toml",
        "creds": "config",
        "assertions": [
            {
                "original_line": "alice: parachain 100 perform dummy upgrade within 200 seconds",
                "parsed": {
                  "fn": "ParaRuntimeDummyUpgrade",
                  "args": {
                    "node_name": "alice",
                    "para_id": 100,
                    "timeout": 200
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
fn para_upgrade_parse_ok() {
    let line: &str =
        r#"alice: parachain 100 perform upgrade with ./some.wasm.compact within 200 seconds"#;
    let data = r#"{
        "description": null,
        "network": "./a.toml",
        "creds": "config",
        "assertions": [
            {
                "original_line": "alice: parachain 100 perform upgrade with ./some.wasm.compact within 200 seconds",
                "parsed": {
                  "fn": "ParaRuntimeUpgrade",
                  "args": {
                    "node_name": "alice",
                    "para_id": 100,
                    "file_or_uri": "./some.wasm.compact",
                    "timeout": 200
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
fn log_match_parse_ok() {
    let line: &str = r#"alice: log line contains "Imported #12" within 20 seconds"#;
    let data = r#"{
        "description": null,
        "network": "./a.toml",
        "creds": "config",
        "assertions": [
            {
                "original_line": "alice: log line contains \"Imported #12\" within 20 seconds",
                "parsed": {
                  "fn": "LogMatch",
                  "args": {
                    "node_name": "alice",
                    "match_type": "regex",
                    "pattern": "\"Imported #12\"",
                    "timeout": 20
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
fn log_match_parse_glob_ok() {
    let line: &str = r#"alice: log line contains glob "Imported #12" within 20 seconds"#;
    let data = r#"{
        "description": null,
        "network": "./a.toml",
        "creds": "config",
        "assertions": [
            {
                "original_line": "alice: log line contains glob \"Imported #12\" within 20 seconds",
                "parsed": {
                  "fn": "LogMatch",
                  "args": {
                    "node_name": "alice",
                    "match_type": "glob",
                    "pattern": "\"Imported #12\"",
                    "timeout": 20
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
fn log_match_glob_parse_ok() {
    let line: &str = r#"alice: log line matches glob "*rted #1*" within 10 seconds"#;
    let data = r#"{
        "description": null,
        "network": "./a.toml",
        "creds": "config",
        "assertions": [
            {
                "original_line": "alice: log line matches glob \"*rted #1*\" within 10 seconds",
                "parsed": {
                  "fn": "LogMatch",
                  "args": {
                    "node_name": "alice",
                    "match_type": "glob",
                    "pattern": "\"*rted #1*\"",
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
fn trace_parse_ok() {
    let line: &str = r#"alice: trace with traceID 94c1501a78a0d83c498cc92deec264d9 contains ["answer-chunk-request", "answer-chunk-request"]"#;
    let data = r#"{
        "description": null,
        "network": "./a.toml",
        "creds": "config",
        "assertions": [
            {
                "original_line": "alice: trace with traceID 94c1501a78a0d83c498cc92deec264d9 contains [\"answer-chunk-request\", \"answer-chunk-request\"]",
                "parsed": {
                  "fn": "Trace",
                  "args": {
                    "node_name": "alice",
                    "span_id": "94c1501a78a0d83c498cc92deec264d9",
                    "pattern": "[\"answer-chunk-request\", \"answer-chunk-request\"]",
                    "timeout": null
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
fn system_event_parse_ok() {
    let line: &str = r#"alice: system event contains "A candidate was included" within 20 seconds"#;
    let data = r#"{
        "description": null,
        "network": "./a.toml",
        "creds": "config",
        "assertions": [
            {
                "original_line": "alice: system event contains \"A candidate was included\" within 20 seconds",
                "parsed": {
                  "fn": "SystemEvent",
                  "args": {
                    "node_name": "alice",
                    "match_type": "regex",
                    "pattern": "\"A candidate was included\"",
                    "timeout": 20
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
fn custom_js_parse_ok() {
    let line: &str = r#"alice: js-script ./0008-custom.js within 200 seconds"#;
    let data = r#"{
        "description": null,
        "network": "./a.toml",
        "creds": "config",
        "assertions": [
            {
                "original_line": "alice: js-script ./0008-custom.js within 200 seconds",
                "parsed": {
                  "fn": "CustomJs",
                  "args": {
                    "node_name": "alice",
                    "file_path": "./0008-custom.js",
                    "custom_args": null,
                    "timeout": 200
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
fn custom_sh_parse_ok() {
    let line: &str = r#"alice: run ./0008-custom.sh within 200 seconds"#;
    let data = r#"{
        "description": null,
        "network": "./a.toml",
        "creds": "config",
        "assertions": [
            {
                "original_line": "alice: run ./0008-custom.sh within 200 seconds",
                "parsed": {
                    "fn": "CustomSh",
                    "args": {
                        "node_name": "alice",
                        "file_path": "./0008-custom.sh",
                        "custom_args": null,
                        "timeout": 200
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
