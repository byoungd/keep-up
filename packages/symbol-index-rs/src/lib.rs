use std::collections::{HashMap, HashSet};

const DEFAULT_QUERY_LIMIT: usize = 20;

type SymbolId = usize;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Symbol {
    pub name: String,
    pub kind: String,
    pub file: String,
    pub line: u32,
    pub column: u32,
    pub end_line: u32,
    pub end_column: u32,
    pub container: Option<String>,
    pub detail: Option<String>,
}

impl Symbol {
    pub fn new(
        name: impl Into<String>,
        kind: impl Into<String>,
        file: impl Into<String>,
        line: u32,
        column: u32,
        end_line: u32,
        end_column: u32,
    ) -> Self {
        Self {
            name: name.into(),
            kind: kind.into(),
            file: file.into(),
            line,
            column,
            end_line,
            end_column,
            container: None,
            detail: None,
        }
    }

    pub fn with_container(mut self, container: impl Into<String>) -> Self {
        self.container = Some(container.into());
        self
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SymbolResult {
    pub symbol: Symbol,
    pub score: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IndexStats {
    pub symbol_count: usize,
    pub file_count: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct QueryOptions {
    pub limit: Option<usize>,
    pub kinds: Option<Vec<String>>,
}

impl QueryOptions {
    pub fn with_limit(mut self, limit: usize) -> Self {
        self.limit = Some(limit);
        self
    }

    pub fn with_kinds(mut self, kinds: Vec<String>) -> Self {
        self.kinds = Some(kinds);
        self
    }
}

pub struct SymbolIndex {
    entries: Vec<Option<SymbolEntry>>,
    file_to_symbols: HashMap<String, Vec<SymbolId>>,
    token_index: HashMap<String, HashSet<SymbolId>>,
    trigram_index: HashMap<u32, HashSet<SymbolId>>,
    symbol_count: usize,
}

impl Default for SymbolIndex {
    fn default() -> Self {
        Self::new()
    }
}

impl SymbolIndex {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            file_to_symbols: HashMap::new(),
            token_index: HashMap::new(),
            trigram_index: HashMap::new(),
            symbol_count: 0,
        }
    }

    pub fn update_file(&mut self, path: &str, symbols: &[Symbol]) {
        let normalized = normalize_path(path);
        if let Some(previous) = self.file_to_symbols.remove(&normalized) {
            for id in previous {
                self.remove_symbol(id);
            }
        }

        if symbols.is_empty() {
            return;
        }

        let mut ids = Vec::with_capacity(symbols.len());
        for symbol in symbols {
            let entry = SymbolEntry::new(symbol.clone(), &normalized);
            let id = self.entries.len();
            self.add_to_indices(id, &entry);
            self.entries.push(Some(entry));
            self.symbol_count += 1;
            ids.push(id);
        }

        self.file_to_symbols.insert(normalized, ids);
    }

    pub fn remove_file(&mut self, path: &str) {
        let normalized = normalize_path(path);
        if let Some(previous) = self.file_to_symbols.remove(&normalized) {
            for id in previous {
                self.remove_symbol(id);
            }
        }
    }

    pub fn query(&self, query: &str, options: QueryOptions) -> Vec<SymbolResult> {
        let normalized_query = normalize_token(query);
        let tokens = tokenize_normalized(&normalized_query);
        if tokens.is_empty() {
            return Vec::new();
        }

        let query_trigrams = trigrams(&normalized_query);
        let mut candidates = HashSet::new();

        for token in &tokens {
            if let Some(ids) = self.token_index.get(token) {
                for id in ids {
                    candidates.insert(*id);
                }
            }
        }

        if !query_trigrams.is_empty() {
            for gram in &query_trigrams {
                if let Some(ids) = self.trigram_index.get(gram) {
                    for id in ids {
                        candidates.insert(*id);
                    }
                }
            }
        }

        if candidates.is_empty() {
            return Vec::new();
        }

        let allowed_kinds = options.kinds.map(|kinds| {
            kinds
                .into_iter()
                .map(|kind| kind.to_lowercase())
                .collect::<HashSet<String>>()
        });
        let mut results = Vec::new();

        for id in candidates {
            let entry = match self.entries.get(id).and_then(|entry| entry.as_ref()) {
                Some(entry) => entry,
                None => continue,
            };

            if let Some(ref kinds) = allowed_kinds {
                if !kinds.contains(&entry.kind_norm) {
                    continue;
                }
            }

            let score = score_symbol(&tokens, &query_trigrams, entry);
            if score > 0 {
                results.push(SymbolResult {
                    symbol: entry.symbol.clone(),
                    score,
                });
            }
        }

        results.sort_by(|a, b| {
            b.score
                .cmp(&a.score)
                .then_with(|| a.symbol.name.cmp(&b.symbol.name))
                .then_with(|| a.symbol.file.cmp(&b.symbol.file))
                .then_with(|| a.symbol.line.cmp(&b.symbol.line))
                .then_with(|| a.symbol.column.cmp(&b.symbol.column))
        });

        let limit = options.limit.unwrap_or(DEFAULT_QUERY_LIMIT);
        results.truncate(limit);
        results
    }

    pub fn stats(&self) -> IndexStats {
        IndexStats {
            symbol_count: self.symbol_count,
            file_count: self.file_to_symbols.len(),
        }
    }

    fn add_to_indices(&mut self, id: SymbolId, entry: &SymbolEntry) {
        for token in &entry.tokens {
            self.token_index
                .entry(token.clone())
                .or_default()
                .insert(id);
        }
        for gram in &entry.trigrams {
            self.trigram_index.entry(*gram).or_default().insert(id);
        }
    }

    fn remove_symbol(&mut self, id: SymbolId) {
        let entry = match self.entries.get_mut(id).and_then(|entry| entry.take()) {
            Some(entry) => entry,
            None => return,
        };

        for token in &entry.tokens {
            let remove_key = match self.token_index.get_mut(token) {
                Some(set) => {
                    set.remove(&id);
                    set.is_empty()
                }
                None => false,
            };
            if remove_key {
                self.token_index.remove(token);
            }
        }

        for gram in &entry.trigrams {
            let remove_key = match self.trigram_index.get_mut(gram) {
                Some(set) => {
                    set.remove(&id);
                    set.is_empty()
                }
                None => false,
            };
            if remove_key {
                self.trigram_index.remove(gram);
            }
        }

        if self.symbol_count > 0 {
            self.symbol_count -= 1;
        }
    }
}

struct SymbolEntry {
    symbol: Symbol,
    name_norm: String,
    container_norm: String,
    detail_norm: String,
    kind_norm: String,
    tokens: Vec<String>,
    trigrams: Vec<u32>,
}

impl SymbolEntry {
    fn new(mut symbol: Symbol, file: &str) -> Self {
        symbol.file = file.to_string();
        let name_norm = normalize_token(&symbol.name);
        let container_norm = symbol
            .container
            .as_deref()
            .map(normalize_token)
            .unwrap_or_default();
        let detail_norm = symbol
            .detail
            .as_deref()
            .map(normalize_token)
            .unwrap_or_default();
        let kind_norm = symbol.kind.to_lowercase();

        let mut token_set = HashSet::new();
        for token in tokenize_normalized(&name_norm) {
            token_set.insert(token);
        }
        for token in tokenize_normalized(&container_norm) {
            token_set.insert(token);
        }
        for token in tokenize_normalized(&detail_norm) {
            token_set.insert(token);
        }
        let mut tokens: Vec<String> = token_set.into_iter().collect();
        tokens.sort();

        let trigrams = trigrams(&name_norm);

        Self {
            symbol,
            name_norm,
            container_norm,
            detail_norm,
            kind_norm,
            tokens,
            trigrams,
        }
    }
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
}

fn normalize_token(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut prev_is_lower_or_digit = false;

    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            if ch.is_ascii_uppercase() && prev_is_lower_or_digit {
                output.push(' ');
            }
            let lower = ch.to_ascii_lowercase();
            output.push(lower);
            prev_is_lower_or_digit = lower.is_ascii_lowercase() || lower.is_ascii_digit();
        } else {
            output.push(' ');
            prev_is_lower_or_digit = false;
        }
    }

