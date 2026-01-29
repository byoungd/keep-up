use tree_sitter::Language;

pub fn resolve_language(label: &str) -> Option<Language> {
    match label {
        "ts" | "typescript" => Some(tree_sitter_typescript::language_typescript()),
        "tsx" => Some(tree_sitter_typescript::language_tsx()),
        "js" | "javascript" | "jsx" => Some(tree_sitter_javascript::language()),
        _ => None,
    }
}
