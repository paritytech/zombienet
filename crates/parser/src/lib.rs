use std::path::PathBuf;
use std::time::Duration;

use pest::{
    iterators::{Pair, Pairs},
    Parser,
};
use pest_derive::Parser;

pub mod ast;
mod errors;
use errors::ParserError;

use ast::{Assertion, AssertionKind, Comparison, NodeName, ParaId, TestDefinition};

#[cfg(test)]
mod tests;

enum ScriptType {
    Javascript,
    Typescript,
    Shellscript,
}

// This include forces recompiling this source file if the grammar file changes.
// Uncomment it when doing changes to the .pest file
const _GRAMMAR: &str = include_str!("zombienet.pest");

#[derive(Parser)]
#[grammar = "zombienet.pest"]
pub struct ZombieNetParser;

fn parse_name(pair: Pair<Rule>) -> Result<NodeName, ParserError> {
    // get the first inner pair, since we don't want the `:`
    match pair.into_inner().next() {
        Some(p) => Ok(p.as_str().to_string()),
        None => Err(ParserError::Unexpected(String::from(
            "Rule should have an inner rule",
        ))),
    }
}

fn parse_within(pair: Pair<Rule>) -> Result<Duration, ParserError> {
    let within = pair.into_inner().as_str();
    Ok(Duration::from_secs(within.parse::<u64>().map_err(
        |_| ParserError::ParseError(format!("Can't parse {within} as u64")),
    )?))
}

fn parse_para_id(pair: Pair<Rule>) -> Result<ParaId, ParserError> {
    let para_id_str = pair.into_inner().as_str();
    para_id_str
        .parse::<u16>()
        .map_err(|_| ParserError::ParseError(format!("Can't parse {para_id_str} as u16")))
}

fn parse_taget_value(pair: Pair<Rule>) -> Result<u64, ParserError> {
    let target_str = pair.as_str();
    target_str
        .parse::<u64>()
        .map_err(|_| ParserError::ParseError(format!("Can't parse {target_str} as u64")))
}

fn parse_comparison(pair: Pair<Rule>) -> Result<ast::Comparison, ParserError> {
    let mut inner_pairs = pair.into_inner();
    let op_rule = get_pair(&mut inner_pairs, "op_rule")?;
    let op = match op_rule.as_rule() {
        Rule::op_lte => ast::Operator::IsAtMost,
        Rule::op_gte => ast::Operator::IsAtLeast,
        Rule::op_lt => ast::Operator::IsBelow,
        Rule::op_gt => ast::Operator::IsAbove,
        Rule::op_eq => ast::Operator::Equal,
        Rule::op_ineq => ast::Operator::NotEqual,
        _ => {
            return Err(ParserError::UnreachableRule(format!("{op_rule:?}")));
        }
    };

    let target_value_str = get_pair(&mut inner_pairs, "target_value")?.as_str();
    let target_value = target_value_str
        .parse::<u64>()
        .map_err(|_| ParserError::ParseError(format!("Can't parse {target_value_str} as u64")))?;

    Ok(ast::Comparison { op, target_value })
}

fn parse_match_pattern_rule(
    record: Pair<Rule>,
) -> Result<(String, String, String, Option<Duration>), ParserError> {
    let mut pairs = record.into_inner();
    let name = parse_name(get_pair(&mut pairs, "name")?)?;

    let mut explicit_match_type = false;

    let pair = get_pair(&mut pairs, "match_type")?;
    let match_type = if let Rule::match_type = pair.as_rule() {
        explicit_match_type = true;
        pair.as_str().to_owned()
    } else {
        String::from("regex")
    };

    let pattern_pair = if explicit_match_type {
        get_pair(&mut pairs, "pattern")?
    } else {
        pair
    };

    let pattern = pattern_pair.as_str().trim_matches('"').to_owned();
    let timeout: Option<Duration> = if let Some(within_rule) = pairs.next() {
        Some(parse_within(within_rule)?)
    } else {
        None
    };

    Ok((name, match_type, pattern, timeout))
}

fn parse_lines_count_match_pattern_rule(
    record: Pair<Rule>,
) -> Result<(String, String, String, ast::Comparison, Option<Duration>), ParserError> {
    let mut pairs = record.into_inner();
    let name = parse_name(get_pair(&mut pairs, "name")?)?;

    let mut explicit_match_type = false;

    let pair = get_pair(&mut pairs, "match_type")?;
    let match_type = if let Rule::match_type = pair.as_rule() {
        explicit_match_type = true;
        pair.as_str().to_owned()
    } else {
        String::from("regex")
    };

    let pattern_pair = if explicit_match_type {
        get_pair(&mut pairs, "pattern")?
    } else {
        pair
    };

    let pattern = pattern_pair.as_str().trim_matches('"').to_owned();

    let cmp_rule = get_pair(&mut pairs, "cmp_rule")?;
    let comparison: ast::Comparison = match cmp_rule.as_rule() {
        Rule::int => ast::Comparison {
            op: ast::Operator::Equal,
            target_value: parse_taget_value(cmp_rule)?,
        },
        Rule::comparison => parse_comparison(cmp_rule)?,
        _ => {
            return Err(ParserError::UnreachableRule(pairs.as_str().to_string()));
        }
    };

    let timeout: Option<Duration> = if let Some(within_rule) = pairs.next() {
        Some(parse_within(within_rule)?)
    } else {
        None
    };

    Ok((name, match_type, pattern, comparison, timeout))
}