    output
        .split_whitespace()
        .filter(|piece| !piece.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn tokenize_normalized(normalized: &str) -> Vec<String> {
    if normalized.is_empty() {
        return Vec::new();
    }

    let mut unique = HashSet::new();
    for piece in normalized.split_whitespace() {
        if piece.len() < 2 {
            continue;
        }
        unique.insert(piece.to_string());
    }

    let mut tokens: Vec<String> = unique.into_iter().collect();
    tokens.sort();
    tokens
}

fn trigrams(value: &str) -> Vec<u32> {
    let bytes: Vec<u8> = value
        .bytes()
        .filter(|byte| byte.is_ascii_alphanumeric())
        .collect();

    if bytes.len() < 3 {
        return Vec::new();
    }

    // Pack three ASCII bytes into a u32 for cheap hashing.
    let mut grams = Vec::with_capacity(bytes.len() - 2);
    for index in 0..(bytes.len() - 2) {
        let hash = u32::from_le_bytes([bytes[index], bytes[index + 1], bytes[index + 2], 0]);
        grams.push(hash);
    }

    grams.sort_unstable();
    grams.dedup();
    grams
}

fn score_symbol(tokens: &[String], query_trigrams: &[u32], entry: &SymbolEntry) -> u32 {
    let mut score = 0;
    for token in tokens {
        score += score_token(token, &entry.name_norm) * 2;
        if !entry.container_norm.is_empty() {
            score += score_token(token, &entry.container_norm);
        }
        if !entry.detail_norm.is_empty() {
            score += score_token(token, &entry.detail_norm);
        }
    }

    if !query_trigrams.is_empty() && !entry.trigrams.is_empty() {
        score += trigram_overlap(query_trigrams, &entry.trigrams);
    }

    score
}

fn score_token(token: &str, text: &str) -> u32 {
    if text.is_empty() {
        return 0;
    }
    if text == token {
        return 6;
    }
    if text.starts_with(token) {
        return 4;
    }
    if text.contains(token) {
        return 2;
    }
    0
}

fn trigram_overlap(left: &[u32], right: &[u32]) -> u32 {
    let mut count = 0;
    let mut left_index = 0;
    let mut right_index = 0;

    while left_index < left.len() && right_index < right.len() {
        let left_value = left[left_index];
        let right_value = right[right_index];

        if left_value == right_value {
            count += 1;
            left_index += 1;
            right_index += 1;
        } else if left_value < right_value {
            left_index += 1;
        } else {
            right_index += 1;
        }
    }

    count
}

#[cfg(test)]
mod tests {
    use super::*;

    fn symbol(name: &str, kind: &str, file: &str, line: u32) -> Symbol {
        Symbol::new(name, kind, file, line, 1, line, 10)
    }

    #[test]
    fn update_and_query_symbols() {
        let mut index = SymbolIndex::new();
        let symbols = vec![
            symbol("SymbolGraph", "class", "src/lsp/symbolGraph.ts", 1),
            symbol("ImportGraph", "class", "src/lsp/importGraph.ts", 1),
        ];

        index.update_file("src/lsp/symbolGraph.ts", &symbols[..1]);
        index.update_file("src/lsp/importGraph.ts", &symbols[1..]);

        let results = index.query("symbol graph", QueryOptions::default());
        assert!(!results.is_empty());
        assert_eq!(results[0].symbol.name, "SymbolGraph");
    }

    #[test]
    fn update_file_replaces_previous_symbols() {
        let mut index = SymbolIndex::new();
        let original = vec![symbol("Original", "class", "src/foo.ts", 1)];
        let updated = vec![symbol("Updated", "class", "src/foo.ts", 2)];

        index.update_file("src/foo.ts", &original);
        assert_eq!(index.stats().symbol_count, 1);

        index.update_file("src/foo.ts", &updated);
        assert_eq!(index.stats().symbol_count, 1);

        let results = index.query("updated", QueryOptions::default());
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].symbol.name, "Updated");
    }

