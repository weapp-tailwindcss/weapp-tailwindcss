use napi::bindgen_prelude::Utf16String;
use napi_derive::napi;
use oxc_allocator::Allocator;
use oxc_ast::AstKind;
use oxc_ast_visit::Visit;
use oxc_parser::{ParseOptions, Parser};
use oxc_span::{GetSpan, SourceType, Span};

mod offsets;
#[cfg(test)]
mod tests;

use offsets::Utf16Offsets;

#[napi(object)]
pub struct JsLiteralSpan {
    pub kind: String,
    pub start: u32,
    pub end: u32,
    pub value: String,
    pub is_condition_test: bool,
}

#[napi(object)]
pub struct JsSourceAnalysis {
    pub literals: Vec<JsLiteralSpan>,
    pub has_module_declarations: bool,
    pub has_tagged_template: bool,
}

struct AnalysisVisitor<'a, 's> {
    ancestors: Vec<AstKind<'a>>,
    analysis: JsSourceAnalysis,
    offsets: Utf16Offsets,
    source: &'s str,
    typescript: bool,
    script: bool,
    unsupported: bool,
    signature: Option<Vec<String>>,
}

impl AnalysisVisitor<'_, '_> {
    fn is_condition_test(&self, mut span: Span) -> bool {
        for parent in self.ancestors.iter().rev() {
            match parent {
                AstKind::ConditionalExpression(node) => return node.test.span() == span,
                AstKind::BinaryExpression(_)
                | AstKind::CallExpression(_)
                | AstKind::LogicalExpression(_)
                | AstKind::ComputedMemberExpression(_)
                | AstKind::StaticMemberExpression(_)
                | AstKind::PrivateFieldExpression(_)
                | AstKind::UnaryExpression(_) => span = parent.span(),
                _ => return false,
            }
        }
        false
    }

    fn literal(&mut self, kind: &str, span: Span, value: &str) {
        if let Some(parts) = &mut self.signature {
            parts.push(format!(
                "{}:{value}",
                if kind == "string" { "s" } else { "t" }
            ));
        }
        // 指令仍参与候选签名，但不能作为 Babel StringLiteral 转译。
        let directive = matches!(self.ancestors.last(), Some(AstKind::Directive(_)));
        if !directive && span.start < span.end {
            self.analysis.literals.push(JsLiteralSpan {
                kind: kind.to_owned(),
                start: self.offsets.convert(span.start),
                end: self.offsets.convert(span.end),
                value: value.to_owned(),
                is_condition_test: self.is_condition_test(span),
            });
        }
    }
}

impl<'a> Visit<'a> for AnalysisVisitor<'a, '_> {
    fn enter_node(&mut self, kind: AstKind<'a>) {
        // Oxc 容忍 script 中的 ESM 声明；Babel 会拒绝，必须交还原有错误处理。
        if self.script
            && matches!(
                kind,
                AstKind::ImportDeclaration(_)
                    | AstKind::ExportDeclaration(_)
                    | AstKind::ExportNamedDeclaration(_)
                    | AstKind::ExportFromDeclaration(_)
                    | AstKind::ExportDefaultDeclaration(_)
                    | AstKind::ExportAllDeclaration(_)
            )
        {
            self.unsupported = true;
        }
        match kind {
            AstKind::ImportDeclaration(_)
            | AstKind::ExportAllDeclaration(_)
            | AstKind::ExportFromDeclaration(_) => self.analysis.has_module_declarations = true,
            AstKind::TaggedTemplateExpression(_) => self.analysis.has_tagged_template = true,
            AstKind::StringLiteral(node) => {
                // Oxc 对孤立代理的内部编码不能作为普通 UTF-8 字符串返回。
                if node.lone_surrogates {
                    self.unsupported = true;
                } else if self.signature.is_none()
                    && matches!(self.ancestors.last(), Some(AstKind::JSXAttribute(_)))
                    && node.value.contains('&')
                {
                    // JSX 实体交还 Babel，避免维护第二套实体解码规则。
                    self.unsupported = true;
                } else {
                    self.literal("string", node.span, &node.value);
                }
            }
            AstKind::TemplateElement(node) => {
                let mut span = node.span;
                // 与 Oxc 的 TS-ESTree span 契约一致，JS span 则仅包含正文。
                if self.typescript {
                    span.start -= 1;
                    span.end += if node.tail { 1 } else { 2 };
                }
                self.literal("template", span, &node.value.raw);
            }
            AstKind::JSXText(node) => {
                if let Some(parts) = &mut self.signature {
                    let text = node
                        .span
                        .source_text(self.source)
                        .trim_matches(is_js_whitespace);
                    if !text.is_empty() {
                        parts.push(format!("x:{text}"));
                    }
                }
            }
            _ => {}
        }
        self.ancestors.push(kind);
    }

