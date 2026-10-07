use std::collections::{HashMap, HashSet};

use super::super::JsSourceAnalysis;
use super::{
    JsTransformOptions,
    candidates::{self, EscapeTable},
    decode,
};

fn js_string_escape(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    for character in input.chars() {
        match character {
            '"' | '\'' | '\\' => {
                output.push('\\');
                output.push(character);
            }
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\u{2028}' => output.push_str("\\u2028"),
            '\u{2029}' => output.push_str("\\u2029"),
            _ => output.push(character),
        }
    }
    output
}

// JS String.replace 的字符串 replacement 会展开 $$、$&、$` 和 $'，不能用 Rust replacen 替代。
fn replace_first(input: &str, candidate: &str, replacement: &str) -> String {
    let Some(start) = input.find(candidate) else {
        return input.to_owned();
    };
    let end = start + candidate.len();
    let mut output = String::with_capacity(input.len() + replacement.len());
    output.push_str(&input[..start]);
    let mut chars = replacement.chars().peekable();
    while let Some(character) = chars.next() {
        if character == '$' {
            match chars.peek() {
                Some('$') => {
                    output.push('$');
                    chars.next();
                    continue;
                }
                Some('&') => {
                    output.push_str(candidate);
                    chars.next();
                    continue;
                }
                Some('`') => {
                    output.push_str(&input[..start]);
                    chars.next();
                    continue;
                }
                Some('\'') => {
                    output.push_str(&input[end..]);
                    chars.next();
                    continue;
                }
                _ => {}
            }
        }
        output.push(character);
    }
    output.push_str(&input[end..]);
    output
}

struct Membership<F> {
    contains: F,
    values: HashMap<String, bool>,
}

impl<F> Membership<F> {
    fn contains<E>(&mut self, candidate: &str) -> Result<bool, E>
    where
        F: FnMut(&str) -> Result<bool, E>,
    {
        if let Some(value) = self.values.get(candidate) {
            return Ok(*value);
        }
        let value = (self.contains)(candidate)?;
        self.values.insert(candidate.to_owned(), value);
        Ok(value)
    }
}

fn transform_literal<E>(
    value: &str,
    membership: &mut Membership<impl FnMut(&str) -> Result<bool, E>>,
    escape: &EscapeTable,
    options: &JsTransformOptions,
    class_context: bool,
    plans: &mut HashMap<(String, bool), Option<String>>,
) -> Result<Option<Option<String>>, E> {
    let source = if options.unescape_unicode == Some(true) && value.contains("\\u") {
        let Some(decoded) = decode::decode(value) else {
            return Ok(None);
        };
        decoded
    } else {
        value.to_owned()
    };
    let mut transformed = source.clone();
    let mut mutated = false;
    for candidate in candidates::split(&source) {
        let plan = match plans.entry((candidate.clone(), class_context)) {
            std::collections::hash_map::Entry::Occupied(entry) => entry.into_mut(),
            std::collections::hash_map::Entry::Vacant(entry) => {
                // 保留策略和业务路径先于集合查询，不触发无意义的跨 ABI 调用。
                let preserved = options.preserve_star == Some(true) && candidate == "*";
                let business_path = options.always_escape != Some(true)
                    && !class_context
                    && candidates::is_plain_slash_path(&candidate);
                let replacement = if preserved || business_path {
                    None
                } else {
                    let escaped = escape.escape(&candidate);
                    if options.always_escape == Some(true)
                        || membership.contains(&candidate)?
                        || (escaped != candidate && membership.contains(&escaped)?)
                    {
                        Some(escaped)
                    } else {
                        None
                    }
                };
                entry.insert(replacement)
            }
        };
        if let Some(replacement) = plan {
            let replaced = replace_first(&transformed, &candidate, replacement);
            if replaced != transformed {
                transformed = replaced;
                mutated = true;
            }
        }
    }
    Ok(Some(mutated.then_some(transformed)))
}

struct Edit {
    start: usize,
    end: usize,
    value: String,
}

