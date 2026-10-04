use std::{cell::RefCell, collections::HashSet};

use napi::bindgen_prelude::{Function, Utf16String};
use napi_derive::napi;

mod apply;
mod cache;
#[cfg(test)]
mod candidate_tests;
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
    pub preserve_star: Option<bool>,
}

/// 实例由 JS GC 持有；类集合显式更新，解析缓存不保存原生 AST 或用户回调。
#[napi]
pub struct JsTransformer {
    class_names: RefCell<HashSet<String>>,
    escape: EscapeTable,
    cache: RefCell<cache::AnalysisCache>,
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
        class_names: RefCell::new(class_names),
        escape,
        cache: RefCell::default(),
    })
}

impl JsTransformer {
    fn source_analysis(
        &self,
        input: Utf16String,
        lang: String,
        source_type: String,
        preserve_parens: bool,
        options: &JsTransformOptions,
    ) -> Option<std::rc::Rc<cache::CachedAnalysis>> {
        let source = String::from_utf16(&input).ok()?;
        if source.contains("eval(") || (source.contains("weapp-tw") && source.contains("ignore")) {
            return None;
        }
        // 解析结果由 Rc 持有；进入 JS 回调前必须释放缓存的所有 RefCell 借用。
        let entry = {
            let mut cache = self.cache.borrow_mut();
            cache.resolve(source, lang, source_type, preserve_parens)
        }?;
        if (options.module_graph == Some(true) && entry.analysis.has_module_declarations)
            || (options.ignore_tagged_templates == Some(true) && entry.analysis.has_tagged_template)
        {
            return None;
        }
        Some(entry)
    }

    fn transform_with<E>(
        &self,
        input: Utf16String,
        lang: String,
        source_type: String,
        preserve_parens: bool,
        options: &JsTransformOptions,
        contains: impl FnMut(&str) -> Result<bool, E>,
    ) -> Result<Option<String>, E> {
        let Some(entry) = self.source_analysis(input, lang, source_type, preserve_parens, options)
        else {
            return Ok(None);
        };
        apply::transform(
            &entry.source,
            &entry.analysis,
            &self.escape,
            options,
            contains,
        )
    }
}

#[napi]
impl JsTransformer {
    /// 原子替换旧接口的集合；候选查询接口不读取或保存此集合。
    #[napi]
    pub fn replace_class_names(&self, class_names: Vec<Utf16String>) -> bool {
        let Some(class_names) = read_class_names(class_names) else {
            return false;
        };
        *self.class_names.borrow_mut() = class_names;
        true
    }

    /// 保留完整快照接口，供直接 ABI 消费者使用。
    #[napi]
    pub fn transform(
        &self,
        input: Utf16String,
        lang: String,
        source_type: String,
        preserve_parens: bool,
        options: JsTransformOptions,
    ) -> Option<String> {
        let entry = self.source_analysis(input, lang, source_type, preserve_parens, &options)?;
        let classes = self.class_names.borrow();
        if classes.is_empty() && options.always_escape != Some(true) {
            return Some(entry.source.clone());
        }
        apply::transform(
            &entry.source,
            &entry.analysis,
            &self.escape,
            &options,
            |candidate| Ok::<_, std::convert::Infallible>(classes.contains(candidate)),
        )
        .unwrap()
    }

    /// 只跨 ABI 查询当前源码候选，回调不跨调用保留；null 表示语义回退。
    #[napi]
    pub fn transform_with_candidates(
        &self,
        input: Utf16String,
        lang: String,
        source_type: String,
        preserve_parens: bool,
        options: JsTransformOptions,
        contains: Function<'_, Utf16String, bool>,
    ) -> napi::Result<Option<String>> {
        self.transform_with(
            input,
            lang,
            source_type,
            preserve_parens,
            &options,
            |candidate| contains.call(candidate.encode_utf16().collect::<Vec<_>>().into()),
        )
    }
}
