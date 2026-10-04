use super::{eq, Kind, Node};
use std::borrow::Cow;

// token 与空白归属兼容 postcss-value-parser；第三方许可见 native/THIRD_PARTY_LICENSES.txt。

pub fn parse(input: &[u16]) -> Option<Vec<Node<'_>>> {
    let mut index = 0;
    nodes(input, &mut index, None, 0).map(|(nodes, _)| nodes)
}

fn escaped(input: &[u16], index: usize) -> bool {
    let mut previous = index;
    while previous > 0 && input[previous - 1] == 92 {
        previous -= 1;
    }
    (index - previous) % 2 == 1
}

fn function<'a>(
    input: &'a [u16],
    index: &mut usize,
    name: &'a [u16],
    depth: usize,
) -> Option<Node<'a>> {
    if depth >= 256 {
        return None;
    }
    *index += 1;
    let start = *index;
    while input.get(*index).is_some_and(|unit| *unit <= 32) {
        *index += 1;
    }
    let mut node = Node::new(Kind::Function, name);
    node.before = Cow::Borrowed(&input[start..*index]);
    if eq(name, "url") && !matches!(input.get(*index), Some(34 | 39)) {
        let start = *index;
        while *index < input.len() && (input[*index] != 41 || escaped(input, *index)) {
            *index += 1;
        }
        if *index == input.len() {
            return None;
        }
        let mut end = *index;
        while end > start && input[end - 1] <= 32 {
            end -= 1;
        }
        if end > start {
            node.nodes.push(Node::new(Kind::Word, &input[start..end]));
        }
        node.after = Cow::Borrowed(&input[end..*index]);
        *index += 1;
    } else {
        (node.nodes, node.after) = nodes(input, index, Some(name), depth + 1)?;
    }
    Some(node)
}

/// 保留 value-parser 的节点和空白归属；不解码字符串或 CSS escape。
fn nodes<'a>(
    input: &'a [u16],
    index: &mut usize,
    parent: Option<&'a [u16]>,
    depth: usize,
) -> Option<(Vec<Node<'a>>, Cow<'a, [u16]>)> {
    let mut result: Vec<Node> = Vec::new();
    let mut before = Cow::Borrowed(&[][..]);
    let mut after = Cow::Borrowed(&[][..]);
    let calc = parent.is_some_and(|name| eq(name, "calc"));
    while *index < input.len() {
        let unit = input[*index];
        if unit <= 32 {
            let start = *index;
            while input.get(*index).is_some_and(|unit| *unit <= 32) {
                *index += 1;
            }
            let space = &input[start..*index];
            let next = input.get(*index).copied();
            if next == Some(41) && parent.is_some() {
                after = Cow::Borrowed(space);
            } else if result.last().is_some_and(|node| node.kind == Kind::Div) {
                result.last_mut()?.after = Cow::Borrowed(space);
            } else if matches!(next, Some(44 | 58))
                || (next == Some(47) && input.get(*index + 1) != Some(&42) && !calc)
            {
                before = Cow::Borrowed(space);
            } else {
                result.push(Node::new(Kind::Space, space));
            }
        } else if matches!(unit, 34 | 39) {
            *index += 1;
            let start = *index;
            while *index < input.len() && (input[*index] != unit || escaped(input, *index)) {
                *index += 1;
            }
            if *index == input.len() {
                return None;
            }
            let mut node = Node::new(Kind::String, &input[start..*index]);
            node.quote = unit;
            result.push(node);
            *index += 1;
        } else if unit == 47 && input.get(*index + 1) == Some(&42) {
            *index += 2;
            let start = *index;
            while *index + 1 < input.len() && input[*index..*index + 2] != [42, 47] {
                *index += 1;
            }
            if *index + 1 >= input.len() {
                return None;
            }
            result.push(Node::new(Kind::Comment, &input[start..*index]));
            *index += 2;
        } else if calc && matches!(unit, 47 | 42) {
            result.push(Node::new(Kind::Word, &input[*index..*index + 1]));
            *index += 1;
        } else if matches!(unit, 47 | 44 | 58) {
            let mut node = Node::new(Kind::Div, &input[*index..*index + 1]);
            node.before = std::mem::take(&mut before);
            result.push(node);
            *index += 1;
        } else if unit == 40 {
            result.push(function(input, index, &[], depth)?);
        } else if unit == 41 && parent.is_some() {
            *index += 1;
            return Some((result, after));
        } else {
            let start = *index;
            loop {
                if input[*index] == 92 {
                    *index += 1;
                }
                *index = (*index + 1).min(input.len());
                let Some(&next) = input.get(*index) else {
                    break;
                };
                if next <= 32
                    || matches!(next, 34 | 39 | 44 | 58 | 47 | 40)
                    || (next == 42 && calc)
                    || (next == 41 && parent.is_some())
                {
                    break;
                }
            }
            let value = &input[start..*index];
            if input.get(*index) == Some(&40) {
                result.push(function(input, index, value, depth)?);
            } else {
                result.push(Node::new(Kind::Word, value));
            }
        }
    }
    parent.is_none().then_some((result, after))
}
