pub(super) struct Utf16Offsets {
    corrections: Vec<(u32, u32)>,
}

impl Utf16Offsets {
    pub(super) fn new(source: &str) -> Self {
        let mut corrections = Vec::new();
        let mut delta = 0;
        for (index, character) in source.char_indices() {
            if !character.is_ascii() {
                delta += (character.len_utf8() - character.len_utf16()) as u32;
                corrections.push(((index + character.len_utf8()) as u32, delta));
            }
        }
        Self { corrections }
    }

    pub(super) fn convert(&self, offset: u32) -> u32 {
        let index = self.corrections.partition_point(|&(end, _)| end <= offset);
        offset
            - index
                .checked_sub(1)
                .map_or(0, |index| self.corrections[index].1)
    }
}

#[cfg(test)]
mod tests {
    use super::Utf16Offsets;

    #[test]
    fn converts_only_at_unicode_boundaries() {
        let source = "a中文😀x";
        let offsets = Utf16Offsets::new(source);
        for (byte, _) in source.char_indices() {
            assert_eq!(
                offsets.convert(byte as u32),
                source[..byte].encode_utf16().count() as u32
            );
        }
        assert_eq!(offsets.convert(source.len() as u32), 6);
    }
}
