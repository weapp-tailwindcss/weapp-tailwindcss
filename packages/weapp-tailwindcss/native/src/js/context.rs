use oxc_ast::{
    AstKind,
    ast::{Expression, JSXAttributeName, PropertyKey, PropertyKind},
};
use oxc_span::{GetSpan, Span};

fn normalized(value: &str) -> String {
    value
        .chars()
        .filter(|character| !matches!(character, '-' | '_' | ':'))
        .flat_map(char::to_lowercase)
        .collect()
}

fn class_keyword(value: &str) -> bool {
    matches!(
        normalized(value).as_str(),
        "class" | "classname" | "hoverclass" | "virtualhostclass" | "rootclass"
    )
}

fn helper_name<'a>(expression: &'a Expression<'a>) -> Option<&'a str> {
    match expression {
        Expression::Identifier(node) => Some(&node.name),
        Expression::StaticMemberExpression(node) if !node.optional => Some(&node.property.name),
        Expression::ComputedMemberExpression(node) if !node.optional => match &node.expression {
            Expression::Identifier(node) => Some(&node.name),
            Expression::StringLiteral(node) => node.value.as_str(),
            _ => None,
        },
        _ => None,
    }
}

pub(super) fn is_class_context(ancestors: &[AstKind<'_>], mut span: Span) -> bool {
    for parent in ancestors.iter().rev() {
        match parent {
            AstKind::ObjectProperty(node)
                if !node.method && node.kind == PropertyKind::Init && node.value.span() == span =>
            {
                // Babel 也将 computed Identifier 的名字作为关键词读取。
                let name = match &node.key {
                    PropertyKey::Identifier(node) => Some(node.name.into()),
                    _ => node.key.static_name(),
                };
                if name
                    .as_ref()
                    .and_then(|name| name.as_str())
                    .is_some_and(class_keyword)
                {
                    return true;
                }
            }
            AstKind::JSXAttribute(node) => {
                if let JSXAttributeName::Identifier(name) = &node.name
                    && class_keyword(&name.name)
                {
                    return true;
                }
            }
            AstKind::CallExpression(node)
                if !node.optional
                    && helper_name(&node.callee).is_some_and(|name| {
                        matches!(
                            normalized(name).as_str(),
                            "cn" | "clsx" | "classnames" | "twmerge" | "cva" | "tv" | "cx" | "r"
                        )
                    })
                    && node
                        .arguments
                        .iter()
                        .any(|argument| argument.span() == span) =>
            {
                return true;
            }
            _ => {}
        }
        span = parent.span();
    }
    false
}
