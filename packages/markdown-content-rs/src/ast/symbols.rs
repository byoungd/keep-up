use tree_sitter::{Node, Tree};

use crate::LineRange;

pub fn resolve_symbol_range(
    tree: &Tree,
    source: &str,
    symbol_name: &str,
    symbol_kind: &str,
) -> Option<LineRange> {
    let kinds: &[&str] = match symbol_kind {
        "function" => &["function_declaration", "function_definition", "method_definition"],
        "class" => &["class_declaration", "class_definition"],
        "variable" => &["variable_declarator"],
        "import" => &[],
        _ => &[],
    };

    if kinds.is_empty() {
        return None;
    }

    find_named_node(tree.root_node(), source, symbol_name, kinds).map(node_to_range)
}

fn find_named_node<'a>(
    root: Node<'a>,
    source: &str,
    symbol_name: &str,
    kinds: &[&str],
) -> Option<Node<'a>> {
    let mut stack = vec![root];
    while let Some(node) = stack.pop() {
        if kinds.iter().any(|kind| *kind == node.kind()) {
            if let Some(name_node) = node.child_by_field_name("name") {
                if let Ok(text) = name_node.utf8_text(source.as_bytes()) {
                    if text == symbol_name {
                        return Some(node);
                    }
                }
            }
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            stack.push(child);
        }
    }
    None
}

fn node_to_range(node: Node) -> LineRange {
    let start = node.start_position().row as u32 + 1;
    let end = node.end_position().row as u32 + 1;
    LineRange { start, end }
}
