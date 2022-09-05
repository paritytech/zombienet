use pest::Parser;
use pest_derive::Parser;

mod ast;
mod errors;

// This include forces recompiling this source file if the grammar file changes.
// Uncomment it when doing changes to the .pest file
const _GRAMMAR: &str = include_str!("zombienet.pest");

#[derive(Parser)]
#[grammar = "zombienet.pest"]
pub struct ZombieNetParser;

pub fn parse(unparsed_file: &str) -> Result<(),errors::ParserError> {
    println!("{}",unparsed_file);
    let mut pairs = match ZombieNetParser::parse(Rule::file, unparsed_file) {
        Ok(p) => p,
        Err(e) => return Err(errors::ParserError::ParseError(e.to_string()))
    };

    for record in pairs.next().unwrap().into_inner() {
        match record.as_rule() {
            Rule::description => {},
            Rule::network => {}
            Rule::creds => {},
            Rule::is_up => {
                let rules = record.into_inner();
                println!("{:?}", rules);
            },
            Rule::para_is_registered => {},
            Rule::para_block_height => {},
            Rule::para_runtime_upgrade => {},
            Rule::para_runtime_dummy_upgrade => {},
            Rule::histogram => {},
            Rule::report => {},
            Rule::log_match => {},
            Rule::trace => {},
            Rule::system_event => {},
            Rule::custom_js => {},
            Rule::custom_sh => {},
            Rule::sleep => {},
            Rule::pause => {},
            Rule::resume => {},
            Rule::restart => {},
            Rule::EOI |
            Rule::comment => (),
            _ => {
                println!("{:?}", record);
            } //unreachable!(),
        }
    }

    return Ok(());
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_up_parse_ok() {
        let result = parse("alice: is up").unwrap();
        assert_eq!(result, ());
    }

    #[test]
    fn is_up_parse_err() {
        let result = parse("alice: is upp");
        assert!(result.is_err());
    }
}
