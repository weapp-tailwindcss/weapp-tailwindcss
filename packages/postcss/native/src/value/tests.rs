use super::*;

fn v4(value: &str) -> Option<String> {
    normalize_v4(&value.encode_utf16().collect::<Vec<_>>())
        .map(|value| String::from_utf16(&value).unwrap())
}

#[test]
fn normalizes_nested_gradient_and_empty_fallbacks() {
    assert_eq!(
        v4("translate(var(--tw-x,))"),
        Some("translate(var(--tw-x, ))".into())
    );
    assert_eq!(
        v4("linear-gradient(var(--tw-gradient-via-stops, red, blue))"),
        Some("linear-gradient(var(--tw-gradient-via-stops, red), blue)".into())
    );
    assert_eq!(
        v4("var(--tw-gradient-from-position)"),
        Some("var(--tw-gradient-from-position, )".into())
    );
}

#[test]
fn preserves_quoted_commented_and_opaque_url_values() {
    for value in [
        "url(var(--tw-x,))",
        "'var(--tw-x,)'",
        "/*var(--tw-x,)*/",
        "VAR(--tw-x,)",
    ] {
        assert_eq!(v4(value), Some(value.into()));
    }
    assert_eq!(
        v4("var(--tw-x, /*comment*/)"),
        Some("var(--tw-x, /*comment*/)".into())
    );
}

#[test]
fn unsupported_incomplete_values_fall_back_atomically() {
    for value in ["var(--tw-x,", "/*var(--tw-x,)", "'var(--tw-x,)"] {
        assert_eq!(v4(value), None);
    }
}

#[test]
fn translates_only_function_argument_separators() {
    let input = "translate(var(--x, 0), var(--y, 0)) TRANSLATE(1px , 2px)";
    let output = normalize_translate(&input.encode_utf16().collect::<Vec<_>>()).unwrap();
    assert_eq!(
        String::from_utf16(&output).unwrap(),
        "translate(var(--x, 0) var(--y, 0)) TRANSLATE(1px 2px)"
    );
}
