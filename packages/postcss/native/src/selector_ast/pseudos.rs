use super::{
    arena::{Arena, Kind},
    eq, text,
    transform::{self, Context},
};
use std::collections::VecDeque;

pub fn visit(ast: &mut Arena, id: usize, index: usize, context: &mut Context) -> Option<()> {
    if transform::unsupported(ast, id, context) {
        if let Some(selector) = ast.top_selector(id) {
            ast.remove(selector);
        }
        return Some(());
    }
    let value = &ast.nodes[id].value;
    if [":-moz-any", ":-webkit-any", ":lang"]
        .iter()
        .any(|item| eq(value, item))
    {
        if let Some(parent) = ast.nodes[id]
            .parent
            .filter(|parent| ast.nodes[*parent].kind == Kind::Selector)
        {
            let not = ast.nodes[parent].parent.filter(|not| {
                ast.nodes[*not].kind == Kind::Pseudo && eq(&ast.nodes[*not].value, ":not")
            });
            if let Some(not) = not {
                ast.remove(not);
            } else if let Some(selector) = ast.top_selector(parent) {
                ast.remove(selector);
            }
        }
        return Some(());
    }
    if eq(value, ":root") {
        if let Some(root) = context
            .options
            .root
            .as_ref()
            .filter(|root| !root.is_empty())
        {
            ast.nodes[id].value = root.clone();
            return Some(());
        }
    }
    if eq(&ast.nodes[id].value, ":before") {
        ast.nodes[id].value = text("::before");
        return Some(());
    }
    if eq(&ast.nodes[id].value, ":after") {
        ast.nodes[id].value = text("::after");
        return Some(());
    }
    if eq(&ast.nodes[id].value, ":where") {
        flatten(ast, id, index, context)?;
    }
    Some(())
}

fn flatten(ast: &mut Arena, id: usize, index: usize, context: &mut Context) -> Option<()> {
    if context.options.uni_app_x {
        ast.nodes[id].value = text(":is");
    }
    let Some(parent) = ast.nodes[id]
        .parent
        .filter(|parent| ast.nodes[*parent].kind == Kind::Selector)
    else {
        return Some(());
    };
    if ast.nodes[id].children.is_empty() {
        return Some(());
    }
    let mut branches = Vec::new();
    for branch in ast.nodes[id].children.clone() {
        if ast.nodes[branch].kind == Kind::Selector {
            branches.extend(expand(ast, branch)?);
        }
    }
    for branch in &branches {
        context.spacing |= transform::spacing(ast, *branch, context.options);
    }
    if branches.len() > 1 && ast.nodes[parent].parent.is_some() {
        for branch in branches {
            let cloned = ast.clone_tree(parent, None);
            if let Some(target) = ast.nodes[cloned].children.get(index).copied() {
                if ast.nodes[target].kind == Kind::Pseudo && eq(&ast.nodes[target].value, ":where")
                {
                    let replacements = ast.clone_children(branch);
                    ast.replace(target, &replacements);
                    transform::expanded_nodes(ast, cloned, context, true)?;
                    ast.insert_before(parent, cloned);
                }
            }
        }
        ast.remove(parent);
        return Some(());
    }
    if let Some(branch) = branches.first() {
        transform::expanded_nodes(ast, *branch, context, false)?;
        let replacements = ast.clone_children(*branch);
        ast.replace(id, &replacements);
    }
    if ast.nodes[parent].children.is_empty() {
        ast.remove(parent);
    }
    Some(())
}

fn find(ast: &Arena, parent: usize) -> Option<usize> {
    for id in &ast.nodes[parent].children {
        let node = &ast.nodes[*id];
        if node.kind == Kind::Pseudo
            && (eq(&node.value, ":where") || eq(&node.value, ":is"))
            && node
                .children
                .iter()
                .any(|child| ast.nodes[*child].kind == Kind::Selector)
        {
            return Some(*id);
        }
        if let Some(found) = find(ast, *id) {
            return Some(found);
        }
    }
    None
}

fn path(ast: &Arena, root: usize, target: usize) -> Option<Vec<usize>> {
    let mut path = Vec::new();
    let mut current = target;
    while current != root {
        let parent = ast.nodes[current].parent?;
        path.push(
            ast.nodes[parent]
                .children
                .iter()
                .position(|child| *child == current)?,
        );
        current = parent;
    }
    path.reverse();
    Some(path)
}

fn expand(ast: &mut Arena, branch: usize) -> Option<Vec<usize>> {
    let mut pending = VecDeque::from([ast.clone_tree(branch, None)]);
    let mut expanded = Vec::new();
    while let Some(current) = pending.pop_front() {
        if ast.nodes.len() > 100_000 {
            return None;
        }
        let Some(target) = find(ast, current) else {
            expanded.push(current);
            continue;
        };
        let path = path(ast, current, target)?;
        for branch in ast.nodes[target].children.clone() {
            if ast.nodes[branch].kind != Kind::Selector {
                continue;
            }
            let next = ast.clone_tree(current, None);
            let mut next_target = next;
            for index in &path {
                next_target = *ast.nodes[next_target].children.get(*index)?;
            }
            let replacements = ast.clone_children(branch);
            ast.replace(next_target, &replacements);
            pending.push_back(next);
        }
    }
    Some(expanded)
}
