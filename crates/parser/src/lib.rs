use std::time::Duration;

use pest::{iterators::Pair, Parser};
use pest_derive::Parser;

pub mod ast;
mod errors;
use errors::ParserError;

use ast::{Assertion, AssertionKind, Comparison, TestDefinition, NodeName, ParaId};

use wasm_bindgen::prelude::*;

#[cfg(test)]
mod tests;

// This include forces recompiling this source file if the grammar file changes.
// Uncomment it when doing changes to the .pest file
const _GRAMMAR: &str = include_str!("zombienet.pest");

#[derive(Parser)]
#[grammar = "zombienet.pest"]
pub struct ZombieNetParser;

fn parse_name(pair: Pair<Rule>) -> Result<NodeName, ParserError>{
    // get the first inner pair, since we don't want the `:`
    match pair.into_inner().next() {
        Some(p) => Ok(p.as_str().to_string()),
        None => Err(ParserError::Unexpected(String::from("Rule should have an inner rule")))
    }
}

fn parse_within(pair: Pair<Rule>) -> Result<Duration,ParserError> {
    let within = pair.into_inner().as_str();
    Ok(Duration::from_secs(
        within.parse::<u64>().map_err(|_| {ParserError::ParseError(format!("Can't parse {} as u64", within))})?)
    )
}

fn parse_para_id(pair: Pair<Rule>) -> Result<ParaId, ParserError> {
    let para_id_str = pair.into_inner().as_str();
    Ok(para_id_str.parse::<u16>().map_err(|_| {ParserError::ParseError(format!("Can't parse {} as u16", para_id_str))})?)
}

fn parse_taget_value(pair: Pair<Rule>) -> Result<u64, ParserError> {
    let target_str = pair.into_inner().as_str();
    Ok(
        target_str.parse::<u64>().map_err(|_| {ParserError::ParseError(format!("Can't parse {} as u64", target_str))})?
    )
}

fn parse_comparison(pair: Pair<Rule>) -> Result<ast::Comparison, ParserError> {
    let mut inner_pairs = pair.into_inner();
    let op_rule = inner_pairs.next().unwrap();
    let op = match op_rule.as_rule() {
        Rule::op_lte => ast::Operator::IsAtMost,
        Rule::op_gte => ast::Operator::IsAtLeast,
        Rule::op_lt => ast::Operator::IsBelow,
        Rule::op_gt => ast::Operator::IsAbove,
        Rule::op_eq => ast::Operator::Equal,
        Rule::op_ineq => ast::Operator::NotEqual,
        _ => {
            return Err(ParserError::UnreachableRule(format!("{:?}", op_rule)));
        }
    };

    let target_value = inner_pairs.next().unwrap().as_str().parse::<u64>().map_err(|_| {ParserError::ParseError(format!("Can't parse as u64"))})?;

    Ok(ast::Comparison { op, target_value })
}

fn parse_match_pattern_rule(record: Pair<Rule>) -> Result<(String, String, String, Option<Duration>), ParserError> {
    let mut pairs = record.into_inner();
    let name = parse_name(pairs.next().unwrap())?;

    let mut explicit_match_type = false;

    let pair = pairs.next().unwrap();
    let match_type = if let Rule::match_type = pair.as_rule() {
        explicit_match_type = true;
        pair.as_str().to_owned()
    } else {
        String::from("regex")
    };

    let pattern_pair = if explicit_match_type {
        pairs.next().unwrap()
    } else {
        pair
    };

    let pattern = pattern_pair.as_str().to_owned();
    let timeout: Option<Duration> = if let Some(within_rule) = pairs.next() {
        Some(parse_within(within_rule)?)
    } else {
        None
    };

    Ok((name, match_type, pattern, timeout))
}

fn parse_custom_script_rule(record: Pair<Rule>, is_js: bool) -> Result<AssertionKind,ParserError> {
    let mut pairs = record.into_inner();
    let node_name = parse_name(pairs.next().unwrap())?;
    let file_path = pairs.next().unwrap().as_str().to_owned();

    let mut args: Option<String> = None;
    let mut cmp: Option<Comparison> = None;
    let mut timeout = None;

    for inner_record in pairs {
        match inner_record.as_rule() {
            Rule::square_brackets_strings => {
                args = Some(inner_record.as_str().to_owned());
            }
            Rule::comparison => {
                cmp = Some(parse_comparison(inner_record)?);
            }
            Rule::within => {
                timeout = Some(parse_within(inner_record)?);
            }
            _ => {
                return Err(ParserError::UnreachableRule(inner_record.as_str().to_string()));
            }
        }
    }

    if is_js {
        Ok(AssertionKind::CustomJs {
            node_name,
            file_path,
            custom_args: args,
            cmp,
            timeout,
        })
    } else {
        Ok(AssertionKind::CustomSh {
            node_name,
            file_path,
            custom_args: args,
            cmp,
            timeout,
        })
    }
}

