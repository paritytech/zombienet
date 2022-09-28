use parser::parse;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn parse_to_json(unparsed_file: &str) -> Result<String, String> {
    if unparsed_file.is_empty() {
        return Err("error".to_string());
    }
    let ast = parse(unparsed_file).map_err(|e| e.to_string())?;
    let ast_json =
        serde_json::to_string_pretty(&ast).map_err(|_| "Serializing error".to_string())?;
    Ok(ast_json)
}
