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

#[test]
fn prunes_original_attached_branches_before_where_cloning() {
    let options = Options {
        root: None,
        universal: None,
        child: Vec::new(),
        unsupported: unsupported_pseudos(false, false, false),
        uni_app_x: false,
    };
    for (input, expected) in [
        (".safe,:where(:is(.branch:-moz-any(:lang(ar))))", ".safe"),
        (".safe,:where(:is(.branch:checked))", ".safe"),
        (
            ".safe,.branch:not(:-moz-any(:lang(ar)),:checked)",
            ".safe,.branch",
        ),
        (".safe,.branch>:not(:last-child:checked)", ".safe"),
    ] {
        let result = transform(&text(input), &options, &default_mapping()).unwrap();
        assert_eq!(result.selector, text(expected), "{input}");
    }
}

#[test]
fn retains_original_uni_app_x_multi_where_rejection() {
    let options = Options {
        root: None,
        universal: None,
        child: Vec::new(),
        unsupported: unsupported_pseudos(false, false, false),
        uni_app_x: true,
    };
    for input in [
        ".safe,.branch:where(.before:before,.keep)",
        ".safe,.branch:where(:is(.before:before,.keep))",
    ] {
        let result = transform(&text(input), &options, &default_mapping()).unwrap();
        assert_eq!(result.selector, text(".safe"), "{input}");
    }
}
