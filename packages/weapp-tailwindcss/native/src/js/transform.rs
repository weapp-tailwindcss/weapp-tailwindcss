use std::collections::{HashSet, VecDeque};

use napi::bindgen_prelude::Utf16String;
use napi_derive::napi;

use super::{JsSourceAnalysis, analyze_for_transform};

mod apply;
mod candidates;
mod decode;
#[cfg(test)]
mod tests;

use candidates::EscapeTable;

#[napi(object)]
pub struct JsEscapeEntry {
    pub character: Utf16String,
    pub replacement: Utf16String,
}

#[napi(object)]
#[derive(Default)]
pub struct JsTransformOptions {
    pub always_escape: Option<bool>,
    pub unescape_unicode: Option<bool>,
    pub module_graph: Option<bool>,
    pub ignore_tagged_templates: Option<bool>,
}

struct CachedAnalysis {
    source: String,
    lang: String,
    source_type: String,
    preserve_parens: bool,
    analysis: JsSourceAnalysis,
    size: usize,
}

const MAX_CACHE_BYTES: usize = 2 * 1024 * 1024;
const MAX_CACHE_ENTRIES: usize = 128;

/// 实例由 JS GC 持有；类集合显式更新，解析缓存不保存原生 AST 或用户回调。
#[napi]
pub struct JsTransformer {
    class_names: HashSet<String>,
    escape: EscapeTable,
    cache: VecDeque<CachedAnalysis>,
    cache_size: usize,
}

fn read_class_names(class_names: Vec<Utf16String>) -> Option<HashSet<String>> {
    class_names
        .into_iter()
        .map(|value| String::from_utf16(&value).ok())
        .collect()
}

/// escape_entries 必须是调用方合并后的有效映射，避免 Rust 维护另一份默认字典。
#[napi]
pub fn create_js_transformer(
    class_names: Vec<Utf16String>,
    escape_entries: Vec<JsEscapeEntry>,
) -> Option<JsTransformer> {
    let class_names = read_class_names(class_names)?;
    let mut escape = EscapeTable::default();
    for entry in escape_entries {
        let key = String::from_utf16(&entry.character).ok()?;
        let value = String::from_utf16(&entry.replacement).ok()?;
        // JS escape 只在 ASCII 单字符上读取映射，其余键不参与替换。
        if key.len() == 1 && key.is_ascii() {
            escape.set(key.as_bytes()[0], value);
        }
    }
    Some(JsTransformer {
        class_names,
        escape,
        cache: VecDeque::new(),
        cache_size: 0,
    })
}

#[napi]
impl JsTransformer {
    /// 原子替换集合；无损转换失败时不提交部分结果，调用方必须回退当前请求。
    #[napi]
    pub fn replace_class_names(&mut self, class_names: Vec<Utf16String>) -> bool {
        let Some(class_names) = read_class_names(class_names) else {
            return false;
        };
        self.class_names = class_names;
        true
    }

    /// 完整执行解析、精确匹配和文本替换；null 表示交还原有兼容管线。
    #[napi]
    pub fn transform(
        &mut self,
        input: Utf16String,
        lang: String,
        source_type: String,
        preserve_parens: bool,
        options: JsTransformOptions,
    ) -> Option<String> {
        let source = String::from_utf16(&input).ok()?;
        if source.contains("eval(") || (source.contains("weapp-tw") && source.contains("ignore")) {
            return None;
        }
        let index = self.cache.iter().position(|entry| {
            entry.source == source
                && entry.lang == lang
                && entry.source_type == source_type
                && entry.preserve_parens == preserve_parens
        });
        let entry = if let Some(index) = index {
            let entry = self.cache.remove(index)?;
            self.cache_size -= entry.size;
            entry
        } else {
            let (analysis, _) =
                analyze_for_transform(&source, &lang, &source_type, preserve_parens, false, true)?;
            let size = source.len()
                + analysis
                    .literals
                    .iter()
                    .map(|item| item.value.len() + 104)
                    .sum::<usize>();
            CachedAnalysis {
                source,
                lang,
                source_type,
                preserve_parens,
                analysis,
                size,
            }
        };
        let result = if (options.module_graph == Some(true)
            && entry.analysis.has_module_declarations)
            || (options.ignore_tagged_templates == Some(true) && entry.analysis.has_tagged_template)
        {
            None
        } else {
            apply::transform(
                &entry.source,
                &entry.analysis,
                &self.class_names,
                &self.escape,
                &options,
            )
        };
        if entry.size <= MAX_CACHE_BYTES {
            while self.cache.len() >= MAX_CACHE_ENTRIES
                || self.cache_size + entry.size > MAX_CACHE_BYTES
            {
                if let Some(oldest) = self.cache.pop_back() {
                    self.cache_size -= oldest.size;
                }
            }
            self.cache_size += entry.size;
            self.cache.push_front(entry);
        }
        result
    }
}
