use crate::LineRange;

mod languages;
mod parser;
mod symbols;

pub fn resolve_code_symbol(
    content: &str,
    language: &str,
    symbol_name: &str,
    symbol_kind: &str,
) -> Option<LineRange> {
    let tree = parser::parse_content(content, language)?;
    symbols::resolve_symbol_range(&tree, content, symbol_name, symbol_kind)
}
