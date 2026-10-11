use oxc_ast::ast::{ModuleExportName, Program, Statement};
use oxc_semantic::SemanticBuilder;

/// Oxc 的 parser 不检查作用域 early error；完整转译需要同步 Babel 的拒绝边界。
pub(super) fn is_valid(program: &Program<'_>) -> bool {
    let result = SemanticBuilder::new_compiler().build(program);
    if !result.diagnostics.is_empty() {
        return false;
    }
    // Oxc 默认跳过 TS 的未定义导出，但 Babel 仍拒绝；复用已构建的根作用域确认绑定。
    if program.source_type.is_typescript() {
        let scoping = result.semantic.scoping();
        for statement in &program.body {
            if let Statement::ExportNamedDeclaration(declaration) = statement {
                for specifier in &declaration.specifiers {
                    if let ModuleExportName::IdentifierReference(identifier) = &specifier.local
                        && scoping
                            .get_binding(scoping.root_scope_id(), identifier.name)
                            .is_none()
                    {
                        return false;
                    }
                }
            }
        }
    }
    true
}