    #[test]
    fn remove_file_clears_symbols() {
        let mut index = SymbolIndex::new();
        let symbols = vec![symbol("SymbolGraph", "class", "src/foo.ts", 1)];

        index.update_file("src/foo.ts", &symbols);
        index.remove_file("src/foo.ts");

        let results = index.query("symbol", QueryOptions::default());
        assert!(results.is_empty());
        assert_eq!(index.stats().symbol_count, 0);
    }

    #[test]
    fn fuzzy_query_uses_trigram_overlap() {
        let mut index = SymbolIndex::new();
        let symbols = vec![symbol("SymbolGraph", "class", "src/foo.ts", 1)];

        index.update_file("src/foo.ts", &symbols);

        let results = index.query("symblgrph", QueryOptions::default());
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].symbol.name, "SymbolGraph");
    }

    #[test]
    fn kind_filter_is_case_insensitive() {
        let mut index = SymbolIndex::new();
        let symbols = vec![
            symbol("SymbolGraph", "Class", "src/foo.ts", 1),
            symbol("symbol_graph", "function", "src/foo.ts", 5),
        ];

        index.update_file("src/foo.ts", &symbols);

        let results = index.query(
            "symbol",
            QueryOptions::default().with_kinds(vec!["class".to_string()]),
        );
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].symbol.name, "SymbolGraph");
    }
}
