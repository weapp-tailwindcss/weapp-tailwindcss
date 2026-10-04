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

#[test]
fn preserves_template_body_braces_and_class_context() {
    let mut instance = transformer(&["w-[1px]", "pages/home"]);
    assert_eq!(
        run(&mut instance, "const x = `} w-[1px] {`").unwrap(),
        "const x = `} w-_b1px_B {`"
    );
    assert_eq!(
        run(
            &mut instance,
            "const x = {className: ['pages/home']}; const p = 'pages/home'"
        )
        .unwrap(),
        "const x = {className: ['pages_fhome']}; const p = 'pages/home'"
    );
}

#[test]
fn rejects_semantic_errors_before_rewriting() {
    let mut instance = transformer(&["w-[1px]"]);
    for source in [
        "let x; let x; const c = 'w-[1px]'",
        "break; const c = 'w-[1px]'",
        "export { missing }; const c = 'w-[1px]'",
    ] {
        assert!(run(&mut instance, source).is_none(), "{source}");
    }
}

#[test]
fn eval_requires_babel_and_unambiguous_retains_script_semantics() {
    let mut instance = transformer(&["w-[1px]"]);
    for source in [
        "eval ('const x = \\\"w-[1px]\\\"')",
        "eval /*comment*/ ('const x = \\\"w-[1px]\\\"')",
        "eval\n('const x = \\\"w-[1px]\\\"')",
        "eval?.('const x = \\\"w-[1px]\\\"')",
    ] {
        assert!(run(&mut instance, source).is_none());
    }
    for source in [
        "with (scope) { const cls = 'w-[1px]' }",
        "const legacy = '\\141'; const cls = 'w-[1px]'",
        "export default 'w-[1px]'",
    ] {
        assert_eq!(
            instance.transform(
                utf16(source),
                "js".into(),
                "unambiguous".into(),
                false,
                JsTransformOptions::default(),
            ),
            Some(source.replace("w-[1px]", "w-_b1px_B"))
        );
    }
}

#[test]
fn default_star_preservation_precedes_matching_and_changes_per_call() {
    let mut instance = transformer(&["*", "**", "w-[1px]"]);
    instance.escape.set(b'*', "_s".to_owned());
    let source = "const cls = '* ** w-[1px]'";
    for always_escape in [false, true] {
        for preserve_star in [true, false, true, false] {
            let result = instance.transform(
                utf16(source),
                "js".into(),
                "module".into(),
                false,
                JsTransformOptions {
                    always_escape: Some(always_escape),
                    preserve_star: Some(preserve_star),
                    ..Default::default()
                },
            );
            assert_eq!(
                result.as_deref(),
                Some(if preserve_star {
                    "const cls = '* _s_s w-_b1px_B'"
                } else {
                    "const cls = '_s _s_s w-_b1px_B'"
                })
            );
        }
    }
    assert_eq!(instance.cache.len(), 1);
}

#[test]
fn bounds_instance_analysis_cache() {
    let mut instance = transformer(&["w-[1px]"]);
    for index in 0..140 {
        assert!(run(&mut instance, &format!("const x = 'w-[1px]'; // {index}")).is_some());
    }
    assert_eq!(instance.cache.len(), super::MAX_CACHE_ENTRIES);
    assert!(instance.cache_size <= super::MAX_CACHE_BYTES);
}
