use super::*;
use crate::escape::default_mapping;

fn result(input: &str) -> Option<String> {
    transform(
        &input.encode_utf16().collect::<Vec<_>>(),
        &default_mapping(),
    )
    .map(|value| String::from_utf16(&value).unwrap())
}

#[test]
fn transforms_escaped_classes_and_normalizes_combinators() {
    assert_eq!(
        result(r"  .w-\[2px\] > .\32 xl\:w-1\/2 , #target & "),
        Some(".w-_b2px_B>._2xl_cw-1_f2,#target &".into())
    );
    assert_eq!(result(r".--x.a\:b+.c\,d"), Some(r".\--x.a_cb+.c_md".into()));
    assert_eq!(result(r".\0 .\1f600 "), Some(".u_xfffd_.u_x1f600_".into()));
}

#[test]
fn returns_unsupported_without_partially_transforming() {
    for input in [
        ".a:hover",
        ".a[hidden]",
        "view.a",
        ".a/*x*/.b",
        ".a,",
        r".a\20 b",
        r".\000032 xl",
        ".a > :not(:last-child)",
    ] {
        assert_eq!(result(input), None, "{input}");
    }
}

#[test]
fn retains_utf16_class_semantics() {
    assert_eq!(
        transform(&[46, 0xd800, 46, 0xd83d, 0xde00], &default_mapping()),
        Some(".u_xd800_.u_x1f600_".encode_utf16().collect())
    );
}
