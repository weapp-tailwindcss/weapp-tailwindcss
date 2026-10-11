use super::{declaration, gradient_position, infinity, radius};

fn units(input: &str) -> Vec<u16> {
    input.encode_utf16().collect()
}
fn output(input: Vec<u16>) -> String {
    String::from_utf16(&input).unwrap()
}

#[test]
fn preserves_regex_boundaries_signs_and_scientific_notation() {
    assert_eq!(
        output(radius(&units("-100001px a-100001px a-1e9px 1e-99rpx"))),
        "-9999px a-100001px a9999px 9999px"
    );
    assert_eq!(
        output(radius(&units("100000.000000000001px 100000.00000000001px"))),
        "100000.000000000001px 9999px"
    );
}

#[test]
fn keeps_gradient_replacement_text_and_whitespace_boundaries() {
    assert_eq!(
        output(gradient_position(&units(
            "calc(-45deg * -1) in oklch longer hue"
        ))),
        "--45deg"
    );
    assert_eq!(output(gradient_position(&units("in srgb \n"))), "in srgb");
    assert_eq!(output(gradient_position(&units("in srgb\n"))), "in srgb");
}

#[test]
fn preserves_whole_value_and_global_infinity_modes() {
    let input = units("a calc(infinity * 0px) b CALC(INFINITY * 2.RPX)");
    assert_eq!(infinity(&input, true), input);
    assert_eq!(output(infinity(&input, false)), "a 9999px b 9999px");
}

#[test]
fn combines_stages_without_reordering_the_gradient_early_return() {
    assert_eq!(
        output(declaration(&units("var(--tw-x,) 1e9px"), false, None, true).unwrap()),
        "var(--tw-x, ) 9999px"
    );
    assert_eq!(
        output(declaration(&units("calc(infinity * 1px) in srgb"), true, None, false).unwrap()),
        "calc(infinity * 1px)"
    );
    assert!(declaration(&units("var(--tw-x, \"unfinished"), false, None, true).is_none());
}

#[test]
fn leaves_lone_surrogates_lossless() {
    let mut input = vec![0xd800];
    input.extend(units("100001px"));
    input.push(0xdc00);
    let mut expected = vec![0xd800];
    expected.extend(units("9999px"));
    expected.push(0xdc00);
    assert_eq!(radius(&input), expected);
}
