use serde::Serialize;

pub enum Kind {
    IsUp,
    ParaIsRegistered
}

#[derive(Debug, Serialize)]
#[serde(tag = "fn", content = "args")]
pub enum AssertionKind {
    IsUp { node_name: String, timeout: u32  },
    ParaIsRegistered { node_name: String, para_id: u16, timeout: u32 }
}

#[derive(Debug, Serialize)]
pub struct Assertion {
    original_line: String,
    parsed: AssertionKind
}

pub struct TestDefinition {
    description: String,
    network: String,
    creds: String,
    assertions: Vec<Assertion>
}