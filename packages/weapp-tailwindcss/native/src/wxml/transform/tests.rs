use super::{WxmlEscapeEntry, WxmlTransformer, create_wxml_transformer};

fn transformer() -> WxmlTransformer {
    create_wxml_transformer(vec![
        WxmlEscapeEntry {
            character: vec![91].into(),
            replacement: vec![95, 98].into(),
        },
        WxmlEscapeEntry {
            character: vec![93].into(),
            replacement: vec![95, 66].into(),
        },
    ])
    .unwrap()
}

fn transform(input: &str, exact: bool) -> String {
    let result = transformer()
        .transform::<()>(&input.encode_utf16().collect::<Vec<_>>(), exact, |value| {
            Ok(value == "w-[1px]".encode_utf16().collect::<Vec<_>>())
        })
        .unwrap()
        .unwrap();
    String::from_utf16(&result).unwrap()
}

#[test]
fn keeps_empty_whitespace_but_normalizes_gaps_when_tokens_exist() {
    assert_eq!(transform("\r\n \u{a0}", false), "\r\n \u{a0}");
    assert_eq!(
        transform("\r\n w-[1px]\n\u{a0} 2xl\r", false),
        " w-_b1px_Bu_xa0_ _2xl"
    );
    assert_eq!(transform("- -1 --x", false), "_- _-1 --x");
}

#[test]
fn distinguishes_wxml_token_whitespace_from_exact_candidate_whitespace() {
    assert_eq!(
        transform("w-[1px]\u{2003}w-[2px]", true),
        "w-_b1px_B\u{2003}w-[2px]"
    );
    assert_eq!(
        transform("w-[1px]\u{2003}w-[2px]", false),
        "w-_b1px_Bu_x2003_w-_b2px_B"
    );
    assert_eq!(
        transform("a { w-[1px]\n w-[2px]", true),
        "a { w-_b1px_B\n w-[2px]"
    );
}

#[test]
fn rejects_dynamic_values_before_calling_the_predicate() {
    let mut calls = 0;
    let output = transformer()
        .transform::<()>(&"x {a}} y".encode_utf16().collect::<Vec<_>>(), true, |_| {
            calls += 1;
            Ok(true)
        })
        .unwrap();
    assert!(output.is_none());
    assert_eq!(calls, 0);
}

#[test]
fn preserves_utf16_and_propagates_predicate_errors() {
    let output = transformer()
        .transform::<()>(
            &[0xd800, 32, 0xd83d, 0xde00, 32, 0xdc00],
            false,
            |_| unreachable!(),
        )
        .unwrap()
        .unwrap();
    assert_eq!(
        String::from_utf16(&output).unwrap(),
        "u_xd800_ u_x1f600_ u_xdc00_"
    );
    let error = transformer().transform(&[120], true, |_| Err("predicate failed"));
    assert_eq!(error, Err("predicate failed"));
}
