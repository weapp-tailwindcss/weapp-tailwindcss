use super::{
    arena::{Arena, Kind},
    attribute,
};
use crate::selector::{escaped, name, whitespace};

pub fn parse(input: &[u16]) -> Option<Arena> {
    let mut ast = Arena::new();
    ast.add(Kind::Root, Vec::new(), None);
    let mut index = 0;
    selectors(input, &mut index, &mut ast, 0, 0)?;
    Some(ast)
}

fn selectors(
    input: &[u16],
    index: &mut usize,
    ast: &mut Arena,
    container: usize,
    depth: usize,
) -> Option<()> {
    if depth >= 128 {
        return None;
    }
    let mut selector = ast.add(Kind::Selector, Vec::new(), Some(container));
    let mut pending_space = false;
    while *index < input.len() {
        let unit = input[*index];
        if whitespace(unit) {
            pending_space = !ast.nodes[selector].children.is_empty();
            *index += 1;
            continue;
        }
        if unit == 41 {
            if depth == 0 {
                return None;
            }
            *index += 1;
            return Some(());
        }
        if unit == 44 {
            if depth == 0 && *index + 1 == input.len() {
                ast.trailing_comma = true;
                *index += 1;
                break;
            }
            selector = ast.add(Kind::Selector, Vec::new(), Some(container));
            pending_space = false;
            *index += 1;
            continue;
        }
        if matches!(unit, 43 | 62 | 126) {
            ast.add(Kind::Combinator, vec![unit], Some(selector));
            pending_space = false;
            *index += 1;
            continue;
        }
        if pending_space
            && ast.nodes[selector]
                .children
                .last()
                .is_some_and(|id| ast.nodes[*id].kind != Kind::Combinator)
        {
            ast.add(Kind::Combinator, vec![32], Some(selector));
        }
        pending_space = false;
        match unit {
            46 | 35 => {
                *index += 1;
                let start = *index;
                let decoded = identifier(input, index)?;
                let kind = if unit == 46 { Kind::Class } else { Kind::Id };
                let id = ast.add(kind, decoded, Some(selector));
                ast.nodes[id].raw = Some(input[start..*index].to_vec());
            }
            58 => {
                let start = *index;
                while input.get(*index) == Some(&58) {
                    *index += 1;
                }
                // selector-parser 保留 pseudo 名称的 raw escape，不按解码后名称匹配策略。
                identifier(input, index)?;
                let id = ast.add(Kind::Pseudo, input[start..*index].to_vec(), Some(selector));
                if input.get(*index) == Some(&40) {
                    *index += 1;
                    selectors(input, index, ast, id, depth + 1)?;
                }
            }
            91 => {
                attribute::parse(input, index, ast, selector)?;
            }
            42 | 38 => {
                ast.add(
                    if unit == 42 {
                        Kind::Universal
                    } else {
                        Kind::Nesting
                    },
                    vec![unit],
                    Some(selector),
                );
                *index += 1;
            }
            34 | 39 => {
                let start = *index;
                *index += 1;
                while *index < input.len() && input[*index] != unit {
                    if input[*index] == 92 {
                        *index += 1;
                    }
                    *index += 1;
                }
                if *index >= input.len() {
                    return None;
                }
                *index += 1;
                ast.add(Kind::String, input[start..*index].to_vec(), Some(selector));
            }
            _ => {
                if !name(unit) && unit != 92 {
                    return None;
                }
                let start = *index;
                let mut decoded = identifier(input, index)?;
                if input.get(*index) == Some(&37) {
                    decoded.push(37);
                    *index += 1;
                }
                let id = ast.add(Kind::Tag, decoded, Some(selector));
                ast.nodes[id].raw = Some(input[start..*index].to_vec());
            }
        }
    }
    (depth == 0).then_some(())
}

pub(super) fn identifier(input: &[u16], index: &mut usize) -> Option<Vec<u16>> {
    let start = *index;
    let mut decoded = Vec::new();
    while let Some(&unit) = input.get(*index) {
        if unit == 92 {
            escaped(input, index, &mut decoded)?;
        } else if name(unit) {
            decoded.push(unit);
            *index += 1;
        } else {
            break;
        }
    }
    (*index > start).then_some(decoded)
}