/// Parse a `feature` file and return a `json string`
pub fn parse(unparsed_file: &str) -> Result<ast::TestDefinition, errors::ParserError> {
    let mut pairs = match ZombieNetParser::parse(Rule::file, unparsed_file) {
        Ok(p) => p,
        Err(e) => return Err(errors::ParserError::ParseError(e.to_string())),
    };

    let mut network: Option<String> = None;
    let mut creds: Option<String> = None;
    let mut description: Option<String> = None;
    let mut assertions: Vec<Assertion> = vec![];

    for record in pairs.next().unwrap().into_inner() {
        let original_line = record.as_str().to_owned();
        match record.as_rule() {
            Rule::description => {
                description = Some(record.into_inner().next().unwrap().as_str().to_owned());
            }
            Rule::network => {
                network = Some(record.into_inner().next().unwrap().as_str().to_owned());
            }
            Rule::creds => {
                let mut pairs = record.into_inner();
                creds = if let Some(creds_rule) = pairs.next() {
                    Some(creds_rule.into_inner().as_str().to_owned())
                } else {
                    Some(String::from("config"))
                };
            }
            Rule::is_up => {
                let mut pairs = record.into_inner();
                let name = parse_name(pairs.next().unwrap())?;
                let timeout: Option<Duration> = if let Some(within_rule) = pairs.next() {
                    Some(parse_within(within_rule)?)
                } else {
                    None
                };

                let assertion = Assertion {
                    parsed: AssertionKind::IsUp {
                        node_name: name,
                        timeout,
                    },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::para_is_registered => {
                let mut pairs = record.into_inner();
                let name = parse_name(pairs.next().unwrap())?;
                let para_id = parse_para_id(pairs.next().unwrap())?;
                let timeout: Option<Duration> = if let Some(within_rule) = pairs.next() {
                    Some(parse_within(within_rule)?)
                } else {
                    None
                };

                let assertion = Assertion {
                    parsed: AssertionKind::ParaIsRegistered {
                        node_name: name,
                        para_id,
                        timeout,
                    },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::para_block_height => {
                let mut pairs = record.into_inner();
                let name = parse_name(pairs.next().unwrap())?;
                let para_id = parse_para_id(pairs.next().unwrap())?;
                let comparison = parse_comparison(pairs.next().unwrap())?;
                let timeout: Option<Duration> = if let Some(within_rule) = pairs.next() {
                    Some(parse_within(within_rule)?)
                } else {
                    None
                };

                let assertion = Assertion {
                    parsed: AssertionKind::ParaBlockHeight {
                        node_name: name,
                        para_id,
                        op: comparison.op,
                        target_value: comparison.target_value,
                        timeout,
                    },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::para_runtime_upgrade => {
                let mut pairs = record.into_inner();
                let name = parse_name(pairs.next().unwrap())?;
                let para_id = parse_para_id(pairs.next().unwrap())?;
                let file_or_uri = pairs.next().unwrap().as_str().to_owned();
                let timeout: Option<Duration> = if let Some(within_rule) = pairs.next() {
                    Some(parse_within(within_rule)?)
                } else {
                    None
                };

                let assertion = Assertion {
                    parsed: AssertionKind::ParaRuntimeUpgrade {
                        node_name: name.to_owned(),
                        para_id,
                        file_or_uri,
                        timeout,
                    },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::para_runtime_dummy_upgrade => {
                let mut pairs = record.into_inner();
                let name = parse_name(pairs.next().unwrap())?;
                let para_id = parse_para_id(pairs.next().unwrap())?;
                let timeout: Option<Duration> = if let Some(within_rule) = pairs.next() {
                    Some(parse_within(within_rule)?)
                } else {
                    None
                };

                let assertion = Assertion {
                    parsed: AssertionKind::ParaRuntimeDummyUpgrade {
                        node_name: name.to_owned(),
                        para_id,
                        timeout,
                    },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::histogram => {
                let mut pairs = record.into_inner();
                let name = parse_name(pairs.next().unwrap())?;
                let metric_name = pairs.next().unwrap().as_str().to_owned();
                let cmp_rule = pairs.next().unwrap();
                let cmp: ast::Comparison = match cmp_rule.as_rule() {
                    Rule::int => ast::Comparison {
                        op: ast::Operator::Equal,
                        target_value: parse_taget_value(cmp_rule)?,
                    },
                    Rule::comparison => parse_comparison(cmp_rule)?,
                    _ => {
                        return Err( ParserError::UnreachableRule(pairs.as_str().to_string()));
                    }
                };

                let buckets = pairs.next().unwrap().as_str().to_owned();
                let timeout: Option<Duration> = if let Some(within_rule) = pairs.next() {
                    Some(parse_within(within_rule)?)
                } else {
                    None
                };

                let assertion = Assertion {
                    parsed: AssertionKind::Histogram {
                        node_name: name.to_owned(),
                        metric_name,
                        op: cmp.op,
                        target_value: cmp.target_value,
                        buckets,
                        timeout,
                    },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::report => {
                let mut pairs = record.into_inner();
                let name = parse_name(pairs.next().unwrap())?;
                let metric_name = pairs.next().unwrap().as_str().to_owned();
                let cmp = parse_comparison(pairs.next().unwrap())?;
                let timeout: Option<Duration> = if let Some(within_rule) = pairs.next() {
                    Some(parse_within(within_rule)?)
                } else {
                    None
                };

                let assertion = Assertion {
                    parsed: AssertionKind::Report {
                        node_name: name.to_owned(),
                        metric_name,
                        op: cmp.op,
                        target_value: cmp.target_value,
                        timeout,
                    },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::log_match => {
                let (name, match_type, pattern, timeout) = parse_match_pattern_rule(record)?;

                let assertion = Assertion {
                    parsed: AssertionKind::LogMatch {
                        node_name: name,
                        match_type,
                        pattern,
                        timeout,
                    },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::trace => {
                let mut pairs = record.into_inner();
                let name = parse_name(pairs.next().unwrap())?;

                let span_id = pairs.next().unwrap().as_str().to_owned();
                let pattern = pairs.next().unwrap().as_str().to_owned();
                let timeout: Option<Duration> = if let Some(within_rule) = pairs.next() {
                    Some(parse_within(within_rule)?)
                } else {
                    None
                };

                let assertion = Assertion {
                    parsed: AssertionKind::Trace {
                        node_name: name.to_owned(),
                        span_id,
                        pattern,
                        timeout,
                    },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::system_event => {
                let (name, match_type, pattern, timeout) = parse_match_pattern_rule(record)?;

                let assertion = Assertion {
                    parsed: AssertionKind::SystemEvent {
                        node_name: name,
                        match_type,
                        pattern,
                        timeout,
                    },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::custom_js => {
                let parsed = parse_custom_script_rule(record, true)?;
                let assertion = Assertion {
                    parsed,
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::custom_sh => {
                let parsed = parse_custom_script_rule(record, false)?;
                let assertion = Assertion {
                    parsed,
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::sleep => {
                let mut pairs = record.into_inner();
                let assertion = Assertion {
                    parsed: AssertionKind::Sleep {
                        seconds: Some(Duration::from_secs(
                            pairs.next().unwrap().as_str().parse().map_err(|_| errors::ParserError::ParseError(String::from("Invalid secs value")))?,
                        )),
                    },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::pause => {
                let mut pairs = record.into_inner();
                let assertion = Assertion {
                    parsed: AssertionKind::Pause {
                        node_name: parse_name(pairs.next().unwrap())?,
                    },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::resume => {
                let mut pairs = record.into_inner();
                let assertion = Assertion {
                    parsed: AssertionKind::Resume {
                        node_name: parse_name(pairs.next().unwrap())?,
                    },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::restart => {
                let mut pairs = record.into_inner();
                let node_name = parse_name(pairs.next().unwrap())?;
                let after: Option<Duration> = if let Some(after_rule) = pairs.next() {
                    Some(Duration::from_secs(
                        after_rule
                            .into_inner()
                            .as_str()
                            .parse()
                            .unwrap(),
                    ))
                } else {
                    None
                };

                let assertion = Assertion {
                    parsed: AssertionKind::Restart { node_name, after },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::EOI | Rule::comment => (),
            _ => {
                return Err(errors::ParserError::InvalidRule(record.as_str().to_owned()));
            }
        }
    }

    if network.is_none() || creds.is_none() {
        return Err(errors::ParserError::MissingFields(String::from(
            "Missing Network/Creds field",
        )));
    }

    let test_def = TestDefinition {
        description,
        network: network.unwrap(),
        creds: creds.unwrap(),
        assertions,
    };

    return Ok(test_def);
}

#[wasm_bindgen]
pub fn parse_to_json(unparsed_file: &str) -> Result<String, String> {
    if unparsed_file == "" {
        return Err("error".to_string());
    }
    let ast = parse(&unparsed_file).map_err(|e| e.to_string())?;
    let ast_json =
        serde_json::to_string_pretty(&ast).map_err(|_| "Serializing error".to_string())?;
    Ok(ast_json)
}
