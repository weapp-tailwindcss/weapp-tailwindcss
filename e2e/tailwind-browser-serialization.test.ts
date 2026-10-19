import type { Frame, Page } from 'playwright'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { tsImport } from 'tsx/esm/api'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const methods = new Set(['evaluate', 'evaluateHandle', '$eval', '$$eval', 'waitForFunction', 'addInitScript'])

function serialize(source: string) {
  // 与 CLI 的 tsx 保留函数名选项一致；仅传输函数本体，不携带 Node 模块的词法环境。
  const compiled = transformSync(`globalThis.serialized = (${source})`, { loader: 'ts', target: 'es2022', format: 'esm', keepNames: true, minifyWhitespace: true }).code
  return String(runInNewContext(`${compiled}; globalThis.serialized`, {}))
}

async function callbacks(directory: string): Promise<Array<{ file: string, line: number, serialized: string }>> {
  const result: Array<{ file: string, line: number, serialized: string }> = []
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.artifacts', '__snapshots__', 'dist', 'output'].includes(item.name)) {
      continue
    }
    const file = path.join(directory, item.name)
    if (item.isDirectory()) {
      result.push(...await callbacks(file))
      continue
    }
    if (!/\.(?:ts|tsx|mts)$/.test(file) || file.endsWith('.test.ts')) {
      continue
    }
    const source = await readFile(file, 'utf8')
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && methods.has(node.expression.name.text)) {
        const method = node.expression.name.text
        const callback = node.arguments[method === '$eval' || method === '$$eval' ? 1 : 0]
        if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
          result.push({ file: path.relative(root, file), line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, serialized: serialize(callback.getText(ast)) })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
  }
  return result
}

