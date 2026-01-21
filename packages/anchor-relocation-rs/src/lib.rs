use napi_derive::napi;
use std::cmp::Ordering;
use std::collections::HashSet;

#[napi(object)]
pub struct SubstringMatch {
    pub start: u32,
    pub end: u32,
    pub score: f64,
}

#[napi(object)]
pub struct BlockInput {
    pub block_id: String,
    pub content: String,
}

#[napi(object)]
pub struct BlockMatch {
    pub block_id: String,
    pub start: u32,
    pub end: u32,
    pub score: f64,
}

#[derive(Clone)]
struct IndexedMatch {
    index: usize,
    start: u32,
    end: u32,
    score: f64,
}

#[napi(js_name = "computeTextSimilarity")]
pub fn compute_text_similarity(a: String, b: String) -> f64 {
    let a_utf16 = to_utf16(&a);
    let b_utf16 = to_utf16(&b);
    text_similarity(&a_utf16, &b_utf16)
}

#[napi(js_name = "findSubstringMatches")]
pub fn find_substring_matches(needle: String, haystack: String) -> Vec<SubstringMatch> {
    let needle_utf16 = to_utf16(&needle);
    let haystack_utf16 = to_utf16(&haystack);
    find_substring_matches_utf16(&needle_utf16, &haystack_utf16)
}

#[napi(js_name = "findBlockMatches")]
pub fn find_block_matches(
    needle: String,
    blocks: Vec<BlockInput>,
    threshold: Option<f64>,
) -> Vec<BlockMatch> {
    let min_score = threshold.unwrap_or(0.7);
    let needle_utf16 = to_utf16(&needle);
    let needle_len = needle_utf16.len();
    let mut matches: Vec<BlockMatch> = Vec::new();

    for block in blocks {
        let block_utf16 = to_utf16(&block.content);
        let block_len = block_utf16.len();

        let substring_matches = find_substring_matches_utf16(&needle_utf16, &block_utf16);
        for candidate in substring_matches {
            if candidate.score >= min_score {
                matches.push(BlockMatch {
                    block_id: block.block_id.clone(),
                    start: candidate.start,
                    end: candidate.end,
                    score: candidate.score,
                });
            }
        }

        if needle_len > 0 {
            let length_diff = if block_len > needle_len {
                block_len - needle_len
            } else {
                needle_len - block_len
            };

            if (length_diff as f64) < (needle_len as f64 * 0.5) {
                let similarity = text_similarity(&needle_utf16, &block_utf16);
                if similarity >= min_score {
                    matches.push(BlockMatch {
                        block_id: block.block_id,
                        start: 0,
                        end: block_len as u32,
                        score: similarity,
                    });
                }
            }
        }
    }

    matches
}

#[napi(js_name = "computeFuzzyContextHash")]
pub fn compute_fuzzy_context_hash(prefix: String, suffix: String) -> String {
    let prefix_norm = normalize_text_utf16(&prefix, 100);
    let suffix_norm = normalize_text_utf16(&suffix, 100);

    let mut combined: Vec<u16> = Vec::with_capacity(prefix_norm.len() + 1 + suffix_norm.len());
    combined.extend(prefix_norm);
    combined.push('|' as u16);
    combined.extend(suffix_norm);

    let hash = fnv1a_hash_utf16(&combined);
    format!("{:08x}", hash)
}

#[napi(js_name = "computeNgramSimilarity")]
pub fn compute_ngram_similarity(a: String, b: String, n: Option<u32>) -> f64 {
    let n = n.unwrap_or(3).max(1) as usize;
    ngram_similarity(&a, &b, n)
}

fn to_utf16(value: &str) -> Vec<u16> {
    value.encode_utf16().collect()
}

fn text_similarity(a: &[u16], b: &[u16]) -> f64 {
    if a == b {
        return 1.0;
    }
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }

    let max_len = if a.len() > b.len() { a.len() } else { b.len() };
    let distance = levenshtein_distance(a, b);
    1.0 - (distance as f64) / (max_len as f64)
}

fn levenshtein_distance(a: &[u16], b: &[u16]) -> usize {
    let m = a.len();
    let n = b.len();

    if m == 0 {
        return n;
    }
    if n == 0 {
        return m;
    }

    let mut prev: Vec<usize> = (0..=n).collect();
    let mut curr: Vec<usize> = vec![0; n + 1];

    for i in 1..=m {
        curr[0] = i;
        for j in 1..=n {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            let deletion = prev[j] + 1;
            let insertion = curr[j - 1] + 1;
            let substitution = prev[j - 1] + cost;
            curr[j] = deletion.min(insertion).min(substitution);
        }
        std::mem::swap(&mut prev, &mut curr);
    }

    prev[n]
}

