mod parser;
mod transform;
pub mod compat;

use std::borrow::Cow;

#[derive(Clone, PartialEq)]
pub enum Kind {
    Word,
    Space,
    String,
    Comment,
    Div,
    Function,
}

#[derive(Clone)]
pub struct Node<'a> {
    pub kind: Kind,
    pub value: Cow<'a, [u16]>,
    pub before: Cow<'a, [u16]>,
    pub after: Cow<'a, [u16]>,
    pub quote: u16,
    pub nodes: Vec<Node<'a>>,
}

impl<'a> Node<'a> {
    pub fn new(kind: Kind, value: &'a [u16]) -> Self {
        Self {
            kind,
            value: Cow::Borrowed(value),
            before: Cow::Borrowed(&[]),
            after: Cow::Borrowed(&[]),
            quote: 0,
            nodes: Vec::new(),
        }
    }
}

pub fn eq(value: &[u16], text: &str) -> bool {
    value.iter().copied().eq(text.encode_utf16())
}

pub fn eq_ignore_case(value: &[u16], text: &str) -> bool {
    value
        .iter()
        .map(|unit| {
            if (65..=90).contains(unit) {
                unit + 32
            } else {
                *unit
            }
        })
        .eq(text.encode_utf16())
}

fn stringify(nodes: &[Node], output: &mut Vec<u16>) {
    for node in nodes {
        match node.kind {
            Kind::Word | Kind::Space => output.extend_from_slice(&node.value),
            Kind::String => {
                output.push(node.quote);
                output.extend_from_slice(&node.value);
                output.push(node.quote);
            }
            Kind::Comment => {
                output.extend([47, 42]);
                output.extend_from_slice(&node.value);
                output.extend([42, 47]);
            }
            Kind::Div => {
                output.extend_from_slice(&node.before);
                output.extend_from_slice(&node.value);
                output.extend_from_slice(&node.after);
            }
            Kind::Function => {
                output.extend_from_slice(&node.value);
                output.push(40);
                output.extend_from_slice(&node.before);
                stringify(&node.nodes, output);
                output.extend_from_slice(&node.after);
                output.push(41);
            }
        }
    }
}

pub fn normalize_v4(input: &[u16]) -> Option<Vec<u16>> {
    let mut nodes = parser::parse(input)?;
    let contains = |text: &str| {
        let needle: Vec<_> = text.encode_utf16().collect();
        input.windows(needle.len()).any(|window| window == needle)
    };
    let mut changed = false;
    if contains("var(") && contains("--tw-") {
        changed |= transform::empty_fallbacks(&mut nodes);
    }
    if contains("var(") && contains("--tw-gradient-via-stops") {
        changed |= transform::gradient_stops(&mut nodes);
    }
    if contains("var(") && contains("--tw-gradient-") {
        changed |= transform::gradient_positions(&mut nodes);
    }
    if !changed {
        return Some(input.to_vec());
    }
    let mut output = Vec::with_capacity(input.len());
    stringify(&nodes, &mut output);
    Some(output)
}

pub fn normalize_translate(input: &[u16]) -> Option<Vec<u16>> {
    let mut nodes = parser::parse(input)?;
    if !transform::translate(&mut nodes) {
        return Some(input.to_vec());
    }
    let mut output = Vec::with_capacity(input.len());
    stringify(&nodes, &mut output);
    Some(output)
}

#[cfg(test)]
mod tests;
