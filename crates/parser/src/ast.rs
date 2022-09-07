use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub enum Operator {
    Equal,
    NotEqual,
    IsAbove,
    IsAtLeast,
    IsBelow,
    IsAtMost
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct Comparison {
    pub op: Operator,
    pub target_value: u64,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "fn", content = "args")]
pub enum AssertionKind {
    IsUp {
        node_name: String,
        timeout: Option<u32>,
    },
    ParaIsRegistered {
        node_name: String,
        para_id: u16,
        timeout: Option<u32>,
    },
    ParaBlockHeight {
        node_name: String,
        para_id: u16,
        op: Operator,
        target_value: u64,
        timeout: Option<u32>,
    },
    ParaRuntimeUpgrade {
        node_name: String,
        para_id: u16,
        file_or_uri: String,
        timeout: Option<u32>,
    },
    ParaRuntimeDummyUpgrade {
        node_name: String,
        para_id: u16,
        timeout: Option<u32>,
    },
    Histogram {
        node_name: String,
        metric_name: String,
        op: Operator,
        target_value: u64,
        buckets: String,
        timeout: Option<u32>,
    },
    Report {
        node_name: String,
        metric_name: String,
        op: Operator,
        target_value: u64,
        timeout: Option<u32>,
    },
    LogMatch {
        node_name: String,
        match_type: String,
        pattern: String,
        timeout: Option<u32>,
    },
    Trace {
        node_name: String,
        span_id: String,
        pattern: String,
        timeout: Option<u32>,
    },
    SystemEvent {
        node_name: String,
        match_type: String,
        pattern: String,
        timeout: Option<u32>,
    },
    CustomJs {
        node_name: String,
        file_path: String,
        custom_args: Option<String>,
        #[serde(flatten)]
        cmp: Option<Comparison>,
        timeout: Option<u32>,
    },
    CustomSh {
        node_name: String,
        file_path: String,
        custom_args: Option<String>,
        #[serde(flatten)]
        cmp: Option<Comparison>,
        timeout: Option<u32>,
    },
    Pause {
        node_name: String,
    },
    Resume {
        node_name: String,
    },
    Restart {
        node_name: String,
        after: Option<u32>
    },
    Sleep {
        seconds: u32
    }
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