pub(super) fn transform<E>(
    source: &str,
    analysis: &JsSourceAnalysis,
    escape: &EscapeTable,
    options: &JsTransformOptions,
    contains: impl FnMut(&str) -> Result<bool, E>,
) -> Result<Option<String>, E> {
    let mut membership = Membership {
        contains,
        values: HashMap::new(),
    };
    let units: Vec<u16> = source.encode_utf16().collect();
    let mut edits = Vec::new();
    let mut plans = HashMap::new();
    let mut literals: HashMap<(&str, bool), Option<String>> = HashMap::new();
    for literal in &analysis.literals {
        if literal.is_condition_test {
            continue;
        }
        let key = (literal.value.as_str(), literal.class_context);
        if let std::collections::hash_map::Entry::Vacant(entry) = literals.entry(key) {
            let Some(transformed) = transform_literal(
                &literal.value,
                &mut membership,
                escape,
                options,
                literal.class_context,
                &mut plans,
            )?
            else {
                return Ok(None);
            };
            entry.insert(transformed);
        }
        let Some(transformed) = &literals[&key] else {
            continue;
        };
        if transformed.is_empty() {
            continue;
        }
        let (mut start, mut end) = (literal.start as usize, literal.end as usize);
        let replacement = if literal.kind == "string" {
            start += 1;
            let Some(inner_end) = end.checked_sub(1) else {
                return Ok(None);
            };
            end = inner_end;
            if start >= end {
                continue;
            }
            let Some(original) = units.get(start..end) else {
                return Ok(None);
            };
            if transformed.encode_utf16().eq(original.iter().copied()) {
                continue;
            }
            js_string_escape(transformed)
        } else {
            if transformed == &literal.value {
                continue;
            }
            if start >= end {
                continue;
            }
            transformed.clone()
        };
        edits.push(Edit {
            start,
            end,
            value: replacement,
        });
    }
    Ok(render(source, &units, edits))
}

/// 收集一次转换中需要查询的候选，并保持与逐个查询相同的过滤顺序。
///
/// 批量 ABI 只改变跨 Node-API 的次数，不改变 Rust 内部的候选与替换规则。
fn collect_membership_candidates(
    analysis: &JsSourceAnalysis,
    escape: &EscapeTable,
    options: &JsTransformOptions,
) -> Option<Vec<String>> {
    let mut seen = HashSet::new();
    let mut queries = Vec::new();
    for literal in &analysis.literals {
        if literal.is_condition_test {
            continue;
        }
        let source = if options.unescape_unicode == Some(true) && literal.value.contains("\\u") {
            decode::decode(&literal.value)?
        } else {
            literal.value.clone()
        };
        for candidate in candidates::split(&source) {
            let preserved = options.preserve_star == Some(true) && candidate == "*";
            let business_path = options.always_escape != Some(true)
                && !literal.class_context
                && candidates::is_plain_slash_path(&candidate);
            if preserved || business_path || options.always_escape == Some(true) {
                continue;
            }
            if seen.insert(candidate.clone()) {
                queries.push(candidate.clone());
            }
            let escaped = escape.escape(&candidate);
            if escaped != candidate && seen.insert(escaped.clone()) {
                queries.push(escaped);
            }
        }
    }
    Some(queries)
}

/// 使用一次批量成员查询完成转换，供生产 Node-API adapter 降低回调次数。
pub(super) fn transform_with_batch<E>(
    source: &str,
    analysis: &JsSourceAnalysis,
    escape: &EscapeTable,
    options: &JsTransformOptions,
    contains_many: impl FnOnce(Vec<String>) -> Result<Vec<bool>, E>,
) -> Result<Option<String>, E> {
    let queries = match collect_membership_candidates(analysis, escape, options) {
        Some(queries) => queries,
        None => return Ok(None),
    };
    let values = contains_many(queries.clone())?;
    if values.len() != queries.len() {
        return Ok(None);
    }
    let membership: HashMap<String, bool> = queries.into_iter().zip(values).collect();
    transform(source, analysis, escape, options, |candidate| {
        Ok::<_, E>(membership.get(candidate).copied().unwrap_or(false))
    })
}

fn render(source: &str, units: &[u16], mut edits: Vec<Edit>) -> Option<String> {
    if edits.is_empty() {
        return Some(source.to_owned());
    }
    edits.sort_by_key(|edit| edit.start);
    let mut output = Vec::with_capacity(units.len());
    let mut cursor = 0;
    for edit in edits {
        // 重叠区间不自行猜测覆盖次序，交还原有兼容实现。
        if edit.start < cursor {
            return None;
        }
        output.extend_from_slice(units.get(cursor..edit.start)?);
        output.extend(edit.value.encode_utf16());
        cursor = edit.end;
    }
    output.extend_from_slice(units.get(cursor..)?);
    String::from_utf16(&output).ok()
}

#[cfg(test)]
mod tests {
    use super::replace_first;
    #[test]
    fn preserves_javascript_replacement_dollar_semantics() {
        assert_eq!(
            replace_first("x abc z", "abc", "[$$][$&][$`][$']"),
            "x [$][abc][x ][ z] z"
        );
        assert_eq!(replace_first("abc", "abc", "$1$0$x"), "$1$0$x");
    }
}
