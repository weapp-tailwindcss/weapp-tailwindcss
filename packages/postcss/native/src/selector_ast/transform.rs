use super::{
    arena::{Arena, Kind},
    eq, pseudos, text, Options,
};
use crate::{
    escape::{escape_class, EscapeMapping},
    selector::name,
};

pub struct Context<'a> {
    pub options: &'a Options,
    pub mapping: &'a EscapeMapping,
    pub spacing: bool,
}

pub fn walk(ast: &mut Arena, parent: usize, context: &mut Context) -> Option<()> {
    ast.nodes[parent].cursor = Some(0);
    while (ast.nodes[parent].cursor? as usize) < ast.nodes[parent].children.len() {
        let index = ast.nodes[parent].cursor? as usize;
        let child = ast.nodes[parent].children[index];
        visit(ast, child, index, context)?;
        if !ast.nodes[child].children.is_empty() {
            walk(ast, child, context)?;
        }
        *ast.nodes[parent].cursor.as_mut()? += 1;
        if ast.nodes.len() > 100_000 {
            return None;
        }
    }
    ast.nodes[parent].cursor = None;
    Some(())
}

fn visit(ast: &mut Arena, id: usize, index: usize, context: &mut Context) -> Option<()> {
    match ast.nodes[id].kind {
        Kind::Class => escape(ast, id, context.mapping)?,
        Kind::Universal => universal(ast, id, context),
        Kind::Selector => {
            let children = &ast.nodes[id].children;
            let unsupported_element = children.iter().any(|child| {
                let node = &ast.nodes[*child];
                node.kind == Kind::Pseudo
                    && ([
                        "::backdrop",
                        "::-ms-backdrop",
                        "::-webkit-backdrop",
                        "::file-selector-button",
                    ]
                    .iter()
                    .any(|value| eq(&node.value, value))
                        || (context.options.uni_app_x
                            && [":before", ":after", "::before", "::after"]
                                .iter()
                                .any(|value| eq(&node.value, value))))
            });
            if unsupported_element {
                ast.remove(id);
                return Some(());
            }
            if children
                .iter()
                .any(|child| unsupported(ast, *child, context))
            {
                if let Some(root_selector) = ast.top_selector(id) {
                    ast.remove(root_selector);
                }
                return Some(());
            }
            context.spacing |= spacing(ast, id, context.options);
        }
        Kind::Pseudo if !not_last_child(ast, id) => {
            pseudos::visit(ast, id, index, context)?;
        }
        Kind::Combinator => {
            if !eq(&ast.nodes[id].value, ">") {
                return Some(());
            }
            let Some(parent) = ast.nodes[id].parent else {
                return Some(());
            };
            let nodes = &ast.nodes[parent].children;
            if nodes.len() > index + 3
                && hidden_or_template(ast, nodes[index + 1])
                && ast.nodes[nodes[index + 2]].kind == Kind::Combinator
                && (eq(&ast.nodes[nodes[index + 2]].value, "~")
                    || eq(&ast.nodes[nodes[index + 2]].value, "+"))
                && hidden_or_template(ast, nodes[index + 3])
            {
                let replacements = combinator_nodes(ast, context.options);
                // 原实现直接 splice，替换节点保持原有的无 parent 状态。
                ast.nodes[parent]
                    .children
                    .splice(index + 1..index + 4, replacements);
            }
        }
        Kind::Attribute if context.options.uni_app_x => ast.remove(id),
        _ => {}
    }
    Some(())
}

pub fn unsupported(ast: &Arena, id: usize, context: &Context) -> bool {
    ast.nodes[id].kind == Kind::Pseudo && context.options.unsupported.contains(&ast.nodes[id].value)
}

pub fn escape(ast: &mut Arena, id: usize, mapping: &EscapeMapping) -> Option<()> {
    let replaced = escape_class(&ast.nodes[id].value, mapping);
    if replaced.iter().any(|unit| !name(*unit) || *unit >= 128) {
        return None;
    }
    let mut serialized = Vec::with_capacity(replaced.len() + 1);
    if replaced.starts_with(&[45, 45]) {
        serialized.push(92);
    }
    serialized.extend_from_slice(&replaced);
    ast.nodes[id].value = replaced;
    ast.nodes[id].raw = Some(serialized);
    Some(())
}

