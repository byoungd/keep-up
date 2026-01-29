use tree_sitter::Language;

pub fn resolve_language(label: &str) -> Option<Language> {
    match label {
        "rs" | "rust" => Some(tree_sitter_rust::language()),
        _ => None,
    }
}
