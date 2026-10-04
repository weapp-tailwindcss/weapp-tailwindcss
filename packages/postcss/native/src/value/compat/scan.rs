pub(super) fn whitespace(unit: u16) -> bool {
    matches!(unit, 9..=13 | 32 | 160 | 0x1680 | 0x2000..=0x200a | 0x2028 | 0x2029 | 0x202f | 0x205f | 0x3000 | 0xfeff)
}

pub(super) fn trim(input: &[u16]) -> &[u16] {
    let start = skip_space(input, 0);
    let end = input
        .iter()
        .rposition(|unit| !whitespace(*unit))
        .map_or(start, |index| index + 1);
    &input[start..end]
}

pub(super) fn skip_space(input: &[u16], mut index: usize) -> usize {
    while input.get(index).is_some_and(|unit| whitespace(*unit)) {
        index += 1;
    }
    index
}

pub(super) fn text(input: &[u16], index: usize, needle: &str) -> Option<usize> {
    let end = index.checked_add(needle.len())?;
    input
        .get(index..end)
        .filter(|value| super::super::eq_ignore_case(value, needle))
        .map(|_| end)
}

pub(super) fn word(unit: Option<&u16>) -> bool {
    unit.is_some_and(|unit| matches!(unit, 48..=57 | 65..=90 | 95 | 97..=122))
}

fn digits(input: &[u16], mut index: usize) -> usize {
    while input
        .get(index)
        .is_some_and(|unit| (48..=57).contains(unit))
    {
        index += 1;
    }
    index
}

pub(super) fn number(
    input: &[u16],
    index: usize,
    sign: bool,
    trailing_dot: bool,
    exponent: bool,
) -> Option<usize> {
    let mut cursor = index;
    if sign && matches!(input.get(cursor), Some(43 | 45)) {
        cursor += 1;
    }
    let start = cursor;
    cursor = digits(input, cursor);
    let integer = cursor > start;
    if input.get(cursor) == Some(&46) {
        let fraction = digits(input, cursor + 1);
        if fraction > cursor + 1 || (integer && trailing_dot) {
            cursor = fraction;
        } else if !integer {
            return None;
        }
    } else if !integer {
        return None;
    }
    if exponent && matches!(input.get(cursor), Some(69 | 101)) {
        let mut tail = cursor + 1;
        if matches!(input.get(tail), Some(43 | 45)) {
            tail += 1;
        }
        let end = digits(input, tail);
        if end > tail {
            cursor = end;
        }
    }
    Some(cursor)
}

pub(super) fn infinity_end(input: &[u16], index: usize) -> Option<usize> {
    let mut cursor = text(input, index, "calc(")?;
    cursor = text(input, skip_space(input, cursor), "infinity")?;
    cursor = text(input, skip_space(input, cursor), "*")?;
    cursor = number(input, skip_space(input, cursor), false, true, false)?;
    cursor = text(input, cursor, "rpx").or_else(|| text(input, cursor, "px"))?;
    text(input, skip_space(input, cursor), ")")
}

pub(super) fn replace_matches(
    input: &[u16],
    mut replacement: impl FnMut(usize) -> Option<(usize, Vec<u16>)>,
) -> Vec<u16> {
    let mut output = Vec::with_capacity(input.len());
    let mut cursor = 0;
    while cursor < input.len() {
        if let Some((end, value)) = replacement(cursor) {
            output.extend(value);
            cursor = end;
        } else {
            output.push(input[cursor]);
            cursor += 1;
        }
    }
    output
}