pub fn universal(ast: &mut Arena, id: usize, context: &Context) {
    if let Some(replacement) = context
        .options
        .universal
        .as_ref()
        .filter(|value| !value.is_empty())
    {
        ast.nodes[id].value = replacement.clone();
        ast.nodes[id].raw = None;
    }
}

pub fn not_last_child(ast: &Arena, id: usize) -> bool {
    let node = &ast.nodes[id];
    if node.kind != Kind::Pseudo || !eq(&node.value, ":not") || node.children.len() != 1 {
        return false;
    }
    let child = &ast.nodes[node.children[0]];
    child.kind == Kind::Selector
        && child.children.first().is_some_and(|id| {
            ast.nodes[*id].kind == Kind::Pseudo && eq(&ast.nodes[*id].value, ":last-child")
        })
}

fn hidden_or_template(ast: &Arena, id: usize) -> bool {
    let node = &ast.nodes[id];
    if node.kind != Kind::Pseudo || !eq(&node.value, ":not") {
        return false;
    }
    let Some(selector) = node.children.first() else {
        return false;
    };
    if ast.nodes[*selector].kind != Kind::Selector {
        return false;
    }
    ast.nodes[*selector].children.first().is_some_and(|id| {
        let node = &ast.nodes[*id];
        (node.kind == Kind::Attribute && eq(&node.value, "hidden"))
            || (node.kind == Kind::Tag && eq(&node.value, "template"))
    })
}

pub fn combinator_nodes(ast: &mut Arena, options: &Options) -> Vec<usize> {
    let base = if options.child.len() > 1 {
        let pseudo = ast.add(Kind::Pseudo, text(":is"), None);
        for value in &options.child {
            ast.add(Kind::Tag, value.clone(), Some(pseudo));
        }
        pseudo
    } else {
        ast.add(
            Kind::Tag,
            options
                .child
                .first()
                .cloned()
                .unwrap_or_else(|| text("view")),
            None,
        )
    };
    let combinator = ast.add(Kind::Combinator, vec![43], None);
    let cloned = ast.clone_tree(base, None);
    vec![base, combinator, cloned]
}

pub fn spacing(ast: &mut Arena, selector: usize, options: &Options) -> bool {
    let nodes = ast.nodes[selector].children.clone();
    for chunk in nodes.windows(3) {
        if matches!(ast.nodes[chunk[0]].kind, Kind::Class | Kind::Nesting)
            && ast.nodes[chunk[1]].kind == Kind::Combinator
            && eq(&ast.nodes[chunk[1]].value, ">")
            && not_last_child(ast, chunk[2])
        {
            let replacements = combinator_nodes(ast, options);
            ast.replace(chunk[2], &replacements);
            return true;
        }
    }
    false
}

pub fn expanded_nodes(
    ast: &mut Arena,
    parent: usize,
    context: &Context,
    classes: bool,
) -> Option<()> {
    for id in ast.nodes[parent].children.clone() {
        if classes && ast.nodes[id].kind == Kind::Class {
            escape(ast, id, context.mapping)?;
        }
        if ast.nodes[id].kind == Kind::Universal {
            universal(ast, id, context);
        }
        expanded_nodes(ast, id, context, classes)?;
    }
    Some(())
}

pub fn cleanup(ast: &mut Arena, parent: usize) {
    ast.nodes[parent].cursor = Some(0);
    while (ast.nodes[parent].cursor.unwrap() as usize) < ast.nodes[parent].children.len() {
        let index = ast.nodes[parent].cursor.unwrap() as usize;
        let id = ast.nodes[parent].children[index];
        let node = &ast.nodes[id];
        if node.children.is_empty()
            && (node.kind == Kind::Selector
                || (node.kind == Kind::Pseudo
                    && [
                        ":not",
                        ":is",
                        ":where",
                        ":has",
                        ":matches",
                        ":-webkit-any",
                        ":-moz-any",
                        ":lang",
                    ]
                    .iter()
                    .any(|value| eq(&node.value, value))))
        {
            ast.remove(id);
        }
        if !ast.nodes[id].children.is_empty() {
            cleanup(ast, id);
        }
        *ast.nodes[parent].cursor.as_mut().unwrap() += 1;
    }
    ast.nodes[parent].cursor = None;
}
