use std::borrow::Cow;

use super::super::is_js_whitespace;

pub(super) struct EscapeTable {
    entries: [Option<String>; 128],
}

impl Default for EscapeTable {
    fn default() -> Self {
        Self {
            entries: std::array::from_fn(|_| None),
        }
    }
}

impl EscapeTable {
    pub(super) fn set(&mut self, character: u8, replacement: String) {
        self.entries[character as usize] = Some(replacement);
    }

    pub(super) fn escape(&self, candidate: &str) -> String {
        let mut result = String::with_capacity(candidate.len());
        let mut characters = candidate.chars().peekable();
        let mut head = true;
        while let Some(character) = characters.next() {
            if !character.is_ascii() {
                result.push_str(&format!("u_x{:x}_", character as u32));
            } else if let Some(value) = &self.entries[character as usize] {
                result.push_str(value);
            } else {
                if head
                    && (character.is_ascii_digit()
                        || (character == '-'
                            && characters.peek().is_none_or(|next| next.is_ascii_digit())))
                {
                    result.push('_');
                }
                result.push(character);
            }
            head = false;
        }
        result
    }
}

pub(super) fn is_plain_slash_path(candidate: &str) -> bool {
    if candidate.starts_with("//")
        || candidate.starts_with("http://")
        || candidate.starts_with("https://")
    {
        return true;
    }
    let Some(index) = candidate.find('/') else {
        return false;
    };
    index > 0 && !candidate.contains(['[', ']', ':']) && !candidate[..index].contains('-')
}

fn is_valid(candidate: &str) -> bool {
    candidate.chars().any(|character| {
        character.is_ascii_alphanumeric()
            || character == '_'
            || ('%'..='?').contains(&character)
            || character >= '\u{a0}'
    })
}

fn normalized(input: &str) -> Cow<'_, str> {
    if !input.contains('\\') {
        return Cow::Borrowed(input);
    }
    let mut output = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(character) = chars.next() {
        if character == '\\'
            && chars
                .peek()
                .is_some_and(|next| matches!(next, 'n' | 'r' | 't'))
        {
            chars.next();
            output.push(' ');
        } else {
            output.push(character);
        }
    }
    Cow::Owned(output)
}

fn closing_quote(input: &str, start: usize, quote: u8) -> bool {
    let bytes = input.as_bytes();
    let mut index = start;
    while index < bytes.len() {
        if bytes[index] == b'\\' {
            index += 2;
            continue;
        }
        if bytes[index] == quote {
            return bytes[index + 1..].contains(&b']');
        }
        index += 1;
    }
    false
}

/// 与 engine 的 bracket-aware scanner 保持一致，包括转义空白和未闭合引号规则。
pub(super) fn split(input: &str) -> Vec<String> {
    let input = normalized(input);
    let mut result = Vec::new();
    let mut depth = 0usize;
    let mut quote = None;
    let mut start = 0;
    let mut chars = input.char_indices();
    while let Some((index, character)) = chars.next() {
        if depth > 0 && character == '\\' {
            chars.next();
            continue;
        }
        if depth > 0 && matches!(character, '\'' | '"') {
            if quote == Some(character) {
                quote = None;
            } else if quote.is_none() && closing_quote(&input, index + 1, character as u8) {
                quote = Some(character);
            }
        }
        if quote.is_none() {
            if character == '[' && input[index + 1..].contains(']') {
                depth += 1;
            } else if character == ']' && depth > 0 {
                depth -= 1;
            }
        }
        if depth == 0 && (character == '"' || is_js_whitespace(character)) {
            let candidate = &input[start..index];
            if is_valid(candidate) {
                result.push(candidate.to_owned());
            }
            start = index + character.len_utf8();
        }
    }
    let candidate = &input[start..];
    if is_valid(candidate) {
        result.push(candidate.to_owned());
    }
    result
}
