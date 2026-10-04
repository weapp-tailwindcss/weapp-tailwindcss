use super::{JsEscapeEntry, JsTransformOptions, JsTransformer, create_js_transformer};
use napi::bindgen_prelude::Utf16String;

fn utf16(input: &str) -> Utf16String {
    input.encode_utf16().collect::<Vec<_>>().into()
}

fn transformer(classes: &[&str]) -> JsTransformer {
    create_js_transformer(
        classes.iter().map(|input| utf16(input)).collect(),
        [
            ('[', "_b"),
            (']', "_B"),
            ('/', "_f"),
            (':', "_c"),
            ('\'', "_a"),
            ('"', "_q"),
        ]
        .into_iter()
        .map(|(character, replacement)| JsEscapeEntry {
            character: utf16(&character.to_string()),
            replacement: utf16(replacement),
        })
        .collect(),
    )
    .unwrap()
}

fn run(instance: &mut JsTransformer, source: &str) -> Option<String> {
    instance.transform(
        utf16(source),
        "js".into(),
        "module".into(),
        false,
        JsTransformOptions::default(),
    )
}

#[test]
fn transforms_complete_source_and_preserves_comparison_values() {
    let mut instance = transformer(&["w-[1px]", "h-[2px]"]);
    let source = "'w-[1px]'; const x = c === 'w-[1px]' ? 'h-[2px]' : `w-[1px] ${v} h-[2px]`;";
    let expected =
        "'w-[1px]'; const x = c === 'w-[1px]' ? 'h-_b2px_B' : `w-_b1px_B ${v} h-_b2px_B`;";
    assert_eq!(run(&mut instance, source).unwrap(), expected);
    assert_eq!(run(&mut instance, source).unwrap(), expected);
    assert_eq!(instance.cache.len(), 1);
}

#[test]
fn requires_exact_set_and_keeps_business_paths() {
    let source = "const x = 'w-[1px] h-[2px] pages/home';";
    let mut instance = transformer(&["w-_b1px_B", "pages/home"]);
    assert_eq!(
        run(&mut instance, source).unwrap(),
        "const x = 'w-_b1px_B h-[2px] pages/home';"
    );
}

#[test]
fn class_updates_are_atomic_and_invalidate_cached_decisions() {
    let mut instance = transformer(&["w-[1px]"]);
    let source = "const x = 'w-[1px] h-[2px]'";
    assert_eq!(
        run(&mut instance, source).unwrap(),
        "const x = 'w-_b1px_B h-[2px]'"
    );
    assert!(!instance.replace_class_names(vec![utf16("h-[2px]"), vec![0xd800].into()]));
    assert_eq!(
        run(&mut instance, source).unwrap(),
        "const x = 'w-_b1px_B h-[2px]'"
    );
    assert!(instance.replace_class_names(vec![utf16("h-[2px]")]));
    assert_eq!(
        run(&mut instance, source).unwrap(),
        "const x = 'w-[1px] h-_b2px_B'"
    );
}

#[test]
fn preserves_unicode_and_explicit_merged_escape_mapping() {
    let mut instance = create_js_transformer(
        vec![utf16("中😀"), utf16("w-[1px]")],
        vec![
            JsEscapeEntry {
                character: utf16("["),
                replacement: utf16("LEFT"),
            },
            JsEscapeEntry {
                character: utf16("]"),
                replacement: utf16("_B"),
            },
        ],
    )
    .unwrap();
    assert_eq!(
        run(&mut instance, "const x = '中😀 w-[1px]'").unwrap(),
        "const x = 'u_x4e2d_u_x1f600_ w-LEFT1px_B'"
    );
}

#[test]
fn decodes_unicode_without_losing_json_fallback_semantics() {
    let mut instance = transformer(&["w-[1px]"]);
    let options = JsTransformOptions {
        unescape_unicode: Some(true),
        ..Default::default()
    };
    assert_eq!(
        instance
            .transform(
                utf16("const x = `w-\\u005b1px\\u005d`"),
                "js".into(),
                "module".into(),
                false,
                options
            )
            .unwrap(),
        "const x = `w-_b1px_B`"
    );
    assert_eq!(super::decode::decode("\\u4e2d\\n").unwrap(), "中\n");
    assert_eq!(super::decode::decode("'\\u4e2d'\n").unwrap(), "'中'\n");
    assert!(super::decode::decode("\\ud800").is_none());
}

#[test]
fn splitter_preserves_quoted_arbitrary_values_and_escaped_whitespace() {
    assert_eq!(
        super::candidates::split("w-[1px]\\nh-[2px] content-['a b'] [unfinished next"),
        vec![
            "w-[1px]",
            "h-[2px]",
            "content-['a b']",
            "[unfinished",
            "next"
        ]
    );
}
