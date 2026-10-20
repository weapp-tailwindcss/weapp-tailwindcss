import type { LynxCssDiagnostic } from '../diagnostics'

/** 只说明可观察的删除证据；替代建议不承诺未经目标端验证的等价性。 */
export function diagnosticGuidance(diagnostic: LynxCssDiagnostic) {
  if (diagnostic.status === 'unknown') {
    return {
      reason: diagnostic.reason ?? '编码证据不足，无法确认该输入声明的最终效果。',
      suggestion: '先补齐唯一来源、实际 bundle 和目标端证据；当前没有已验证的等价替代建议。',
    }
  }
  if (diagnostic.status === 'bundled') {
    return { reason: '该输入规则仍存在于本轮实际 bundle；warning 不能证明删除。', suggestion: '保留声明，继续验证目标宿主实际效果。' }
  }
  let suggestion = '缩小为单条业务样式，在目标宿主确认可用实现；当前没有已验证的等价替代建议。'
  if (diagnostic.property === 'padding-inline' || diagnostic.property === 'margin-inline') {
    const prefix = diagnostic.property.startsWith('padding') ? 'padding' : 'margin'
    suggestion = `可按业务方向选择 ${prefix}-left / ${prefix}-right；这不是完整逻辑属性等价替换，RTL 与动态方向须分别验证。`
  }
  return { reason: '唯一输入与本轮实际 bundle 比较确认该规则或声明缺失；这不推断 encoder 内部拒绝根因。', suggestion }
}
