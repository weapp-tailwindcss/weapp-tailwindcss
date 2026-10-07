mod scan;
#[cfg(test)]
mod tests;

use scan::{infinity_end, number, replace_matches, skip_space, text, trim, whitespace, word};

const CLAMP: &[u16] = &[57, 57, 57, 57, 112, 120];

fn space_required(input: &[u16], index: usize) -> Option<usize> {
    let end = skip_space(input, index);
    (end > index).then_some(end)
}

fn hue_mode(input: &[u16], index: usize) -> Option<usize> {
    ["longer", "shorter", "increasing", "decreasing"]
        .iter()
        .find_map(|name| text(input, index, name))
}

fn color_space(input: &[u16], index: usize) -> Option<usize> {
    let cursor = space_required(input, text(input, index, "in")?)?;
    let base = ["oklab", "oklch", "hsl", "srgb"]
        .iter()
        .find_map(|name| text(input, cursor, name))?;
    let hue = space_required(input, base)
        .and_then(|cursor| hue_mode(input, cursor))
        .and_then(|cursor| space_required(input, cursor))
        .and_then(|cursor| text(input, cursor, "hue"));
    Some(hue.unwrap_or(base))
}

pub fn gradient_position(input: &[u16]) -> Vec<u16> {
    let mut output = replace_matches(input, |start| {
        let begin = skip_space(input, text(input, start, "calc(")?);
        let number_end = number(input, begin, true, false, false)?;
        let angle_end = ["deg", "grad", "rad", "turn"]
            .iter()
            .find_map(|unit| text(input, number_end, unit))?;
        let cursor = text(input, skip_space(input, angle_end), "*")?;
        let cursor = text(input, skip_space(input, cursor), "-1")?;
        let end = text(input, skip_space(input, cursor), ")")?;
        let mut replacement = vec![45];
        replacement.extend_from_slice(&input[begin..angle_end]);
        Some((end, replacement))
    });
    if let Some(end) = color_space(&output, 0).filter(|end| *end == output.len()) {
        output.drain(..end);
    }
    if let Some(start) = (0..output.len()).find(|index| {
        whitespace(output[*index])
            && (*index == 0 || !whitespace(output[*index - 1]))
            && color_space(&output, skip_space(&output, *index))
                .is_some_and(|end| skip_space(&output, end) == output.len())
    }) {
        output.truncate(start);
    }
    if let Some(start) = (0..output.len()).find(|index| {
        whitespace(output[*index])
            && (*index == 0 || !whitespace(output[*index - 1]))
            && hue_mode(&output, skip_space(&output, *index))
                .is_some_and(|end| skip_space(&output, end) == output.len())
    }) {
        output.truncate(start);
    }
    trim(&output).to_vec()
}

pub fn infinity(input: &[u16], whole_value: bool) -> Vec<u16> {
    if whole_value {
        let value = trim(input);
        if infinity_end(value, 0) == Some(value.len()) {
            CLAMP.to_vec()
        } else {
            input.to_vec()
        }
    } else {
        replace_matches(input, |start| {
            infinity_end(input, start).map(|end| (end, CLAMP.to_vec()))
        })
    }
}

pub fn radius(input: &[u16]) -> Vec<u16> {
    replace_matches(input, |start| {
        if word(start.checked_sub(1).and_then(|index| input.get(index))) == word(input.get(start)) {
            return None;
        }
        let number_end = number(input, start, true, false, true)?;
        let unit_start = skip_space(input, number_end);
        let end = text(input, unit_start, "rpx").or_else(|| text(input, unit_start, "px"))?;
        if word(input.get(end)) {
            return None;
        }
        let raw = &input[start..number_end];
        // 先按原正则判断科学计数法，其余十进制采用 IEEE-754 correctly-rounded 解析。
        let clamp = raw.iter().any(|unit| *unit == 69 || *unit == 101)
            || String::from_utf16(raw)
                .ok()?
                .parse::<f64>()
                .is_ok_and(|number| !number.is_finite() || number > 100_000.0);
        Some((
            end,
            if clamp {
                CLAMP.to_vec()
            } else {
                input[start..end].to_vec()
            },
        ))
    })
}

pub fn declaration(
    input: &[u16],
    gradient: bool,
    fallback: Option<&[u16]>,
    is_radius: bool,
) -> Option<Vec<u16>> {
    let value = super::normalize_v4(input)?;
    if gradient {
        let normalized = gradient_position(&value);
        let normalized = if normalized.is_empty() {
            fallback.unwrap_or(&normalized).to_vec()
        } else {
            normalized
        };
        if normalized != value {
            return Some(normalized);
        }
    }
    let normalized = infinity(&value, true);
    if normalized != value {
        return Some(normalized);
    }
    Some(if is_radius { radius(&value) } else { value })
}
