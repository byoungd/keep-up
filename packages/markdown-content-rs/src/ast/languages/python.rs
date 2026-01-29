use tree_sitter::Language;

pub fn resolve_language(label: &str) -> Option<Language> {
    match label {
        "py" | "python" => Some(tree_sitter_python::language()),
        _ => None,
    }
}
