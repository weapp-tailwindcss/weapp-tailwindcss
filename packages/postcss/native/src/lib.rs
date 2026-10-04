mod escape;
mod selector;
mod selector_ast;
mod value;

use napi::bindgen_prelude::Utf16String;
use napi_derive::napi;
use std::sync::OnceLock;

static DEFAULT_MAPPING: OnceLock<escape::EscapeMapping> = OnceLock::new();

/// 一次调用完成选择器 tokenize、类名解码和转换，避免在 NAPI 传递 AST 节点。
#[napi]
pub fn transform_selector(value: Utf16String) -> Option<Utf16String> {
    selector::transform(&value, DEFAULT_MAPPING.get_or_init(escape::default_mapping))
        .map(Into::into)
}

/// 批量入口用于持有完整规则列表的消费方与差分验证。
#[napi]
pub fn transform_selectors(values: Vec<Utf16String>) -> Vec<Option<Utf16String>> {
    values.into_iter().map(transform_selector).collect()
}

#[napi(object)]
pub struct SelectorRuleOptions {
    pub root: Option<Utf16String>,
    pub universal: Option<Utf16String>,
    pub child: Vec<Utf16String>,
    pub remove_hover: bool,
    pub remove_active: bool,
    pub remove_focus: bool,
    pub uni_app_x: bool,
}

#[napi(object)]
pub struct SelectorRuleResult {
    pub selector: Utf16String,
    pub remove: bool,
    pub spacing: bool,
}

/// 配置只跨 NAPI 一次，规则调用只传入 UTF-16 选择器。
#[napi]
pub struct SelectorRuleTransformer {
    options: selector_ast::Options,
}

#[napi]
impl SelectorRuleTransformer {
    #[napi(constructor)]
    pub fn new(options: SelectorRuleOptions) -> Self {
        Self {
            options: selector_ast::Options {
                root: options.root.map(|value| value.to_vec()),
                universal: options.universal.map(|value| value.to_vec()),
                child: options
                    .child
                    .into_iter()
                    .map(|value| value.to_vec())
                    .collect(),
                unsupported: selector_ast::unsupported_pseudos(
                    options.remove_hover,
                    options.remove_active,
                    options.remove_focus,
                ),
                uni_app_x: options.uni_app_x,
            },
        }
    }

    #[napi]
    pub fn transform(&self, value: Utf16String) -> Option<SelectorRuleResult> {
        let mapping = DEFAULT_MAPPING.get_or_init(escape::default_mapping);
        if let Some(selector) = selector::transform(&value, mapping) {
            return Some(SelectorRuleResult {
                selector: selector.into(),
                remove: false,
                spacing: false,
            });
        }
        selector_ast::transform(&value, &self.options, mapping).map(|result| SelectorRuleResult {
            selector: result.selector.into(),
            remove: result.remove,
            spacing: result.spacing,
        })
    }
}

/// 合并 Tailwind v4 三个 var/gradient fallback 兼容阶段，不跨边界传递值 AST。
#[napi]
pub fn normalize_v4_variable_fallbacks(value: Utf16String) -> Option<Utf16String> {
    value::normalize_v4(&value).map(Into::into)
}

/// uvue 的 translate 只改直属参数分隔符，保留嵌套 var 的 fallback 逗号。
#[napi]
pub fn normalize_uvue_transform_value(value: Utf16String) -> Option<Utf16String> {
    value::normalize_translate(&value).map(Into::into)
}

/// 同一 PostCSS 阶段的 transform 声明批量跨越 NAPI。
#[napi]
pub fn normalize_uvue_transform_values(values: Vec<Utf16String>) -> Vec<Option<Utf16String>> {
    values
        .into_iter()
        .map(normalize_uvue_transform_value)
        .collect()
}

#[napi(object)]
pub struct EscapeMappingEntry {
    pub key: u32,
    pub value: Option<Utf16String>,
}

/// 批量处理已由选择器解析器解码的类名，不传递或修改 PostCSS AST。
#[napi]
pub fn escape_classes(
    values: Vec<Utf16String>,
    custom_map: Option<Vec<EscapeMappingEntry>>,
) -> Vec<Utf16String> {
    let default_mapping = DEFAULT_MAPPING.get_or_init(escape::default_mapping);
    let mut custom_mapping;
    let mapping = if let Some(entries) = custom_map.filter(|entries| !entries.is_empty()) {
        custom_mapping = default_mapping.clone();
        for entry in entries {
            if let Some(value) = custom_mapping.get_mut(entry.key as usize) {
                *value = entry.value.map(|text| text.to_vec());
            }
        }
        &custom_mapping
    } else {
        default_mapping
    };
    values
        .iter()
        .map(|value| escape::escape_class(value, mapping).into())
        .collect()
}
