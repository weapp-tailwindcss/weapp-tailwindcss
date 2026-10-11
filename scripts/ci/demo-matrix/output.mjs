import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { tokenize, TokenType } from '@csstools/css-tokenizer'
import fg from 'fast-glob'
import postcss from 'postcss'
import { inspectAuthored } from './authored.mjs'
import { coverage, isWeb } from './catalog.mjs'
import { consumedClasses } from './consumption.mjs'
import { arbitraryValues, probeClasses } from './probe.mjs'

const mpxExtensions = { wx: ['.wxml', '.wxss'], ali: ['.axml', '.acss'], swan: ['.swan', '.css'], tt: ['.ttml', '.ttss'], dd: ['.ddml', '.ddss'] }

const compact = value => value.replace(/\s+/g, '')
export function cssClasses(selector) {
  const tokens = tokenize({ css: selector })
  return tokens.flatMap((token, index) => token[0] === TokenType.Delim && token[1] === '.' && tokens[index + 1]?.[0] === TokenType.Ident ? [tokens[index + 1][4].value] : [])
}

function classCompounds(selector) {
  const groups = [{ names: [], uncertain: false }]
  let depth = 0
  const tokens = tokenize({ css: selector })
  for (const [index, token] of tokens.entries()) {
    if (token[0] === TokenType.Function || token[0] === TokenType.OpenParen) {
      depth++
      groups.at(-1).uncertain = true
    }
    if (token[0] === TokenType.CloseParen) {
      depth--
    }
    if (depth === 0 && (token[0] === TokenType.Whitespace || token[0] === TokenType.Comma || (token[0] === TokenType.Delim && ['>', '+', '~', '|'].includes(token[1])))) {
      groups.push({ names: [], uncertain: false })
    }
    if (token[0] === TokenType.Delim && token[1] === '.' && tokens[index + 1]?.[0] === TokenType.Ident) {
      groups.at(-1).names.push(tokens[index + 1][4].value)
    }
  }
  return groups
}

function safeClass(value) {
  return value.replaceAll('[', '_b').replaceAll(']', '_B').replaceAll('/', '_f')
}

function numericDimension(value) {
  const tokens = tokenize({ css: value }).filter(token => token[0] !== TokenType.EOF && token[0] !== TokenType.Whitespace)
  if (tokens.length === 1 && tokens[0][0] === TokenType.Dimension) {
    return { value: tokens[0][4].value, unit: tokens[0][4].unit }
  }
  if (tokens.length === 5 && tokens[0][0] === TokenType.Function && tokens[0][4].value === 'calc'
    && tokens[1][0] === TokenType.Dimension && tokens[2][1] === '*'
    && tokens[3][0] === TokenType.Number && tokens[4][0] === TokenType.CloseParen) {
    return { value: tokens[1][4].value * tokens[3][4].value, unit: tokens[1][4].unit }
  }
}

