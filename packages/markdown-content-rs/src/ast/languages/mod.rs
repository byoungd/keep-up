use tree_sitter::Language;

mod python;
mod rust;
mod typescript;

pub fn resolve_language(label: &str) -> Option<Language> {
    let normalized = label.trim().to_lowercase();
    typescript::resolve_language(&normalized)
        .or_else(|| python::resolve_language(&normalized))
        .or_else(|| rust::resolve_language(&normalized))
}
