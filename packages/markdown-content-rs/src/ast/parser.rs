use tree_sitter::{Parser, Tree};

use super::languages;

pub fn parse_content(content: &str, language: &str) -> Option<Tree> {
    let mut parser = Parser::new();
    let ts_language = languages::resolve_language(language)?;
    if parser.set_language(ts_language).is_err() {
        return None;
    }
    parser.parse(content, None)
}