    fn leave_node(&mut self, _kind: AstKind<'a>) {
        self.ancestors.pop();
    }
}

// 与 ECMAScript trim 一致；Rust is_whitespace 还包含 JS 不认可的 U+0085。
fn is_js_whitespace(character: char) -> bool {
    matches!(character, '\t'..='\r' | ' ' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}'
        | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

fn analyze(
    source: &str,
    lang: &str,
    source_type: &str,
    preserve_parens: bool,
    signature: bool,
) -> Option<(JsSourceAnalysis, Option<String>)> {
    let source_kind = match lang {
        "js" => SourceType::mjs(),
        "jsx" => SourceType::jsx(),
        "ts" => SourceType::ts(),
        "tsx" => SourceType::tsx(),
        _ => return None,
    };
    let source_kind = match source_type {
        "module" => source_kind.with_module(true),
        "script" => source_kind.with_script(true),
        "unambiguous" => source_kind.with_unambiguous(true),
        _ => return None,
    };
    let allocator = Allocator::default();
    let result = Parser::new(&allocator, source, source_kind)
        .with_options(ParseOptions {
            preserve_parens,
            ..ParseOptions::default()
        })
        .parse();
    if result.fatal_error || !result.diagnostics.is_empty() {
        return None;
    }
    let mut visitor = AnalysisVisitor {
        ancestors: Vec::new(),
        analysis: JsSourceAnalysis {
            literals: Vec::new(),
            has_module_declarations: false,
            has_tagged_template: false,
        },
        offsets: Utf16Offsets::new(source),
        source,
        typescript: matches!(lang, "ts" | "tsx"),
        script: source_type == "script",
        unsupported: false,
        signature: signature.then(Vec::new),
    };
    visitor.visit_program(&result.program);
    if visitor.unsupported {
        return None;
    }
    if let Some(parts) = &mut visitor.signature {
        for comment in &result.program.comments {
            let value = comment.content_span().source_text(source);
            if !value.is_empty() {
                parts.push(format!("c:{value}"));
            }
        }
    }
    Some((
        visitor.analysis,
        visitor.signature.map(|parts| parts.join("\n")),
    ))
}

/// 在 Rust 内完成解析和遍历，只向 JS 传递字面量事实；无法无损处理时交还兼容路径。
#[napi]
pub fn analyze_js(
    input: Utf16String,
    lang: String,
    source_type: String,
    preserve_parens: bool,
) -> Option<JsSourceAnalysis> {
    let source = String::from_utf16(&input).ok()?;
    analyze(&source, &lang, &source_type, preserve_parens, false).map(|(analysis, _)| analysis)
}

/// 候选签名在 Rust 内拼接，避免为仅需签名的调用分配 JS AST。
#[napi]
pub fn js_runtime_signature(input: Utf16String) -> Option<String> {
    let source = String::from_utf16(&input).ok()?;
    analyze(&source, "tsx", "unambiguous", true, true)?.1
}
