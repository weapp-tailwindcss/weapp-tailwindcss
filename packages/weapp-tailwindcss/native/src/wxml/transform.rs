use napi::bindgen_prelude::{Function, Utf16String};
use napi_derive::napi;

mod escape;
#[cfg(test)]
mod tests;

use escape::EscapeTable;

#[napi(object)]
pub struct WxmlEscapeEntry {
    pub character: Utf16String,
    pub replacement: Utf16String,
}

#[napi]
pub struct WxmlTransformer {
    escape: EscapeTable,
}

// 对齐 JavaScript /\S+/；WXML token 分隔符是更小的历史集合，两者不能混用。
fn is_js_whitespace(unit: u16) -> bool {
    matches!(unit, 9..=13 | 32 | 160 | 5760 | 8192..=8202 | 8232 | 8233 | 8239 | 8287 | 12288 | 65279)
}

impl WxmlTransformer {
    fn transform<E>(
        &self,
        input: &[u16],
        exact: bool,
        mut contains: impl FnMut(&[u16]) -> Result<bool, E>,
    ) -> Result<Option<Vec<u16>>, E> {
        let spans = super::tokenize(input);
        let mut cursor = 0;
        while cursor < spans.len() {
            let count = spans[cursor + 2] as usize;
            // 必须在任何回调前拒绝动态表达式，不能部分执行后再回退。
            if count > 0 {
                return Ok(None);
            }
            cursor += 3;
        }
        if spans.is_empty() {
            return Ok(Some(input.to_vec()));
        }
        let mut output = Vec::with_capacity(input.len());
        let mut previous_end = 0;
        for token in spans.chunks_exact(3) {
            let start = token[0] as usize;
            let end = token[1] as usize;
            self.escape
                .append(&input[previous_end..start], true, &mut output);
            let value = &input[start..end];
            if exact {
                let mut index = 0;
                while index < value.len() {
                    if is_js_whitespace(value[index]) {
                        output.push(value[index]);
                        index += 1;
                        continue;
                    }
                    let candidate_start = index;
                    while index < value.len() && !is_js_whitespace(value[index]) {
                        index += 1;
                    }
                    let candidate = &value[candidate_start..index];
                    if contains(candidate)? {
                        self.escape.append(candidate, false, &mut output);
                    } else {
                        output.extend_from_slice(candidate);
                    }
                }
            } else {
                self.escape.append(value, false, &mut output);
            }
            previous_end = end;
        }
        self.escape
            .append(&input[previous_end..], true, &mut output);
        Ok(Some(output))
    }
}

#[napi]
impl WxmlTransformer {
    #[napi]
    pub fn transform_static(
        &self,
        source: Utf16String,
        contains: Option<Function<'_, Utf16String, bool>>,
    ) -> napi::Result<Option<Utf16String>> {
        self.transform(&source, contains.is_some(), |candidate| {
            contains
                .as_ref()
                .expect("exact predicate")
                .call(candidate.to_vec().into())
        })
        .map(|result| result.map(Into::into))
    }
}

#[napi]
pub fn create_wxml_transformer(entries: Vec<WxmlEscapeEntry>) -> Option<WxmlTransformer> {
    Some(WxmlTransformer {
        escape: EscapeTable::new(entries)?,
    })
}
