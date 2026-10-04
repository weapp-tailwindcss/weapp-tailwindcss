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

fn transform_literal(
    value: &str,
    class_names: &HashSet<String>,
    escape: &EscapeTable,
    options: &JsTransformOptions,
    class_context: bool,
    plans: &mut HashMap<(String, bool), Option<String>>,
) -> Option<Option<String>> {
    let source = if options.unescape_unicode == Some(true) && value.contains("\\u") {
        decode::decode(value)?
    } else {
        value.to_owned()
    };
    let mut transformed = source.clone();
    let mut mutated = false;
    for candidate in candidates::split(&source) {
        let plan = plans
            .entry((candidate.clone(), class_context))
            .or_insert_with(|| {
                // 默认回调的保留决策优先于 alwaysEscape 与集合命中。
                if options.preserve_star == Some(true) && candidate == "*" {
                    return None;
                }
                if options.always_escape != Some(true)
                    && !class_context
                    && candidates::is_plain_slash_path(&candidate)
                {
                    return None;
                }
                let escaped = escape.escape(&candidate);
                if options.always_escape == Some(true)
                    || class_names.contains(&candidate)
                    || (escaped != candidate && class_names.contains(&escaped))
                {
                    Some(escaped)
                } else {
                    None
                }
            });
        if let Some(replacement) = plan {
            let replaced = replace_first(&transformed, &candidate, replacement);
            if replaced != transformed {
                transformed = replaced;
                mutated = true;
            }
        }
    }
    Some(mutated.then_some(transformed))
}

struct Edit {
    start: usize,
    end: usize,
    value: String,
}

pub(super) fn transform(
    source: &str,
    analysis: &JsSourceAnalysis,
    class_names: &HashSet<String>,
    escape: &EscapeTable,
    options: &JsTransformOptions,
) -> Option<String> {
    if class_names.is_empty() && options.always_escape != Some(true) {
        return Some(source.to_owned());
    }
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
            let transformed = transform_literal(
                &literal.value,
                class_names,
                escape,
                options,
                literal.class_context,
                &mut plans,
            )?;
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
            end = end.checked_sub(1)?;
            if start >= end
                || transformed
                    .encode_utf16()
                    .eq(units.get(start..end)?.iter().copied())
            {
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
