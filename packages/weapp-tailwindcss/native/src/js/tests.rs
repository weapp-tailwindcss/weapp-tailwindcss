use super::{analyze, analyze_js};

#[test]
fn preserves_condition_tests_and_branch_literals() {
    for test in [
        "\"w-[1px]\"",
        "(\"w-[1px]\")",
        "v === \"w-[1px]\"",
        "f(\"w-[1px]\")",
        "v && \"w-[1px]\"",
        "v[\"w-[1px]\"]",
        "!\"w-[1px]\"",
    ] {
        let source = format!("const c = {test} ? \"h-[2px]\" : \"plain\"");
        let result = analyze(&source, "js", "module", false, false).unwrap().0;
        assert!(result.literals[0].is_condition_test, "{source}");
        assert!(!result.literals[1].is_condition_test, "{source}");
        assert!(!result.literals[2].is_condition_test, "{source}");
    }
}

#[test]
fn preserves_utf16_positions_and_template_boundaries() {
    let source = "const title = '中文😀'; const x = `w-[1px] ${v} h-[2px]`";
    for lang in ["js", "ts"] {
        let result = analyze(source, lang, "module", false, false).unwrap().0;
        let units: Vec<_> = source.encode_utf16().collect();
        let slices: Vec<_> = result
            .literals
            .iter()
            .map(|item| String::from_utf16(&units[item.start as usize..item.end as usize]).unwrap())
            .collect();
        assert_eq!(
            slices,
            if lang == "ts" {
                vec!["'中文😀'", "`w-[1px] ${", "} h-[2px]`"]
            } else {
                vec!["'中文😀'", "w-[1px] ", " h-[2px]"]
            }
        );
    }
}

#[test]
fn retains_dependency_and_tagged_template_fallback_facts() {
    for source in [
        "import x from './x'",
        "export * from './x'",
        "export { x } from './x'",
    ] {
        assert!(
            analyze(source, "js", "module", false, false)
                .unwrap()
                .0
                .has_module_declarations
        );
    }
    let result = analyze(
        "const x = require('./x'); const c = tw`w-[1px]`",
        "js",
        "module",
        false,
        false,
    )
    .unwrap()
    .0;
    assert!(!result.has_module_declarations);
    assert!(result.has_tagged_template);
}

#[test]
fn rejects_invalid_js_and_lone_surrogates_without_lossy_conversion() {
    assert!(analyze("const =", "js", "module", false, false).is_none());
    assert!(analyze("const x = '\\uD800'", "js", "module", false, false).is_none());
    assert!(analyze_js(vec![0xd800].into(), "js".into(), "module".into(), false).is_none());
}

#[test]
fn signature_includes_text_literals_and_comments() {
    let source =
        "const x = <view className='h-[1px]'> 中文😀 </view>; const c = `w-[1px]`; // bg-[red]";
    let (_, signature) = analyze(source, "tsx", "unambiguous", true, true).unwrap();
    assert_eq!(
        signature.unwrap(),
        "s:h-[1px]\nx:中文😀\nt:w-[1px]\nc: bg-[red]"
    );
}

#[test]
fn excludes_directives_but_keeps_them_in_runtime_signature() {
    let source = "'w-[1px]'; function f() { 'h-[2px]'; return 'bg-[red]'; }";
    let (analysis, signature) = analyze(source, "tsx", "module", false, true).unwrap();
    assert_eq!(analysis.literals.len(), 1);
    assert_eq!(analysis.literals[0].value, "bg-[red]");
    assert_eq!(signature.unwrap(), "s:w-[1px]\ns:h-[2px]\ns:bg-[red]");
}

#[test]
fn preserves_parenthesized_condition_boundaries() {
    let source = "const c = (value === 'w-[1px]') ? 'h-[2px]' : 'plain'";
    assert!(
        !analyze(source, "js", "module", true, false)
            .unwrap()
            .0
            .literals[0]
            .is_condition_test
    );
    assert!(
        analyze(source, "js", "module", false, false)
            .unwrap()
            .0
            .literals[0]
            .is_condition_test
    );
}

#[test]
fn defers_jsx_attribute_entities_without_changing_signatures() {
    let source = "const c = <view className='a&amp;b'>x&nbsp;y</view>";
    assert!(analyze(source, "jsx", "module", false, false).is_none());
    assert_eq!(
        analyze(source, "tsx", "unambiguous", true, true)
            .unwrap()
            .1
            .unwrap(),
        "s:a&amp;b\nx:x&nbsp;y"
    );
}

#[test]
fn signatures_visit_quasis_before_interpolated_expressions() {
    let source = "const x = `a${'b'}c${'d'}e`; // trailing";
    assert_eq!(
        analyze(source, "tsx", "unambiguous", true, true)
            .unwrap()
            .1
            .unwrap(),
        "t:a\nt:c\nt:e\ns:b\ns:d\nc: trailing"
    );
}

#[test]
fn defers_static_esm_declarations_in_script_mode() {
    for source in [
        "import x from 'w-[1px]'",
        "export default 'w-[1px]'",
        "export const x = 'w-[1px]'",
        "const x = 'w-[1px]'; export { x }",
        "export * from 'w-[1px]'",
        "export { x } from 'w-[1px]'",
    ] {
        assert!(
            analyze(source, "js", "script", false, false).is_none(),
            "{source}"
        );
        assert!(
            analyze(source, "js", "module", false, false).is_some(),
            "{source}"
        );
    }
    assert!(analyze("const x = import('w-[1px]')", "js", "script", false, false).is_some());
}
