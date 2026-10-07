use super::WxmlEscapeEntry;

pub(super) struct EscapeTable {
    entries: [Option<Vec<u16>>; 128],
}

impl EscapeTable {
    pub(super) fn new(entries: Vec<WxmlEscapeEntry>) -> Option<Self> {
        let mut table = Self {
            entries: std::array::from_fn(|_| None),
        };
        for entry in entries {
            if entry.character.len() != 1 || entry.character[0] > 127 {
                return None;
            }
            table.entries[entry.character[0] as usize] = Some(entry.replacement.to_vec());
        }
        Some(table)
    }

    pub(super) fn append(&self, value: &[u16], ignore_head: bool, output: &mut Vec<u16>) {
        // 先去除 CR/LF 再判断首字符，与 replaceWxml 的操作顺序一致。
        let mut units = value
            .iter()
            .copied()
            .filter(|unit| !matches!(unit, 10 | 13))
            .peekable();
        let mut head = true;
        while let Some(unit) = units.next() {
            if unit > 127 {
                let codepoint = if (0xd800..=0xdbff).contains(&unit)
                    && units
                        .peek()
                        .is_some_and(|next| (0xdc00..=0xdfff).contains(next))
                {
                    0x10000
                        + (((unit as u32) - 0xd800) << 10)
                        + ((units.next().expect("low surrogate") as u32) - 0xdc00)
                } else {
                    unit as u32
                };
                output.extend(format!("u_x{codepoint:x}_").encode_utf16());
            } else if let Some(replacement) = &self.entries[unit as usize] {
                output.extend_from_slice(replacement);
            } else {
                if head
                    && !ignore_head
                    && ((48..=57).contains(&unit)
                        || (unit == 45 && units.peek().is_none_or(|next| (48..=57).contains(next))))
                {
                    output.push(95);
                }
                output.push(unit);
            }
            head = false;
        }
    }
}
