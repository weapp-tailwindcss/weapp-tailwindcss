import type { NativeVariableDefinition } from '@weapp-tailwindcss/postcss/native-runtime'
import { resolveNativeBoxShadow } from '@weapp-tailwindcss/postcss/native-runtime'
import { flattenInlineStyle } from './line-height'

export interface DeferredBoxShadow {
  expression: NativeVariableDefinition
  bindings: Record<string, NativeVariableDefinition>
  important: boolean
  color?: string | undefined
  importantColor?: string | undefined
}

/** 阴影颜色依赖最终文字颜色；继承上下文未知时保留元数据，不猜测黑色。 */
export function deferredBoxShadowStyle(context: DeferredBoxShadow, inline?: unknown) {
  const style = flattenInlineStyle(inline)
  if (!context.important && 'boxShadow' in style) {
    return undefined
  }
  const color = context.importantColor ?? (typeof style.color === 'string' ? style.color : context.color)
  const computed = resolveNativeBoxShadow(context.expression, context.bindings, color)
  if (computed) {
    return { boxShadow: computed }
  }
  if (!color && resolveNativeBoxShadow(context.expression, context.bindings, '#000000')) {
    return undefined
  }
  throw new Error(`无法将当前 class 组合的 box-shadow 编译为原生阴影：${context.expression.value}`)
}

export function inlineBoxShadowStyle(context: DeferredBoxShadow | undefined, inline: unknown) {
  if (!context || typeof flattenInlineStyle(inline).color !== 'string') {
    return undefined
  }
  return deferredBoxShadowStyle(context, inline)
}
