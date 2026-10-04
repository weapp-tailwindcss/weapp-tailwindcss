pub type EscapeMapping = [Option<Vec<u16>>; 128];

pub fn default_mapping() -> EscapeMapping {
    let mut mapping = std::array::from_fn(|_| None);
    for (character, token) in [
        ('[', 'b'),
        (']', 'B'),
        ('(', 'p'),
        (')', 'P'),
        ('#', 'h'),
        ('!', 'e'),
        ('/', 'f'),
        ('\\', 'r'),
        ('.', 'd'),
        (':', 'c'),
        ('%', 'v'),
        (',', 'm'),
        ('\'', 'a'),
        ('"', 'q'),
        ('*', 'x'),
        ('&', 'n'),
        ('@', 't'),
        ('{', 'k'),
        ('}', 'K'),
        ('+', 'u'),
        (';', 'j'),
        ('<', 'l'),
        ('~', 'w'),
        ('=', 'z'),
        ('>', 'g'),
        ('?', 'Q'),
        ('^', 'y'),
        ('`', 'i'),
        ('|', 'o'),
        ('$', 's'),
    ] {
        mapping[character as usize] = Some(vec![b'_' as u16, token as u16]);
    }
    mapping
}

pub fn escape_class(value: &[u16], mapping: &EscapeMapping) -> Vec<u16> {
    let mut result = Vec::with_capacity(value.len());
    let mut index = 0;
    while index < value.len() {
        let first = value[index];
        let mut code_point = first as u32;
        let mut size = 1;
        if (0xd800..=0xdbff).contains(&first) {
            if let Some(second) = value
                .get(index + 1)
                .filter(|next| (0xdc00..=0xdfff).contains(*next))
            {
                code_point = ((first as u32 - 0xd800) << 10) + (*second as u32 - 0xdc00) + 0x10000;
                size = 2;
            }
        }
        if code_point > 127 {
            result.extend(format!("u_x{code_point:x}_").encode_utf16());
        } else if let Some(mapped) = &mapping[code_point as usize] {
            result.extend_from_slice(mapped);
        } else {
            let digit = (b'0' as u16..=b'9' as u16).contains(&first);
            let negative_digit = first == b'-' as u16
                && value
                    .get(index + 1)
                    .is_none_or(|next| (b'0' as u16..=b'9' as u16).contains(next));
            if index == 0 && (digit || negative_digit) {
                result.push(b'_' as u16);
            }
            result.push(first);
        }
        index += size;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn escaped(value: &str) -> String {
        String::from_utf16(&escape_class(
            &value.encode_utf16().collect::<Vec<_>>(),
            &default_mapping(),
        ))
        .unwrap()
    }

    #[test]
    fn escapes_symbols_and_leading_characters() {
        assert_eq!(escaped("w-[10px]"), "w-_b10px_B");
        assert_eq!(
            escaped("2xl:hover:text-red-500"),
            "_2xl_chover_ctext-red-500"
        );
        assert_eq!(escaped("-"), "_-");
        assert_eq!(escaped("-2"), "_-2");
        assert_eq!(escaped("--2"), "--2");
        assert_eq!(escaped("plain name"), "plain name");
    }

    #[test]
    fn preserves_javascript_utf16_semantics() {
        assert_eq!(escaped("中文😀"), "u_x4e2d_u_x6587_u_x1f600_");
        assert_eq!(
            escape_class(&[0xd800, 0x61, 0xdc00], &default_mapping()),
            "u_xd800_au_xdc00_".encode_utf16().collect::<Vec<_>>()
        );
    }

    #[test]
    fn merges_custom_map_without_reescaping_replacements() {
        let mut mapping = default_mapping();
        mapping[b'.' as usize] = Some(vec![0xd800, b'.' as u16]);
        mapping[b':' as usize] = Some(vec![]);
        mapping[b'[' as usize] = None;
        assert_eq!(
            escape_class(&".a:[b]".encode_utf16().collect::<Vec<_>>(), &mapping),
            vec![0xd800, 46, 97, 91, 98, 95, 66]
        );
    }
}