export function inspectStyles(styles, item, round = 'initial', consumed = {}) {
  const probes = probeClasses(item, round)
  const classes = Object.values(probes)
  const actualClasses = new Map(classes.map(name => [name, new Set(consumed[name] ?? [name, safeClass(name)])]))
  const rules = new Map()
  const variables = new Set()
  for (const style of styles) {
    const root = postcss.parse(style)
    root.walkDecls('--spacing', decl => variables.add(compact(decl.value)))
    root.walkRules((rule) => {
      const compounds = classCompounds(rule.selector)
      for (const [original, actual] of actualClasses) {
        // 作用域类只是复合选择器的一部分；缺少同一复合中的业务类时该规则不可能命中探针。
        // 函数伪类的选择分支不能简单取交集，仍保留其证据，避免抹掉条件样式差异。
        if (!compounds.some(group => group.names.some(name => actual.has(name)) && (group.uncertain || group.names.every(name => actual.has(name))))) {
          continue
        }
        const values = rules.get(original) ?? new Map()
        for (const node of rule.nodes) {
          if (node.type === 'decl') {
            const declarations = values.get(node.prop) ?? new Set()
            declarations.add(compact(node.value))
            values.set(node.prop, declarations)
          }
        }
        rules.set(original, values)
      }
    })
  }
  const properties = { height: 'height', medium: 'height', large: 'height', margin: 'margin-top', display: 'display', color: 'color', arbitrary: 'height', arbitraryLarge: 'height', opacity: 'background-color', added: 'width' }
  const result = Object.fromEntries(Object.entries(probes).map(([key, name]) => {
    const values = [...(rules.get(name)?.get(properties[key]) ?? [])].sort()
    assert.ok(values.length, `${item.id}: missing ${name} / ${properties[key]}`)
    return [name, values]
  }))
  if (coverage(item) === 'authored-styles') {
    return inspectAuthored(result, item, round)
  }
  assert.ok(result.flex.includes('flex'))
  const values = arbitraryValues(item)
  assert.ok(result[`h-[${values.small}]`].includes(values.small), `${item.id}: arbitrary height`)
  assert.ok(result[`h-[${values.large}]`].includes(values.large))
  if (round === 'add') {
    assert.ok(result[`w-[${values.added}]`].includes(values.added))
  }
  const usesSpacing = Object.values(result).flat().some(value => value.includes('var(--spacing'))
  const requiresSpacing = Object.values(result).flat().some(value => value.includes('var(--spacing)'))
  if (requiresSpacing) {
    assert.ok(variables.size > 0, `${item.id}: missing spacing dependency`)
  }
  const inlineSpacing = []
  for (const [name, multiple] of [[probes.height, Number(probes.height.slice(2))], ['h-20', 20], ['h-50', 50], ['mt-2', 2]]) {
    // Web 保留动态变量与合法尺寸 fallback；浏览器阶段继续验证最终计算尺寸。
    const normalized = result[name].map(value => value.replace(/var\(--spacing,([^()]+)\)/g, (match, fallback) => {
      const dimension = numericDimension(fallback)
      return dimension && dimension.value > 0 ? 'var(--spacing)' : match
    }))
    assert.ok(normalized.some(value => value.includes(`var(--spacing)*${multiple}`) || value.includes(`${multiple}*var(--spacing)`)
      || numericDimension(value)), `${item.id}: invalid ${name}: ${result[name]}`)
    for (const value of result[name]) {
      const numeric = numericDimension(value)
      if (numeric) {
        inlineSpacing.push({ unit: numeric.unit, value: numeric.value / multiple })
      }
    }
  }
  for (const spacing of inlineSpacing) {
    assert.ok(spacing.value > 0 && spacing.unit === inlineSpacing[0].unit
      && Math.abs(spacing.value - inlineSpacing[0].value) < 0.001, `${item.id}: inconsistent spacing multiples`)
  }
  // 已内联的探针值不依赖主题中剩余的 spacing 声明。
  return { rules: result, spacing: usesSpacing ? [...variables].sort() : [] }
}

export async function inspectFiles(output, item, round, inspectAdditionalStyles) {
  const files = await fg('**/*', { cwd: output, absolute: true, onlyFiles: true })
  let styleFiles = files.filter(file => /\.(?:css|wxss|acss|ttss|qss|jxss|ddss|swan\.css)$/.test(file))
  const texts = await Promise.all(files.filter(file => /\.(?:js|html|wxml|axml|ttml|qml|qxml|swan|ddml|jxml|ksml|xhsml|ux)$/.test(file)).map(async file => ({ file, text: await readFile(file, 'utf8') })))
  let probeFiles = texts.filter(entry => entry.text.includes(`tw-matrix-${round}-height`))
  assert.ok(probeFiles.length, `${item.id}: missing current render marker ${round}`)
  if (item.family === 'mpx') {
    // 验收本轮标识所在的真实平台模板，不能让其他平台产物或 JS 字符串替代。
    const [template, style] = mpxExtensions[item.target] ?? []
    probeFiles = probeFiles.filter(entry => path.extname(entry.file) === template)
    styleFiles = styleFiles.filter(file => path.extname(file) === style)
    assert.ok(template && probeFiles.length, `${item.id}: expected ${item.target} template ${template}`)
    assert.ok(style && styleFiles.length, `${item.id}: expected ${item.target} stylesheet ${style}`)
  }
  const consumed = await consumedClasses(probeFiles, item, round)
  let relevant = styleFiles
  // 小程序只沿全局样式与当前页面的 import 图验收，避免其他分包掩盖缺失。
  if (!isWeb(item) && !item.name.startsWith('web/')) {
    const roots = styleFiles.filter(file => /^app\./.test(path.basename(file)) || probeFiles.some(probe => path.dirname(probe.file) === path.dirname(file) && path.parse(probe.file).name === path.parse(file).name))
    const reached = new Set()
    const visit = async (file) => {
      if (reached.has(file)) {
        return
      }
      reached.add(file)
      const imports = []
      postcss.parse(await readFile(file, 'utf8')).walkAtRules('import', (rule) => {
        const token = tokenize({ css: rule.params }).find(token => token[0] === TokenType.String)
        if (token && !/^(?:https?:|\/\/)/.test(token[4].value)) {
          imports.push(path.resolve(path.dirname(file), token[4].value))
        }
      })
      for (const dependency of imports) {
        await visit(dependency)
      }
    }
    for (const root of roots) {
      await visit(root)
    }
    relevant = [...reached]
  }
  const styles = await Promise.all(relevant.map(file => readFile(file, 'utf8')))
  const result = inspectStyles(styles, item, round, consumed)
  await inspectAdditionalStyles?.(styles, consumed)
  return item.family === 'mpx' ? { ...result, platform: item.target } : result
}
