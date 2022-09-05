#[derive(Debug, thiserror::Error)]
#[allow(missing_docs)]
pub enum ParserError {
	#[error("Error parsing file. \n {0}")]
	ParseError(String),
}