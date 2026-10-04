use napi::bindgen_prelude::{Uint32Array, Utf16String};
use napi_derive::napi;

#[derive(Clone, Copy)]
enum State {
    Start,
    Text,
    OpenBrace,
    PotentialClose,
    BracesComplete,
}

fn is_whitespace(unit: u16) -> bool {
    matches!(unit, 9 | 10 | 11 | 12 | 13 | 32 | 160 | 65279)
}

// 所有位置均是 UTF-16 索引；只返回位置，避免跨语言复制每个 token 的字符串。
fn tokenize(input: &[u16]) -> Vec<u32> {
    let mut state = State::Start;
    let mut result = Vec::new();
    let mut token_offset = 0;
    let mut expression_start = 0;
    for (index, unit) in input.iter().copied().enumerate() {
        match state {
            State::Start if is_whitespace(unit) => {}
            State::Start => {
                token_offset = result.len();
                result.extend_from_slice(&[index as u32, 0, 0]);
                state = if unit == 123 {
                    expression_start = index as u32;
                    State::OpenBrace
                } else {
                    State::Text
                };
            }
            State::Text | State::BracesComplete if is_whitespace(unit) => {
                result[token_offset + 1] = index as u32;
                state = State::Start;
            }
            State::Text | State::BracesComplete => {
                state = if unit == 123 {
                    expression_start = index as u32;
                    State::OpenBrace
                } else {
                    State::Text
                };
            }
            State::OpenBrace => {
                if unit == 125 {
                    state = State::PotentialClose;
                }
            }
            State::PotentialClose => {
                state = if unit == 125 {
                    result[token_offset + 2] += 1;
                    result.extend_from_slice(&[expression_start, index as u32 + 1]);
                    State::BracesComplete
                } else {
                    State::OpenBrace
                };
            }
        }
    }
    if !matches!(state, State::Start) {
        result[token_offset + 1] = input.len() as u32;
    }
    result
}

#[napi]
pub fn tokenize_wxml(input: Utf16String) -> Uint32Array {
    tokenize(&input).into()
}

#[cfg(test)]
mod tests {
    use super::tokenize;

    fn scan(input: &str) -> Vec<u32> {
        tokenize(&input.encode_utf16().collect::<Vec<_>>())
    }

    #[test]
    fn emits_empty_and_whitespace_inputs_without_tokens() {
        assert!(scan("").is_empty());
        assert!(scan("\t\n\u{b}\u{c}\r \u{a0}\u{feff}").is_empty());
        assert_eq!(scan("a\u{2003}b"), vec![0, 3, 0]);
    }

    #[test]
    fn scans_adjacent_expressions_and_plain_tokens() {
        assert_eq!(
            scan("x {{a}}{{b}} y"),
            vec![0, 1, 0, 2, 12, 2, 2, 7, 7, 12, 13, 14, 0]
        );
    }

    #[test]
    fn retains_existing_incomplete_and_nested_expression_semantics() {
        assert_eq!(scan("a { b"), vec![0, 1, 0, 2, 5, 0]);
        assert_eq!(scan("{a}}x"), vec![0, 5, 1, 0, 4]);
        assert_eq!(scan("{{a{{b}}}}"), vec![0, 10, 1, 0, 8]);
        assert_eq!(scan("{{a}b}}"), vec![0, 7, 1, 0, 7]);
    }

    #[test]
    fn preserves_utf16_units_including_lone_surrogates() {
        assert_eq!(scan("😀 {{中}}"), vec![0, 2, 0, 3, 8, 1, 3, 8]);
        assert_eq!(
            tokenize(&[0xd800, 32, 123, 123, 0xdc00, 125, 125]),
            vec![0, 1, 0, 2, 7, 1, 2, 7]
        );
    }
}
