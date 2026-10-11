fn hex(unit: u16) -> Option<u16> {
    match unit {
        48..=57 => Some(unit - 48),
        65..=70 => Some(unit - 65 + 10),
        97..=102 => Some(unit - 97 + 10),
        _ => None,
    }
}

fn unicode(units: &[u16], index: usize) -> Option<u16> {
    if units.get(index..index + 2)? != [92, 117] {
        return None;
    }
    units
        .get(index + 2..index + 6)?
        .iter()
        .try_fold(0u16, |value, &unit| Some(value * 16 + hex(unit)?))
}

fn json_string(units: &[u16]) -> Option<Vec<u16>> {
    let mut output = Vec::with_capacity(units.len());
    let mut index = 0;
    while index < units.len() {
        let unit = units[index];
        if unit < 32 || unit == 34 {
            return None;
        }
        if unit == 92 {
            index += 1;
            let replacement = match *units.get(index)? {
                34 => 34,
                92 => 92,
                47 => 47,
                98 => 8,
                102 => 12,
                110 => 10,
                114 => 13,
                116 => 9,
                117 => {
                    let value = unicode(units, index - 1)?;
                    index += 4;
                    value
                }
                _ => return None,
            };
            output.push(replacement);
        } else {
            output.push(unit);
        }
        index += 1;
    }
    Some(output)
}

/// 保留 decodeUnicode2 的 JSON.parse 优先、仅 Unicode 转义兜底的双层语义。
pub(super) fn decode(input: &str) -> Option<String> {
    let units: Vec<u16> = input.encode_utf16().collect();
    if !(0..units.len()).any(|index| unicode(&units, index).is_some()) {
        return Some(input.to_owned());
    }
    let decoded = if let Some(decoded) = json_string(&units) {
        decoded
    } else {
        let mut output = Vec::with_capacity(units.len());
        let mut index = 0;
        while index < units.len() {
            if let Some(unit) = unicode(&units, index) {
                output.push(unit);
                index += 6;
            } else {
                output.push(units[index]);
                index += 1;
            }
        }
        output
    };
    // 无法由 UTF-8 无损表达的解码结果必须继续由 JS 处理。
    String::from_utf16(&decoded).ok()
}