fn find_substring_matches_utf16(needle: &[u16], haystack: &[u16]) -> Vec<SubstringMatch> {
    if needle.len() < 3 || haystack.len() < 3 {
        return Vec::new();
    }

    let needle_len = needle.len();
    let haystack_len = haystack.len();

    let mut window_sizes = Vec::new();
    let candidates = [
        needle_len,
        ((needle_len as f64) * 0.8).floor() as usize,
        ((needle_len as f64) * 1.2).floor() as usize,
        ((needle_len as f64) * 1.5).floor() as usize,
    ];

    for size in candidates {
        if size < 3 || size > haystack_len {
            continue;
        }
        window_sizes.push(size);
    }

    let mut matches: Vec<IndexedMatch> = Vec::new();
    let mut insertion_index = 0usize;

    for window_size in window_sizes {
        if window_size == 0 || haystack_len < window_size {
            continue;
        }

        for start in 0..=haystack_len - window_size {
            let window = &haystack[start..start + window_size];
            let score = text_similarity(needle, window);
            if score > 0.3 {
                matches.push(IndexedMatch {
                    index: insertion_index,
                    start: start as u32,
                    end: (start + window_size) as u32,
                    score,
                });
                insertion_index += 1;
            }
        }
    }

    merge_overlapping_matches(matches)
}

fn merge_overlapping_matches(matches: Vec<IndexedMatch>) -> Vec<SubstringMatch> {
    if matches.is_empty() {
        return Vec::new();
    }

    let mut sorted = matches;
    sorted.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(Ordering::Equal)
            .then_with(|| a.index.cmp(&b.index))
    });

    let mut result: Vec<IndexedMatch> = Vec::new();

    for candidate in sorted {
        let overlaps = result.iter().any(|existing| {
            !(candidate.end <= existing.start || candidate.start >= existing.end)
        });

        if !overlaps {
            result.push(candidate);
        }
    }

    result.sort_by(|a, b| a.start.cmp(&b.start));
    result
        .into_iter()
        .map(|m| SubstringMatch {
            start: m.start,
            end: m.end,
            score: m.score,
        })
        .collect()
}

fn normalize_text_utf16(text: &str, max_len: usize) -> Vec<u16> {
    if text.is_empty() {
        return Vec::new();
    }

    let lower = text.to_lowercase();
    let mut normalized = String::new();
    let mut last_was_space = false;

    for ch in lower.chars() {
        if ch.is_whitespace() {
            if !last_was_space {
                normalized.push(' ');
                last_was_space = true;
            }
        } else {
            normalized.push(ch);
            last_was_space = false;
        }
    }

    let trimmed = normalized.trim();
    let utf16: Vec<u16> = trimmed.encode_utf16().collect();
    if utf16.len() <= max_len {
        return utf16;
    }

    utf16[utf16.len() - max_len..].to_vec()
}

fn fnv1a_hash_utf16(data: &[u16]) -> u32 {
    let mut hash: u32 = 2166136261;
    for code_unit in data {
        hash ^= *code_unit as u32;
        hash = hash.wrapping_mul(16777619);
    }
    hash
}

fn ngram_similarity(a: &str, b: &str, n: usize) -> f64 {
    if a == b {
        return 1.0;
    }

    let a_utf16: Vec<u16> = a.encode_utf16().collect();
    let b_utf16: Vec<u16> = b.encode_utf16().collect();

    if a_utf16.len() < n || b_utf16.len() < n {
        return 0.0;
    }

    let mut ngrams_a: HashSet<Vec<u16>> = HashSet::new();
    let mut ngrams_b: HashSet<Vec<u16>> = HashSet::new();

    for i in 0..=a_utf16.len() - n {
        ngrams_a.insert(a_utf16[i..i + n].to_vec());
    }
    for i in 0..=b_utf16.len() - n {
        ngrams_b.insert(b_utf16[i..i + n].to_vec());
    }

    let mut intersection = 0usize;
    for ngram in &ngrams_a {
        if ngrams_b.contains(ngram) {
            intersection += 1;
        }
    }

    let union = ngrams_a.len() + ngrams_b.len() - intersection;
    if union == 0 {
        return 0.0;
    }

    intersection as f64 / union as f64
}
