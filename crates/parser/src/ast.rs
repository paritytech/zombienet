use std::time::Duration;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub enum Operator {
    Equal,
    NotEqual,
    IsAbove,
    IsAtLeast,
    IsBelow,
    IsAtMost,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct Comparison {
    pub op: Operator,
    pub target_value: u64,
}

type ParaId = u16;
type NodeName = String;

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "fn", content = "args")]
pub enum AssertionKind {
    IsUp {
        node_name: NodeName,
        #[serde(with = "optional_timeout")]
        timeout: Option<Duration>,
    },
    ParaIsRegistered {
        node_name: NodeName,
        para_id: ParaId,
        #[serde(with = "optional_timeout")]
        timeout: Option<Duration>,
    },
    ParaBlockHeight {
        node_name: NodeName,
        para_id: ParaId,
        op: Operator,
        target_value: u64,
        #[serde(with = "optional_timeout")]
        timeout: Option<Duration>,
    },
    ParaRuntimeUpgrade {
        node_name: NodeName,
        para_id: ParaId,
        file_or_uri: String,
        #[serde(with = "optional_timeout")]
        timeout: Option<Duration>,
    },
    ParaRuntimeDummyUpgrade {
        node_name: NodeName,
        para_id: ParaId,
        #[serde(with = "optional_timeout")]
        timeout: Option<Duration>,
    },
    Histogram {
        node_name: NodeName,
        metric_name: String,
        op: Operator,
        target_value: u64,
        buckets: String,
        #[serde(with = "optional_timeout")]
        timeout: Option<Duration>,
    },
    Report {
        node_name: NodeName,
        metric_name: String,
        op: Operator,
        target_value: u64,
        #[serde(with = "optional_timeout")]
        timeout: Option<Duration>,
    },
    LogMatch {
        node_name: NodeName,
        match_type: String,
        pattern: String,
        #[serde(with = "optional_timeout")]
        timeout: Option<Duration>,
    },
    Trace {
        node_name: NodeName,
        span_id: String,
        pattern: String,
        #[serde(with = "optional_timeout")]
        timeout: Option<Duration>,
    },
    SystemEvent {
        node_name: NodeName,
        match_type: String,
        pattern: String,
        #[serde(with = "optional_timeout")]
        timeout: Option<Duration>,
    },
    CustomJs {
        node_name: NodeName,
        file_path: String,
        custom_args: Option<String>,
        #[serde(flatten)]
        cmp: Option<Comparison>,
        #[serde(with = "optional_timeout")]
        timeout: Option<Duration>,
    },
    CustomSh {
        node_name: NodeName,
        file_path: String,
        custom_args: Option<String>,
        #[serde(flatten)]
        cmp: Option<Comparison>,
        #[serde(with = "optional_timeout")]
        timeout: Option<Duration>,
    },
    Pause {
        node_name: NodeName,
    },
    Resume {
        node_name: NodeName,
    },
    Restart {
        node_name: NodeName,
        #[serde(with = "optional_timeout")]
        after: Option<Duration>,
    },
    Sleep {
        #[serde(with = "optional_timeout")]
        seconds: Option<Duration>,
    },
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct Assertion {
    pub original_line: String,
    pub parsed: AssertionKind,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct TestDefinition {
    pub description: Option<String>,
    pub network: String,
    pub creds: String,
    pub assertions: Vec<Assertion>,
}

pub mod optional_timeout {

    use std::time::Duration;

    use serde::{self, Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(timeout: &Option<Duration>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match timeout {
            Some(secs) => serializer.serialize_some(&secs.as_secs()),
            None => serializer.serialize_none(),
        }
    }

    /// Attempts to deserialize an u64 as Option<Duration>
    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<Duration>, D::Error>
    where
        D: Deserializer<'de>,
    {

        match u64::deserialize(deserializer) {
            Ok(s) => {
                Ok(Some(Duration::from_secs(s)))
            }
            Err(_) => {
                // If we can deserialize to an u64 deserialize to None
                Ok(None)
            }
        }
    }
}
