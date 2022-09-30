#[derive(Debug, thiserror::Error)]
#[allow(missing_docs)]
pub enum ParserError {
    #[error("Error parsing file: {0}")]
    ParseError(String),
    #[error("Invalid matching rule. \n {0}")]
    InvalidRule(String),
    #[error("Missing fields: {0}")]
    MissingFields(String),
    #[error("Serialization Error")]
    SerializationError,
    #[error("Unexpected rule: \n {0}")]
    Unexpected(String),
    #[error("Unreachable rule: \n {0}")]
    UnreachableRule(String),
}
