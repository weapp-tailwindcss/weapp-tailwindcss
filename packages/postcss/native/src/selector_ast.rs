mod arena;
mod attribute;
mod parser;
mod pseudos;
mod transform;

use crate::escape::EscapeMapping;
use arena::{Arena, Kind};

pub struct Options {
    pub root: Option<Vec<u16>>,
    pub universal: Option<Vec<u16>>,
    pub child: Vec<Vec<u16>>,
    pub unsupported: Vec<Vec<u16>>,
    pub uni_app_x: bool,
}

pub struct Result {
    pub selector: Vec<u16>,
    pub remove: bool,
    pub spacing: bool,
}

pub fn unsupported_pseudos(hover: bool, active: bool, focus: bool) -> Vec<Vec<u16>> {
    let mut values: Vec<_> = [
        ":autofill",
        ":checked",
        ":default",
        ":disabled",
        ":enabled",
        ":focus-visible",
        ":focus-within",
        ":fullscreen",
        ":indeterminate",
        ":in-range",
        ":invalid",
        ":modal",
        ":open",
        ":optional",
        ":out-of-range",
        ":placeholder-shown",
        ":read-only",
        ":read-write",
        ":required",
        ":target",
        ":valid",
        ":visited",
    ]
    .into_iter()
    .map(text)
    .collect();
    for (enabled, value) in [(hover, ":hover"), (active, ":active"), (focus, ":focus")] {
        if enabled {
            values.push(text(value));
        }
    }
    values
}

pub fn transform(input: &[u16], options: &Options, mapping: &EscapeMapping) -> Option<Result> {
    let mut ast = parser::parse(input)?;
    let root = 0;
    let mut context = transform::Context {
        options,
        mapping,
        spacing: false,
    };
    transform::walk(&mut ast, root, &mut context)?;
    transform::cleanup(&mut ast, root);
    let remove = ast.nodes[root].children.is_empty();
    let mut selector = Vec::with_capacity(input.len());
    stringify(&ast, root, &mut selector);
    Some(Result {
        selector,
        remove,
        spacing: context.spacing,
    })
}

fn stringify(ast: &Arena, id: usize, output: &mut Vec<u16>) {
    let node = &ast.nodes[id];
    let text = node.raw.as_ref().unwrap_or(&node.value);
    match node.kind {
        Kind::Root | Kind::Pseudo => {
            if node.kind == Kind::Pseudo {
                output.extend_from_slice(text);
                if node.children.is_empty() {
                    return;
                }
                output.push(40);
            }
            for (index, child) in node.children.iter().enumerate() {
                if index != 0 {
                    output.push(44);
                }
                stringify(ast, *child, output);
            }
            if node.kind == Kind::Pseudo {
                output.push(41);
            } else if ast.trailing_comma {
                output.push(44);
            }
        }
        Kind::Selector => {
            for child in &node.children {
                stringify(ast, *child, output);
            }
        }
        Kind::Class | Kind::Id => {
            output.push(if node.kind == Kind::Class { 46 } else { 35 });
            output.extend_from_slice(text);
        }
        _ => output.extend_from_slice(text),
    }
}

fn text(value: &str) -> Vec<u16> {
    value.encode_utf16().collect()
}
fn eq(value: &[u16], expected: &str) -> bool {
    value.iter().copied().eq(expected.encode_utf16())
}

#[cfg(test)]
mod tests;
