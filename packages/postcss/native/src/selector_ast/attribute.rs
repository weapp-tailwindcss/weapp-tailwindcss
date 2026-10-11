use super::{
    arena::{Arena, Kind},
    parser::identifier,
};
use crate::selector::whitespace;

fn spaces(input: &[u16], index: &mut usize) {
    while input.get(*index).is_some_and(|unit| whitespace(*unit)) {
        *index += 1;
    }
}

pub fn parse(input: &[u16], index: &mut usize, ast: &mut Arena, parent: usize) -> Option<()> {
    *index += 1;
    spaces(input, index);
    let start = *index;
    let name = identifier(input, index)?;
    let mut output = vec![91];
    output.extend_from_slice(&input[start..*index]);
    spaces(input, index);
    if input.get(*index) != Some(&93) {
        if input
            .get(*index)
            .is_some_and(|unit| matches!(*unit, 126 | 124 | 94 | 36 | 42))
        {
            output.push(input[*index]);
            *index += 1;
        }
        if input.get(*index) != Some(&61) {
            return None;
        }
        output.push(61);
        *index += 1;
        spaces(input, index);
        let start = *index;
        let quoted = matches!(input.get(*index), Some(34 | 39));
        if quoted {
            let quote = input[*index];
            *index += 1;
            while *index < input.len() && input[*index] != quote {
                if input[*index] == 92 {
                    *index += 1;
                }
                *index += 1;
            }
            if *index >= input.len() {
                return None;
            }
            *index += 1;
        } else {
            identifier(input, index)?;
        }
        output.extend_from_slice(&input[start..*index]);
        spaces(input, index);
        if input
            .get(*index)
            .is_some_and(|unit| matches!(*unit, 73 | 83 | 105 | 115))
        {
            if !quoted {
                output.push(32);
            }
            output.push(input[*index]);
            *index += 1;
            spaces(input, index);
        }
    }
    if input.get(*index) != Some(&93) {
        return None;
    }
    output.push(93);
    *index += 1;
    let id = ast.add(Kind::Attribute, name, Some(parent));
    ast.nodes[id].raw = Some(output);
    Some(())
}