describe('CLI 编译后的浏览器闭包传输边界', () => {
  it('重现保留函数名后丢失模块级helper的真实跨realm故障', () => {
    const serialized = serialize('(values: number[]) => { const double = (value: number) => value * 2; return values.map(double) }')
    expect(serialized).toContain('__name(')
    expect(() => runInNewContext(`(${serialized})([2])`, {})).toThrow('__name is not defined')
  })

  it('所有E2E浏览器函数经tsx等价转译后都不能依赖模块级编译helper', async () => {
    const all = await callbacks(path.join(root, 'e2e'))
    expect(all.length).toBeGreaterThanOrEqual(60)
    expect(all.filter(item => /\b__(?:name|defProp)\b/.test(item.serialized)).map(({ file, line }) => `${file}:${line}`)).toEqual([])
  })

  it('真实tsx加载的registry测量能在没有__name的隔离realm执行', async () => {
    const loaded = await tsImport(pathToFileURL(path.join(root, 'e2e', 'tailwind-capabilities', 'registry-web', 'measure.ts')).href, import.meta.url)
    let serialized = ''
    const frame = { evaluate: async (callback: () => unknown) => {
      serialized = String(callback)
      return []
    } } as unknown as Frame
    await loaded.observeRegistry(frame, [])
    const rect = { left: 10, top: 20, width: 80, height: 48 }
    const probe = { getBoundingClientRect: () => rect, scrollWidth: 80, scrollHeight: 48 }
    const child = { getBoundingClientRect: () => ({ left: 14, top: 26, width: 20, height: 10 }), scrollWidth: 20, scrollHeight: 10 }
    const section = { querySelector: () => probe, querySelectorAll: (selector: string) => selector === '[data-child]' ? [child] : [], getBoundingClientRect: () => ({ left: 8, top: 12 }) }
    const result = runInNewContext(`(${serialized})(definitions)`, {
      definitions: [{ id: 'unit/color', index: 3, properties: ['color', 'content'] }],
      document: { getAnimations: () => [], querySelector: () => section },
      window: { getComputedStyle: (_element: unknown, pseudo: string | undefined) => ({ getPropertyValue: (property: string) => property === 'color' ? ' rgb(18, 52, 86) ' : pseudo ? '"probe"' : 'normal' }) },
    })
    expect(result).toEqual([{ id: 'unit/color', styles: { color: 'rgb(18, 52, 86)', content: 'normal' }, childStyles: [{ color: 'rgb(18, 52, 86)', content: 'normal' }], pseudoStyles: { color: 'rgb(18, 52, 86)', content: '"probe"' }, geometry: [2, 8, 80, 48, 80, 48, 6, 14, 20, 10, 20, 10], unavailableProperties: [] }])
  })

  it('真实tsx加载的context测量保留原生事件与媒体证据且不需要模块helper', async () => {
    const loaded = await tsImport(pathToFileURL(path.join(root, 'e2e', 'tailwind-capabilities', 'web-context', 'observe.ts')).href, import.meta.url)
    let serialized = ''
    const page = { evaluate: async (callback: () => unknown) => {
      serialized = String(callback)
      return { values: {}, events: [] }
    } } as unknown as Page
    await loaded.observeContextState(page, { expected: { 'media/(prefers-contrast: more)': true } })
    class Input {
      value = 'edited'
      type = 'text'
      required = true
      disabled = false
      readOnly = false
      validity = { valid: true }
      getClientRects() { return [{}] }
      getBoundingClientRect() { return { width: 80, height: 48 } }
      matches() { return true }
    }
    const target = new Input()
    const events = ['input', 'change', 'blur', 'submit', 'reset', 'invalid'].map(type => ({ type, trusted: true, target: 'probe', value: 'edited' }))
    const result = runInNewContext(`(${serialized})({ queries: ['(prefers-contrast: more)'] })`, {
      HTMLInputElement: Input,
      document: { body: { dataset: { contextFixture: 'input' } }, querySelector: (selector: string) => selector === '#disabled-content' ? null : target },
      getComputedStyle: () => ({ backgroundColor: 'rgb(18, 52, 86)' }),
      matchMedia: () => ({ matches: true }),
      CSS: { supports: () => true },
      __tailwindContextEvents: events,
      __tailwindContextScript: 'ready',
    })
    expect(result.events).toEqual(events)
    expect(result.values).toMatchObject({ 'fixture': 'input', 'script': 'ready', 'rendered': true, 'media/(prefers-contrast: more)': true, 'native/input-current': true, 'native/change-current': true, 'native/blur-current': true, 'native/invalid': true, 'native/submit': true, 'native/reset': true, 'native/untrusted': false })
  })

  it('真实tsx加载的starting递归采样在隔离realm记录自然帧与原生事件', async () => {
    const loaded = await tsImport(pathToFileURL(path.join(root, 'e2e', 'tailwind-capabilities', 'web-lifecycle', 'starting.ts')).href, import.meta.url)
    let serialized = ''
    const page = { evaluate: async (callback: () => unknown) => {
      if (serialized) {
        throw new Error('stop-after-initialize')
      }
      serialized = String(callback)
    } } as unknown as Page
    await expect(loaded.observeStarting(page, 'serialized-starting', async () => {
      throw new Error('截图不应执行')
    })).rejects.toThrow('stop-after-initialize')
    const frames: Array<() => void> = []
    const listeners = new Map<string, (event: unknown) => void>()
    const realm = {
      document: {
        addEventListener: (type: string, callback: (event: unknown) => void) => listeners.set(type, callback),
        querySelector: (selector: string) => ({ opacity: selector === '#probe' ? '0.25' : '1' }),
      },
      requestAnimationFrame: (callback: () => void) => frames.push(callback),
      performance: { now: () => 100 },
      getComputedStyle: (target: { opacity: string }) => target,
    }
    runInNewContext(`(${serialized})('serialized-starting')`, realm)
    const journal = Reflect.get(realm, '__tailwindLifecycle') as { runId: string, cycle: number, phase: string, frames: unknown[], events: unknown[] }
    journal.phase = 'natural'
    journal.cycle = 2
    frames.shift()!()
    expect(frames).toHaveLength(1)
    expect(journal.frames).toEqual([{ cycle: 2, time: 100, probe: 0.25, control: 1, phase: 'rendered' }])
    listeners.get('transitionstart')!({ isTrusted: true, target: { id: 'probe' }, propertyName: 'opacity', elapsedTime: 0, pseudoElement: '' })
    expect(journal.events).toEqual([{ type: 'transitionstart', trusted: true, target: 'probe', time: 100, cycle: 2, phase: 'natural', property: 'opacity', elapsedTime: 0, pseudoElement: '' }])
    expect(journal.runId).toBe('serialized-starting')
    expect(serialized).not.toMatch(/\b__(?:name|defProp)\b/)
  })
})