fn parse_custom_script_rule(
    record: Pair<Rule>,
    script_type: ScriptType,
) -> Result<AssertionKind, ParserError> {
    let mut pairs = record.into_inner();
    let node_name = parse_name(get_pair(&mut pairs, "name")?)?;
    let file_path_str = get_pair(&mut pairs, "file_path")?.as_str();
    let file_path: PathBuf = file_path_str
        .try_into()
        .map_err(|_| errors::ParserError::ParseError(format!("Invalid path: {file_path_str}")))?;

    let mut args: Option<String> = None;
    let mut cmp: Option<Comparison> = None;
    let mut timeout = None;

    for inner_record in pairs {
        match inner_record.as_rule() {
            Rule::double_quoted_string => {
                args = Some(inner_record.as_str().trim_matches('"').to_owned());
            }
            Rule::comparison => {
                cmp = Some(parse_comparison(inner_record)?);
            }
            Rule::within => {
                timeout = Some(parse_within(inner_record)?);
            }
            _ => {
                return Err(ParserError::UnreachableRule(
                    inner_record.as_str().to_string(),
                ));
            }
        }
    }

    match script_type {
        ScriptType::Javascript => Ok(AssertionKind::CustomJs {
            node_name,
            file_path,
            custom_args: args,
            cmp,
            timeout,
            is_ts: false,
        }),
        ScriptType::Typescript => Ok(AssertionKind::CustomJs {
            node_name,
            file_path,
            custom_args: args,
            cmp,
            timeout,
            is_ts: true,
        }),
        ScriptType::Shellscript => Ok(AssertionKind::CustomSh {
            node_name,
            file_path,
            custom_args: args,
            cmp,
            timeout,
        }),
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

    let top_level_rule = if let Some(p) = pairs.next() {
        p
    } else {
        return Err(ParserError::Unexpected(String::from(
            "Invalid top level rule",
        )));
    };

    for record in top_level_rule.into_inner() {
        let original_line = record.as_str().trim_end().to_string();

        match record.as_rule() {
            Rule::description => {
                description = Some(record.into_inner().as_str().to_owned());
            }
            Rule::network => {
                network = Some(record.into_inner().as_str().to_owned());
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
                // Pairs should be in order:
                // name, [timeout]
                let mut pairs = record.into_inner();
                let name = parse_name(get_pair(&mut pairs, "name")?)?;

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
                // Pairs should be in order:
                // name, para_id, [timeout]
                let mut pairs = record.into_inner();
                let name = parse_name(get_pair(&mut pairs, "name")?)?;
                let para_id = parse_para_id(get_pair(&mut pairs, "para_id")?)?;

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
                // Pairs should be in order:
                // name, para_id, comparison, [timeout]
                let mut pairs = record.into_inner();
                let name = parse_name(get_pair(&mut pairs, "name")?)?;
                let para_id = parse_para_id(get_pair(&mut pairs, "para_id")?)?;
                let comparison = parse_comparison(get_pair(&mut pairs, "comparison")?)?;

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
                // Pairs should be in order:
                // name, para_id, file_or_uri, [timeout]
                let mut pairs = record.into_inner();
                let name = parse_name(get_pair(&mut pairs, "name")?)?;
                let para_id = parse_para_id(get_pair(&mut pairs, "para_id")?)?;
                let file_or_uri = get_pair(&mut pairs, "file_or_uri")?.as_str().to_string();
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
                // Pairs should be in order:
                // name, para_id, [timeout]
                let mut pairs = record.into_inner();
                let name = parse_name(get_pair(&mut pairs, "name")?)?;
                let para_id = parse_para_id(get_pair(&mut pairs, "para_id")?)?;

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
                // Pairs should be in order:
                // name, metric_name, cmp, buckets, [timeout]
                let mut pairs = record.into_inner();
                let name = parse_name(get_pair(&mut pairs, "name")?)?;
                let metric_name = get_pair(&mut pairs, "metric_name")?.as_str().to_string();
                let cmp_rule = get_pair(&mut pairs, "cmp_rule")?;
                let cmp: ast::Comparison = match cmp_rule.as_rule() {
                    Rule::int => ast::Comparison {
                        op: ast::Operator::Equal,
                        target_value: parse_taget_value(cmp_rule)?,
                    },
                    Rule::comparison => parse_comparison(cmp_rule)?,
                    _ => {
                        return Err(ParserError::UnreachableRule(pairs.as_str().to_string()));
                    }
                };
                let buckets = get_pair(&mut pairs, "buckets")?
                    .as_str()
                    .trim_matches(|x| x == '[' || x == ']')
                    .split(',')
                    .map(|x| x.trim().trim_matches('"').to_string())
                    .collect();

                let timeout: Option<Duration> = if let Some(within_rule) = pairs.next() {
                    Some(parse_within(within_rule)?)
                } else {
                    None
                };

                let assertion = Assertion {
                    parsed: AssertionKind::Histogram {
                        node_name: name,
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
                // Pairs should be in order:
                // name, metric_name, cmp, [timeout]
                let mut pairs = record.into_inner();
                let name = parse_name(get_pair(&mut pairs, "name")?)?;
                let metric_name = get_pair(&mut pairs, "metric_name")?.as_str().to_string();
                let cmp = parse_comparison(get_pair(&mut pairs, "cmp_rule")?)?;
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
            Rule::count_log_match => {
                let (name, match_type, pattern, comparison, timeout) =
                    parse_lines_count_match_pattern_rule(record)?;

                let assertion = Assertion {
                    parsed: AssertionKind::CountLogMatch {
                        node_name: name,
                        match_type,
                        pattern,
                        target_value: comparison.target_value,
                        op: comparison.op,
                        timeout,
                    },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::trace => {
                // Pairs should be in order:
                // name, span_id, pattern, [timeout]
                let mut pairs = record.into_inner();
                let name = parse_name(get_pair(&mut pairs, "name")?)?;
                let span_id = get_pair(&mut pairs, "span_id")?.as_str().to_string();
                let pattern = get_pair(&mut pairs, "pattern")?.as_str().to_string();

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
                let parsed = parse_custom_script_rule(record, ScriptType::Javascript)?;
                let assertion = Assertion {
                    parsed,
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::custom_ts => {
                let parsed = parse_custom_script_rule(record, ScriptType::Typescript)?;
                let assertion = Assertion {
                    parsed,
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::custom_sh => {
                let parsed = parse_custom_script_rule(record, ScriptType::Shellscript)?;
                let assertion = Assertion {
                    parsed,
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::sleep => {
                // Pairs should be in order:
                // timeout
                let mut pairs = record.into_inner();
                let seconds = get_pair(&mut pairs, "seconds")?
                    .as_str()
                    .parse::<u64>()
                    .map_err(|_| {
                        errors::ParserError::ParseError(String::from("Invalid secs value"))
                    })?;

                let assertion = Assertion {
                    parsed: AssertionKind::Sleep {
                        seconds: Some(Duration::from_secs(seconds)),
                    },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::pause => {
                // Pairs should be in order:
                // name
                let mut pairs = record.into_inner();
                let name = parse_name(get_pair(&mut pairs, "name")?)?;

                let assertion = Assertion {
                    parsed: AssertionKind::Pause { node_name: name },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::resume => {
                // Pairs should be in order:
                // name
                let mut pairs = record.into_inner();
                let name = parse_name(get_pair(&mut pairs, "name")?)?;

                let assertion = Assertion {
                    parsed: AssertionKind::Resume { node_name: name },
                    original_line,
                };

                assertions.push(assertion);
            }
            Rule::restart => {
                // Pairs should be in order:
                // name
                let mut pairs = record.into_inner();
                let name = parse_name(get_pair(&mut pairs, "name")?)?;

                let after: Option<Duration> = if let Some(after_rule) = pairs.next() {
                    Some(Duration::from_secs(after_rule.as_str().parse().map_err(
                        |_| ParserError::ParseError(format!("Invalid after value, {after_rule}")),
                    )?))
                } else {
                    None
                };

                let assertion = Assertion {
                    parsed: AssertionKind::Restart {
                        node_name: name,
                        after,
                    },
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

    // unwrap here should be face because of the above test.
    let test_def = TestDefinition {
        description,
        network: network.unwrap(),
        creds: creds.unwrap(),
        assertions,
    };

    Ok(test_def)
}

/// helper
fn get_pair<'a>(
    pairs: &mut Pairs<'a, Rule>,
    rule_name: &'a str,
) -> Result<Pair<'a, Rule>, ParserError> {
    match pairs.next() {
        Some(p) => Ok(p),
        None => Err(ParserError::Unexpected(format!(
            "Pair {rule_name} should exists"
        ))),
    }
}
