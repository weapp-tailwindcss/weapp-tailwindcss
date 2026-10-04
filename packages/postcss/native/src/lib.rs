mod escape;

use napi::bindgen_prelude::Utf16String;
use napi_derive::napi;
use std::sync::OnceLock;

static DEFAULT_MAPPING: OnceLock<escape::EscapeMapping> = OnceLock::new();

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
