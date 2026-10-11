use super::*;
use crate::escape::default_mapping;

#[test]
fn expands_where_and_retains_walk_order() {
    let options = Options {
        root: None,
        universal: None,
        child: Vec::new(),
        unsupported: Vec::new(),
        uni_app_x: false,
    };
    let result = transform(
        &text(".a:where(.b,.c):where(.d,.e)"),
        &options,
        &default_mapping(),
    )
    .unwrap();
    assert_eq!(result.selector, text(".a.b:where(.d,.e),.a.c:where(.d,.e)"));
}

#[test]
fn removes_unsupported_root_branch() {
    let options = Options {
        root: None,
        universal: None,
        child: Vec::new(),
        unsupported: vec![text(":checked")],
        uni_app_x: false,
    };
    let result = transform(
        &text(".a:not(.b:checked),.c:before"),
        &options,
        &default_mapping(),
    )
    .unwrap();
    assert_eq!(result.selector, text(".c::before"));
}
