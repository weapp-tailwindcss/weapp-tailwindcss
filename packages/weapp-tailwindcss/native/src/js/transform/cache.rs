use std::{collections::VecDeque, rc::Rc};

use super::super::{JsSourceAnalysis, analyze_for_transform};

pub(super) struct CachedAnalysis {
    pub source: String,
    pub analysis: JsSourceAnalysis,
    lang: String,
    source_type: String,
    preserve_parens: bool,
    size: usize,
}

pub(super) const MAX_CACHE_BYTES: usize = 2 * 1024 * 1024;
pub(super) const MAX_CACHE_ENTRIES: usize = 128;

#[derive(Default)]
pub(super) struct AnalysisCache {
    pub entries: VecDeque<Rc<CachedAnalysis>>,
    pub size: usize,
}

impl AnalysisCache {
    pub fn resolve(
        &mut self,
        source: String,
        lang: String,
        source_type: String,
        preserve_parens: bool,
    ) -> Option<Rc<CachedAnalysis>> {
        let index = self.entries.iter().position(|entry| {
            entry.source == source
                && entry.lang == lang
                && entry.source_type == source_type
                && entry.preserve_parens == preserve_parens
        });
        if let Some(index) = index {
            let entry = self.entries.remove(index)?;
            self.entries.push_front(Rc::clone(&entry));
            return Some(entry);
        }
        let (analysis, _) =
            analyze_for_transform(&source, &lang, &source_type, preserve_parens, false, true)?;
        let size = source.len()
            + analysis
                .literals
                .iter()
                .map(|item| item.value.len() + 104)
                .sum::<usize>();
        let entry = Rc::new(CachedAnalysis {
            source,
            analysis,
            lang,
            source_type,
            preserve_parens,
            size,
        });
        if size <= MAX_CACHE_BYTES {
            while self.entries.len() >= MAX_CACHE_ENTRIES || self.size + size > MAX_CACHE_BYTES {
                if let Some(oldest) = self.entries.pop_back() {
                    self.size -= oldest.size;
                }
            }
            self.size += size;
            self.entries.push_front(Rc::clone(&entry));
        }
        Some(entry)
    }
}
