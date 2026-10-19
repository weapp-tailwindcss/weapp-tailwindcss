/* eslint-disable style/max-statements-per-line */

import type { NativeVariableDefinition } from './types'
import valueParser from 'postcss-value-parser'

function dependencies(value: string) {
  const names = new Set<string>()
  valueParser(value).walk((node) => {
    if (node.type === 'function' && node.value === 'var') {
      const comma = node.nodes.findIndex(item => item.type === 'div' && item.value === ',')
      names.add(valueParser.stringify(comma < 0 ? node.nodes : node.nodes.slice(0, comma)).trim())
    }
  })
  return names
}

/** 按表达式依赖裁剪默认变量，防止每条规则重复保存整份 Tailwind theme。 */
export function nativeVariableDefinition(value: string, inherited: Record<string, string>): NativeVariableDefinition {
  const defaults: Record<string, string> = {}
  const pending = [...dependencies(value)]
  for (let index = 0; index < pending.length; index++) {
    const name = pending[index]!
    const binding = inherited[name]
    if (binding === undefined || name in defaults) { continue }
    defaults[name] = binding
    pending.push(...dependencies(binding))
  }
  return { value, defaults }
}

/** 每个变量引用保留所属入口的默认值，同时允许选中的 class 覆盖该变量。 */
export function resolveNativeContextValue(value: string, defaults: Record<string, string>, bindings: Record<string, NativeVariableDefinition>, seen = new Set<string>()): string | undefined {
  if (seen.size > 64) { return undefined }
  const output: string[] = []
  for (const node of valueParser(value).nodes) {
    if (node.type !== 'function') {
      output.push(valueParser.stringify(node))
      continue
    }
    if (node.unclosed) { return undefined }
    if (node.value !== 'var') {
      const nested = resolveNativeContextValue(valueParser.stringify(node.nodes), defaults, bindings, seen)
      if (nested === undefined) { return undefined }
      output.push(valueParser.stringify({ ...node, nodes: valueParser(nested).nodes }))
      continue
    }
    const comma = node.nodes.findIndex(item => item.type === 'div' && item.value === ',')
    const name = valueParser.stringify(comma < 0 ? node.nodes : node.nodes.slice(0, comma)).trim()
    const definition = bindings[name] ?? { value: defaults[name], defaults }
    let resolved: string | undefined
    if (!seen.has(name) && definition.value !== undefined && !/^(?:initial|unset|revert(?:-layer)?)$/.test(definition.value.trim())) {
      resolved = resolveNativeContextValue(definition.value, definition.defaults, bindings, new Set([...seen, name]))
    }
    if (resolved === undefined && comma >= 0) {
      resolved = resolveNativeContextValue(valueParser.stringify(node.nodes.slice(comma + 1)), defaults, bindings, seen)
    }
    if (resolved === undefined) { return undefined }
    output.push(resolved)
  }
  return output.join('')
}
