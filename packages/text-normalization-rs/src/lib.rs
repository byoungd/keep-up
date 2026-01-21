use napi_derive::napi;
use regex::Regex;
use std::sync::OnceLock;

#[allow(non_snake_case)]
#[napi(object)]
pub struct CanonicalResult {
    pub blocks: Vec<String>,
    pub canonicalText: String,
}

#[allow(non_snake_case)]
#[napi(object)]
pub struct CanonicalHashResult {
    pub docHash: String,
    pub blockHashes: Vec<String>,
}

#[napi(object)]
pub struct CanonicalBlockInput {
    pub text: String,
}

#[napi(js_name = "canonicalizeText")]
pub fn canonicalize_text(text: String) -> CanonicalResult {
    if text.is_empty() {
        return CanonicalResult {
            blocks: Vec::new(),
            canonicalText: String::new(),
        };
    }

    let blocks: Vec<String> = block_splitter()
        .split(&text)
        .map(|block| block.trim())
        .filter(|block| !block.is_empty())
        .map(str::to_string)
        .collect();

    let canonical_text = blocks.join("\n\n");

    CanonicalResult {
        blocks,
        canonicalText: canonical_text,
    }
}

#[napi(js_name = "computeCanonicalHash")]
pub fn compute_canonical_hash(blocks: Vec<CanonicalBlockInput>) -> CanonicalHashResult {
    let mut block_hashes: Vec<String> = Vec::with_capacity(blocks.len());

    for block in blocks {
        block_hashes.push(hash_hex(&block.text));
    }

    let doc_hash = hash_hex(&block_hashes.join("|"));

    CanonicalHashResult {
        docHash: doc_hash,
        blockHashes: block_hashes,
    }
}

fn block_splitter() -> &'static Regex {
    static SPLIT_REGEX: OnceLock<Regex> = OnceLock::new();
    SPLIT_REGEX.get_or_init(|| Regex::new(r"\n\s*\n").expect("valid block split regex"))
}

fn hash_hex(input: &str) -> String {
    let hash = fnv1a_hash_utf16(input);
    format!("{:08x}", hash)
}

fn fnv1a_hash_utf16(input: &str) -> u32 {
    let mut hash: u32 = 0x811c9dc5;
    for unit in input.encode_utf16() {
        hash ^= unit as u32;
        hash = hash.wrapping_mul(0x01000193);
    }
    hash
}
