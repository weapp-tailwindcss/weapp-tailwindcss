use super::{
    JsTransformOptions,
    tests::{transformer, utf16},
};

#[test]
fn queries_unique_candidates_per_call_and_does_not_use_stored_classes() {
    let instance = transformer(&["h-[2px]"]);
    let source = "const x = 'w-[1px] h-[2px] w-[1px]'; const y = {className:'w-[1px]'}";
    for matching in [true, false, true] {
        let mut queried = Vec::new();
        let result = instance
            .transform_with(
                utf16(source),
                "js".into(),
                "module".into(),
                false,
                &JsTransformOptions::default(),
                |candidate| {
                    queried.push(candidate.to_owned());
                    Ok::<_, ()>(matching && candidate == "w-[1px]")
                },
            )
            .unwrap()
            .unwrap();
        assert_eq!(
            result,
            if matching {
                source.replace("w-[1px]", "w-_b1px_B")
            } else {
                source.to_owned()
            }
        );
        assert_eq!(
            queried,
            if matching {
                vec!["w-[1px]", "h-[2px]", "h-_b2px_B"]
            } else {
                vec!["w-[1px]", "w-_b1px_B", "h-[2px]", "h-_b2px_B"]
            }
        );
    }
}

#[test]
fn batch_queries_candidates_once_and_matches_membership_results() {
    let instance = transformer(&[]);
    let source = "const x = 'w-[1px] h-[2px] w-[1px]'";
    let mut batches = 0;
    let result = instance
        .transform_with_batch(
            utf16(source),
            "js".into(),
            "module".into(),
            false,
            &JsTransformOptions::default(),
            |candidates| {
                batches += 1;
                assert_eq!(
                    candidates,
                    vec!["w-[1px]", "w-_b1px_B", "h-[2px]", "h-_b2px_B",]
                );
                Ok::<_, ()>(
                    candidates
                        .into_iter()
                        .map(|candidate| candidate == "w-[1px]")
                        .collect(),
                )
            },
        )
        .unwrap();
    assert_eq!(batches, 1);
    assert_eq!(result, Some(source.replace("w-[1px]", "w-_b1px_B")));
}

#[test]
fn batch_rejects_a_mismatched_membership_response() {
    let instance = transformer(&[]);
    let result = instance
        .transform_with_batch(
            utf16("const x = 'w-[1px]'"),
            "js".into(),
            "module".into(),
            false,
            &JsTransformOptions::default(),
            |_| Ok::<_, ()>(Vec::new()),
        )
        .unwrap();
    assert_eq!(result, None);
}

#[test]
fn rejects_unsupported_semantics_before_querying() {
    let instance = transformer(&[]);
    for source in [
        "let x; let x; const c='w-[1px]'",
        "eval ('w-[1px]')",
        "const c='\u{d7ff}'; /* weapp-tw ignore */",
    ] {
        assert_eq!(
            instance
                .transform_with(
                    utf16(source),
                    "js".into(),
                    "module".into(),
                    false,
                    &JsTransformOptions::default(),
                    |_| -> Result<bool, ()> { panic!("fallback queried membership") }
                )
                .unwrap(),
            None
        );
    }
}

#[test]
fn membership_errors_are_not_cached_and_instance_remains_usable() {
    let instance = transformer(&[]);
    let source = "const cls = 'w-[1px]'";
    assert_eq!(
        instance.transform_with(
            utf16(source),
            "js".into(),
            "module".into(),
            false,
            &JsTransformOptions::default(),
            |_| Err("membership failure")
        ),
        Err("membership failure")
    );
    assert_eq!(
        instance
            .transform_with(
                utf16(source),
                "js".into(),
                "module".into(),
                false,
                &JsTransformOptions::default(),
                |_| Ok::<_, ()>(true)
            )
            .unwrap(),
        Some(source.replace("w-[1px]", "w-_b1px_B"))
    );
    assert_eq!(instance.cache.borrow().entries.len(), 1);
}

#[test]
fn callback_reentrancy_releases_all_instance_borrows() {
    let instance = transformer(&[]);
    let source = "const cls = 'w-[1px]'";
    let actual = instance
        .transform_with(
            utf16(source),
            "js".into(),
            "module".into(),
            false,
            &JsTransformOptions::default(),
            |_| {
                assert!(instance.replace_class_names(vec![utf16("h-[2px]")]));
                for index in 0..140 {
                    let nested = format!("const cls = 'h-[2px]'; // {index}");
                    assert_eq!(
                        instance.transform(
                            utf16(&nested),
                            "js".into(),
                            "module".into(),
                            false,
                            JsTransformOptions::default()
                        ),
                        Some(nested.replace("h-[2px]", "h-_b2px_B"))
                    );
                }
                assert_eq!(
                    instance
                        .transform_with(
                            utf16(source),
                            "js".into(),
                            "module".into(),
                            false,
                            &JsTransformOptions::default(),
                            |_| Ok::<_, ()>(false)
                        )
                        .unwrap(),
                    Some(source.to_owned())
                );
                Ok::<_, ()>(true)
            },
        )
        .unwrap();
    assert_eq!(actual, Some(source.replace("w-[1px]", "w-_b1px_B")));
    let cache = instance.cache.borrow();
    assert_eq!(cache.entries.len(), super::cache::MAX_CACHE_ENTRIES);
    assert!(cache.size <= super::cache::MAX_CACHE_BYTES);
}

#[test]
fn always_escape_and_condition_tests_do_not_query_membership() {
    let instance = transformer(&[]);
    for (source, options, expected) in [
        (
            "const x = value === 'w-[1px]' ? '' : ''",
            JsTransformOptions::default(),
            "const x = value === 'w-[1px]' ? '' : ''",
        ),
        (
            "const x = 'w-[1px]'",
            JsTransformOptions {
                always_escape: Some(true),
                ..Default::default()
            },
            "const x = 'w-_b1px_B'",
        ),
        (
            "const x = '* pages/home'",
            JsTransformOptions {
                preserve_star: Some(true),
                ..Default::default()
            },
            "const x = '* pages/home'",
        ),
    ] {
        assert_eq!(
            instance
                .transform_with(
                    utf16(source),
                    "js".into(),
                    "module".into(),
                    false,
                    &options,
                    |_| -> Result<bool, ()> { panic!("unnecessary membership query") }
                )
                .unwrap()
                .as_deref(),
            Some(expected)
        );
    }
}

#[test]
fn legacy_empty_set_keeps_original_short_circuit_after_analysis() {
    let instance = transformer(&[]);
    let source = "const cls = `\\ud800`";
    assert_eq!(
        instance.transform(
            utf16(source),
            "js".into(),
            "module".into(),
            false,
            JsTransformOptions {
                unescape_unicode: Some(true),
                ..Default::default()
            }
        ),
        Some(source.to_owned())
    );
    assert_eq!(
        instance.transform(
            utf16("let x; let x;"),
            "js".into(),
            "module".into(),
            false,
            JsTransformOptions::default()
        ),
        None
    );
}
