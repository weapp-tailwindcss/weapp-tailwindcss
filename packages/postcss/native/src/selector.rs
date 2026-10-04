use crate::escape::{escape_class, EscapeMapping};

fn whitespace(unit: u16) -> bool {
    matches!(unit, 9 | 10 | 12 | 13 | 32)
}

fn name(unit: u16) -> bool {
    matches!(unit, 45 | 48..=57 | 65..=90 | 95 | 97..=122 | 128..=65535)
}

fn hex(unit: u16) -> Option<u32> {
    match unit {
        48..=57 => Some((unit - 48) as u32),
        65..=70 => Some((unit - 55) as u32),
        97..=102 => Some((unit - 87) as u32),
        _ => None,
    }
}

fn escaped(input: &[u16], index: &mut usize, output: &mut Vec<u16>) -> Option<()> {
    *index += 1;
    let Some(&first) = input.get(*index) else {
        output.push(92);
        return Some(());
    };
    if hex(first).is_none() {
        if whitespace(first) || first < 32 || first == 127 {
            return None;
        }
        output.push(first);
        *index += 1;
        return Some(());
    }
    let start = *index;
    let mut point = 0;
    while *index - start < 6 {
        let Some(digit) = input.get(*index).and_then(|unit| hex(*unit)) else {
            break;
        };
        point = point * 16 + digit;
        *index += 1;
    }
    // selector-parser 对六位转义及非空格终止符有特殊行为，保留给兼容路径。
    if let Some(&next) = input.get(*index) {
        if whitespace(next) {
            if next != 32 || *index - start == 6 {
                return None;
            }
            *index += 1;
        }
    }
    if point == 0 || (0xd800..=0xdfff).contains(&point) || point > 0x10ffff {
        point = 0xfffd;
    }
    if point <= 32 || point == 127 {
        return None;
    }
    if point <= 0xffff {
        output.push(point as u16);
    } else {
        point -= 0x10000;
        output.extend([
            0xd800 + (point >> 10) as u16,
            0xdc00 + (point & 0x3ff) as u16,
        ]);
    }
    Some(())
}

/// 只接管类名、简单 ID、嵌套符、组合器和列表；其它语法由原有 AST 管线处理。
pub fn transform(input: &[u16], mapping: &EscapeMapping) -> Option<Vec<u16>> {
    let mut output = Vec::with_capacity(input.len());
    let mut index = 0;
    let mut has_class = false;
    let mut has_node = false;
    let mut pending_space = false;
    while index < input.len() {
        let unit = input[index];
        if whitespace(unit) {
            pending_space = has_node;
            index += 1;
            continue;
        }
        if matches!(unit, 44 | 43 | 62 | 126) {
            if !has_node {
                return None;
            }
            output.push(unit);
            index += 1;
            pending_space = false;
            has_node = false;
            continue;
        }
        if !matches!(unit, 46 | 35 | 38) {
            return None;
        }
        if pending_space {
            output.push(32);
        }
        pending_space = false;
        output.push(unit);
        index += 1;
        has_node = true;
        if unit == 38 {
            continue;
        }
        let start = index;
        let mut decoded = Vec::new();
        while index < input.len() {
            let next = input[index];
            if unit == 46 && next == 92 {
                escaped(input, &mut index, &mut decoded)?;
            } else if name(next) && (unit == 46 || next < 128) {
                decoded.push(next);
                index += 1;
            } else {
                break;
            }
        }
        if index == start {
            return None;
        }
        if unit == 46 {
            has_class = true;
            let replaced = escape_class(&decoded, mapping);
            // 默认映射的输出必须是标识符；空白等需要 cssesc 序列化的输入回退。
            if replaced.iter().any(|unit| !name(*unit) || *unit >= 128) {
                return None;
            }
            if replaced.starts_with(&[45, 45]) {
                output.push(92);
            }
            output.extend(replaced);
        } else {
            output.extend(decoded);
        }
    }
    (has_class && has_node).then_some(output)
}

#[cfg(test)]
mod tests;
