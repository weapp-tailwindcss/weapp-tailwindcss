import type { NativeVariableDefinition } from './compat/native/types'
import { resolveNativeContextValue } from './compat/native/context'
import { parseNativeBoxShadow } from './compat/native/shadow'

/** 纯 JS 原生值解释入口，不加载 PostCSS root、Node API 或 Tailwind 生成器。 */
export function resolveNativeBoxShadow(expression: NativeVariableDefinition, bindings: Record<string, NativeVariableDefinition>, currentColor?: string) {
  const resolved = resolveNativeContextValue(expression.value, expression.defaults, bindings)
  return resolved === undefined ? undefined : parseNativeBoxShadow(resolved, currentColor)
}

export type { NativeVariableDefinition } from './compat/native/types'
