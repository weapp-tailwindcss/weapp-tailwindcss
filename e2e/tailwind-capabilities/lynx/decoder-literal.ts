import type { LynxEncoderDiagnostic, SerializedLynxRule } from '../../lynx/encoding-types'
import type { ConversionObservation, ConversionStatement } from '../conversion-audit'
import { cssDeclarations } from '../css'
import { lynxRejectedDisplayValues } from './display-contract'

interface DisplayNode { header: string, body?: string }
export const literalClassName = /^[-_a-z][-\w]*$/i

/** 只拆分 decoder 展示块，不把私有变量文本改写成标准 CSS。 */
function displayNodes(text: string): DisplayNode[] | undefined {
  const nodes: DisplayNode[] = []
  let start = 0
  let depth = 0
  let bodyStart = -1
  let quote = ''
  let comment = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!
    if (comment) {
      if (char === '*' && text[index + 1] === '/') {
        comment = false
        index++
      }
      continue
    }
    if (quote) {
      if (char === '\\') {
        index++
      }
      else if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '/' && text[index + 1] === '*') {
      comment = true
      index++
    }
    else if (char === '"' || char === '\'') {
      quote = char
    }
    else if (char === '{') {
      if (depth++ === 0) {
        bodyStart = index + 1
      }
    }
    else if (char === '}') {
      if (--depth < 0) {
        return undefined
      }
      if (depth === 0) {
        const header = text.slice(start, bodyStart - 1).trim()
        if (!header) {
          return undefined
        }
        nodes.push({ header, body: text.slice(bodyStart, index) })
        start = index + 1
      }
    }
    else if (char === ';' && depth === 0) {
      nodes.push({ header: text.slice(start, index).trim() })
      start = index + 1
    }
  }
  return depth || quote || comment || text.slice(start).trim() ? undefined : nodes
}

function literalDeclarations(body: string, candidate: string): ConversionStatement[] | undefined {
  const statements: ConversionStatement[] = []
  for (const declaration of body.split(';')) {
    if (!declaration.trim()) {
      continue
    }
    const colon = declaration.indexOf(':')
    const property = declaration.slice(0, colon).trim()
    if (colon < 0 || !/^[a-z][a-z0-9-]*$/i.test(property)) {
      return undefined
    }
    const rawValue = declaration.slice(colon + 1).trim()
    const important = rawValue.endsWith('!important')
    const value = (important ? rawValue.slice(0, -'!important'.length) : rawValue).trim()
    // 函数、模板、字符串和私有数组值均没有完整的展示语义合同。
    if (!/^(?:-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%|vw|vh|s|ms)?|#[\da-f]{3,8}|[a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*)*)$/i.test(value)) {
      return undefined
    }
    statements.push({ selector: `.${candidate}`, conditions: [], property, value, important })
  }
  return statements
}

function diagnosticText(diagnostic: LynxEncoderDiagnostic): string {
  return `${diagnostic.type}:${diagnostic.name}`
}

/** 输入位置信息只用于诊断归属，绝不提供输出声明和值。 */
function candidateDiagnostics(candidate: string, diagnostics: readonly LynxEncoderDiagnostic[], rules: readonly SerializedLynxRule[]): string[] | undefined {
  const selected: string[] = []
  for (const diagnostic of diagnostics) {
    if (!Number.isInteger(diagnostic.line) || !Number.isInteger(diagnostic.column)) {
      return undefined
    }
    const owners = rules.filter((rule) => {
      const locations = [rule.selectorText?.loc, ...rule.style?.flatMap(style => [style.keyLoc, style.valLoc]) ?? []]
      return locations.some(location => location?.line === diagnostic.line && location?.column === diagnostic.column)
    })
    if (owners.length !== 1 || !owners[0]!.selectorText?.value) {
      return undefined
    }
    const selector = owners[0]!.selectorText!.value
    if (selector === `.${candidate}`) {
      selected.push(diagnosticText(diagnostic))
    }
    else {
      try {
        // 输入 selector 仍是标准 CSS，可精确区分其他转义类名与本候选；这里只定位诊断。
        if (cssDeclarations(`${selector}{--diagnostic-owner:1}`).contextsByClass.has(candidate)) {
          return undefined
        }
      }
      catch {
        return undefined
      }
    }
  }
  return selected
}

/** 仅从实际 decoder 文本读取无条件、无依赖、无转义歧义的字面子集。 */
export function lynxLiteralObservation(candidate: string, output: { css: string, diagnostics: readonly LynxEncoderDiagnostic[], rules: readonly SerializedLynxRule[], sourceCss?: string, encodedByteLength?: number }): ConversionObservation {
  const unreadable = (reason: string): ConversionObservation => ({ execution: 'completed', outputFormat: 'lynx-decoder-template', reason: `Lynx 编码已完成；${reason}，保留原始输出与诊断，语义验收为 not-run。` })
  if (!literalClassName.test(candidate)) {
    return unreadable('候选不属于无歧义单类字面子集')
  }
  const diagnostics = candidateDiagnostics(candidate, output.diagnostics, output.rules)
  if (!diagnostics) {
    return unreadable('批次诊断缺少唯一候选位置归属')
  }
  const statements: ConversionStatement[] = []
  const related = new RegExp(`\\.${candidate}(?![-\\w])`)
  const visit = (text: string, conditional: boolean): boolean => {
    const nodes = displayNodes(text)
    if (!nodes) {
      return false
    }
    for (const node of nodes) {
      if (node.header.includes('\\') || node.header.includes('/*')) {
        return false
      }
      if (node.header.startsWith('@') && node.body !== undefined) {
        if (related.test(node.header)) {
          return false
        }
        if (!visit(node.body, true)) {
          return false
        }
      }
      else if (related.test(node.header)) {
        if (conditional || node.header !== `.${candidate}` || node.body === undefined) {
          return false
        }
        const declarations = literalDeclarations(node.body, candidate)
        if (!declarations) {
          return false
        }
        // 不去重、不合并；重复规则和后续覆盖必须参与完整 oracle 比较。
        statements.push(...declarations)
      }
      else if (node.body === undefined && !conditional && !node.header.startsWith('@')) {
        return false
      }
    }
    return true
  }
  if (!visit(output.css, false)) {
    return unreadable('展示格式、关联条件或选择器存在歧义')
  }
  const observation: ConversionObservation = { execution: 'completed', snapshot: { statements, diagnostics }, diagnosticsScope: 'candidate' }
  if ((lynxRejectedDisplayValues as readonly string[]).includes(candidate) && output.sourceCss !== undefined && output.encodedByteLength !== undefined) {
    try {
      // 这里只证明拒绝前确有输入声明；编码后声明仍完全来自上方 decoder 文本。
      const input = cssDeclarations(output.sourceCss).contextsByClass.get(candidate) ?? []
      observation.rejectionProof = {
        encodedByteLength: output.encodedByteLength,
        input: { statements: input.map(item => ({ selector: item.selector, conditions: item.atRules, property: item.declaration.property, value: item.declaration.value ?? '', important: Boolean(item.declaration.important) })), diagnostics: [] },
      }
    }
    catch {
      return unreadable('负向合同的真实 encoder 输入无法解析')
    }
  }
  return observation
}
