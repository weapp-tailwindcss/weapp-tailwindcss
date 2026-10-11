use super::{eq, eq_ignore_case, Kind, Node};
use std::borrow::Cow;

fn comma(node: &Node) -> bool {
    node.kind == Kind::Div && node.value.as_ref() == [44]
}

pub fn empty_fallbacks(nodes: &mut [Node]) -> bool {
    let mut changed = false;
    for node in nodes {
        if node.kind != Kind::Function {
            continue;
        }
        let mut args = node.nodes.iter().filter(|node| node.kind != Kind::Space);
        let first = args.next();
        let last = args.next_back().or(first);
        if eq_ignore_case(&node.value, "var")
            && first.is_some_and(|node| {
                node.kind == Kind::Word && node.value.starts_with(&[45, 45, 116, 119, 45])
            })
            && last.is_some_and(comma)
            && node.after.as_ref() != [32]
        {
            node.after = Cow::Borrowed(&[32]);
            changed = true;
        }
        changed |= empty_fallbacks(&mut node.nodes);
    }
    changed
}

pub fn gradient_stops(nodes: &mut Vec<Node>) -> bool {
    let mut changed = false;
    let mut index = 0;
    while index < nodes.len() {
        let node = &mut nodes[index];
        if node.kind != Kind::Function {
            index += 1;
            continue;
        }
        let target = eq_ignore_case(&node.value, "var")
            && node
                .nodes
                .iter()
                .find(|node| node.kind != Kind::Space)
                .is_some_and(|node| {
                    node.kind == Kind::Word && eq(&node.value, "--tw-gradient-via-stops")
                });
        if !target {
            changed |= gradient_stops(&mut node.nodes);
            index += 1;
            continue;
        }
        let positions: Vec<_> = node
            .nodes
            .iter()
            .enumerate()
            .filter(|(_, node)| comma(node))
            .take(2)
            .map(|(index, _)| index)
            .collect();
        if positions.len() == 2 {
            let first = positions[0];
            let second = positions[1];
            let mut stop_nodes = node.nodes.split_off(second);
            let fallback = node.nodes.split_off(first + 1);
            let mut separator = Node::new(Kind::Div, &[44]);
            separator.after = Cow::Borrowed(&[32]);
            node.nodes = vec![
                Node::new(
                    Kind::Word,
                    &[
                        45, 45, 116, 119, 45, 103, 114, 97, 100, 105, 101, 110, 116, 45, 118, 105,
                        97, 45, 115, 116, 111, 112, 115,
                    ],
                ),
                separator,
            ];
            node.nodes.extend(fallback);
            let count = stop_nodes.len();
            nodes.splice(index + 1..index + 1, stop_nodes.drain(..));
            index += count;
            changed = true;
        }
        index += 1;
    }
    changed
}

pub fn gradient_positions(nodes: &mut [Node]) -> bool {
    let mut changed = false;
    for node in nodes {
        if node.kind != Kind::Function {
            continue;
        }
        let target = eq_ignore_case(&node.value, "var")
            && node
                .nodes
                .iter()
                .find(|node| node.kind != Kind::Space)
                .is_some_and(|node| {
                    node.kind == Kind::Word
                        && [
                            "--tw-gradient-from-position",
                            "--tw-gradient-via-position",
                            "--tw-gradient-to-position",
                        ]
                        .iter()
                        .any(|name| eq(&node.value, name))
                });
        if target {
            if let Some(index) = node.nodes.iter().position(comma) {
                if !node.nodes[index + 1..]
                    .iter()
                    .any(|node| node.kind != Kind::Space)
                    && node.after.as_ref() != [32]
                {
                    node.after = Cow::Borrowed(&[32]);
                    changed = true;
                }
            } else {
                node.nodes.push(Node::new(Kind::Div, &[44]));
                node.after = Cow::Borrowed(&[32]);
                changed = true;
            }
        }
        changed |= gradient_positions(&mut node.nodes);
    }
    changed
}

pub fn translate(nodes: &mut [Node]) -> bool {
    let mut changed = false;
    for node in nodes {
        if node.kind != Kind::Function {
            continue;
        }
        if eq_ignore_case(&node.value, "translate") {
            for child in &mut node.nodes {
                if comma(child) {
                    child.value = Cow::Borrowed(&[32]);
                    child.before = Cow::Borrowed(&[]);
                    child.after = Cow::Borrowed(&[]);
                    changed = true;
                }
            }
        }
        changed |= translate(&mut node.nodes);
    }
    changed
}
