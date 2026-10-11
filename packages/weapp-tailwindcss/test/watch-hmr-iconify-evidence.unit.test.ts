import type { CliOptions, WatchCase, WatchSession } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { replaceWxml } from '../../../tools/weapp-tailwindcss-scripts/src/core/replace-wxml'
import { buildCases } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases'
import { runIconifyHotUpdate } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/iconify'
import { assertIconifyConsumer } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/iconify/evidence'
import { createIconifyProbeSource } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/iconify/probe'
import * as shared from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/shared'
import * as text from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'

const roots: string[] = []
const before = 'before:content-[\'before\']'
const after = 'before:content-[\'after\']'
const icon = 'i-[mdi--star]'
const style = `.${replaceWxml(icon)}{mask-image:url(icon.svg)}.${replaceWxml(before)}::before{content:'before'}.${replaceWxml(after)}::before{content:'after'}`
const realCases = buildCases(fileURLToPath(new URL('../../../', import.meta.url)), { includeLocalOnly: true })

function tsxClassValues(source: string) {
  const result = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.Preserve },
    fileName: 'probe.tsx',
    reportDiagnostics: true,
  })
  expect(result.diagnostics).toEqual([])
  const file = ts.createSourceFile('probe.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const values: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(file) === 'className' && node.initializer) {
      const value = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer
      if (value && ts.isStringLiteral(value)) {
        values.push(value.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return values
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture(onWrite?: (source: string, watchCase: WatchCase) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'iconify-evidence-'))
  roots.push(root)
  const sourceFile = path.join(root, 'page.vue')
  const sourceOriginal = '<template><view>original</view></template>'
  const css = path.join(root, 'app.wxss')
  const watchCase = {
    name: 'uni-app-x-vdom-tailwindcss-v4:mp-weixin',
    label: 'iconify evidence',
    outputWxml: path.join(root, 'page.wxml'),
    outputJs: path.join(root, 'page.js'),
    templateMutation: {
      sourceFile,
      verifyEscapedIn: ['wxml'],
      mutate: (source, payload) => source.replace('</template>', `<view class="${payload.classLiteral}">${payload.marker}</view></template>`),
    },
  } as WatchCase
  await Promise.all([
    writeFile(sourceFile, sourceOriginal),
    writeFile(css, style),
    writeFile(watchCase.outputWxml, '<view>original</view>'),
    writeFile(watchCase.outputJs, ''),
  ])
  vi.spyOn(shared, 'waitForClassOutputBaseline').mockResolvedValue({ wxml: '<view>original</view>', js: '', globalStyle: style })
  vi.spyOn(shared, 'waitForCompileSettled').mockResolvedValue(0)
  vi.spyOn(text, 'writeFilePreserveEol').mockImplementation(async (file, source) => {
    await writeFile(file, source)
    await onWrite?.(source, watchCase)
  })
  return {
    watchCase,
    css,
    sourceOriginal,
    sourceFile,
    run: () => runIconifyHotUpdate(watchCase, { timeoutMs: 100, pollMs: 1 } as CliOptions, {
      ensureRunning() {},
      pluginProcessSamplesSince: () => [],
    } as unknown as WatchSession, { sourceFile, beforeContentClass: before, afterContentClass: after, iconClassTokens: [icon] }, sourceOriginal, [css]),
  }
}

async function emit(source: string, watchCase: WatchCase) {
  const output = source.replace(/class="([^"]+)"/g, (_, classes: string) => `class="${classes.split(' ').map(token => replaceWxml(token)).join(' ')}"`)
  await writeFile(watchCase.outputWxml, output)
}

describe('Iconify HMR 的本轮产物证据', () => {
  it('已有 CSS 包含前后文案和图标，但编译器没有消费本轮源码时必须失败', async () => {
    const { run } = await fixture()
    await expect(run()).rejects.toThrow(/iconify HMR inject/)
  })

  it('使用已有模板 mutate 生成两个阶段的真实 class 消费，再撤销探针', async () => {
    const sources: string[] = []
    const { run, watchCase, sourceOriginal } = await fixture(async (source, watchCase) => {
      sources.push(source)
      await emit(source, watchCase)
    })
    const mutate = vi.spyOn(watchCase.templateMutation, 'mutate')
    const metrics = await run()
    expect(metrics.marker).toContain(`tw-watch-iconify-${watchCase.name}`)
    expect(mutate).toHaveBeenCalledTimes(2)
    const injectMarker = mutate.mock.calls[0]![1].marker
    const contentMarker = mutate.mock.calls[1]![1].marker
    expect(replaceWxml(injectMarker)).toBe(injectMarker)
    expect(sources[0]).toContain(injectMarker)
    expect(sources[1]).toContain(contentMarker)
    expect(sources[1]).not.toContain(injectMarker)
    expect(sources[2]).toBe(sourceOriginal)
    expect(metrics.verifiedContentEscapedClasses).toEqual([replaceWxml(after)])
    expect(metrics.hotUpdateEffectiveMs).toBeGreaterThanOrEqual(metrics.hotUpdateOutputMs)
  })

  it('前后 CSS 都已存在时，停留在注入阶段的产物不能证明 content 阶段', async () => {
    let writes = 0
    const { run } = await fixture(async (source, watchCase) => {
      if (++writes === 1) {
        await emit(source, watchCase)
      }
    })
    await expect(run()).rejects.toThrow(/iconify HMR content/)
    expect(writes).toBe(2)
  })

  it('新增 content 消费但残留 inject 消费时必须失败', async () => {
    let previous = ''
    const { run } = await fixture(async (source, watchCase) => {
      await emit(`${previous}${source}`, watchCase)
      previous = source
    })
    await expect(run()).rejects.toThrow(/retained previous phase/)
  })

  it.each([1, 2])('第 %s 次编译稳定后必须重新检查图标 CSS', async (phase) => {
    const { run, css } = await fixture(emit)
    let settled = 0
    vi.mocked(shared.waitForCompileSettled).mockImplementation(async () => {
      if (++settled === phase) {
        await writeFile(css, '')
      }
      return 0
    })
    await expect(run()).rejects.toThrow(/iconify HMR (inject|content) settled/)
  })

  it('回滚编译完成后不能重新出现本轮消费', async () => {
    let lastProbe = ''
    const { run, watchCase } = await fixture(async (source, watchCase) => {
      if (source.includes('-content')) {
        lastProbe = source
      }
      await emit(source, watchCase)
    })
    let settled = 0
    vi.mocked(shared.waitForCompileSettled).mockImplementation(async () => {
      if (++settled === 3) {
        await emit(lastProbe, watchCase)
      }
      return 0
    })
    await expect(run()).rejects.toThrow(/rollback retained current probe/)
  })

  it('同一 class 组必须同时含阶段身份、图标和当前 content', () => {
    const marker = 'phase-content'
    const classes = [icon, after].map(token => replaceWxml(token))
    const verify = (wxml: string, js = '', targets: Array<'wxml' | 'js'> = ['wxml']) => assertIconifyConsumer(
      { wxml, js, globalStyle: style },
      targets,
      marker,
      [icon, after],
      classes,
      'consumer',
    )
    expect(() => verify(`<view class="${marker}"/><view class="${classes.join(' ')}"/>`)).toThrow()
    expect(() => verify(`<!-- <view class="${marker} ${classes.join(' ')}"/> -->`)).toThrow()
    expect(() => verify(`<view class="${marker} ${replaceWxml(icon)} ${replaceWxml(before)}"/>`)).toThrow()
    expect(() => verify(`<view class="${marker} ${classes.join(' ')}"/>`)).not.toThrow()
    const literal = JSON.stringify(`${marker} ${classes.join(' ')}`)
    expect(() => verify('', `jsx(View, {className: ${literal}})`, ['js'])).not.toThrow()
    expect(() => verify('', `createBaseVNode('view', {class: ${literal}})`, ['js'])).not.toThrow()
    expect(() => verify('', `createElement(View, {'className': ${literal}})`, ['js'])).not.toThrow()
    expect(() => verify('', `const unused = ${literal}`, ['js'])).toThrow()
    expect(() => verify('', `const value = ${literal}; jsx(View, {className: value})`, ['js'])).toThrow()
    expect(() => verify('', `jsx(View, {className: ${literal}, className: 'old'})`, ['js'])).toThrow()
    expect(() => verify('', `jsx(View, {className: ${literal}, ...props})`, ['js'])).toThrow()
    expect(() => verify('', `jsx(View, {className: ${literal}, ['className']: 'old'})`, ['js'])).toThrow()
    expect(() => verify('', `jsx(View, {className: ${literal}, [key]: 'old'})`, ['js'])).toThrow()
    expect(() => verify('', `jsx(View, {className: '${marker}'}); jsx(View, {className: ${JSON.stringify(classes.join(' '))}})`, ['js'])).toThrow()
    expect(() => verify('', `// ${marker} ${classes.join(' ')}`, ['js'])).toThrow()
  })

  it('同一阶段支持 safe class，但拒绝其他消费位置的样式拼接', () => {
    const alias = 'wtu-after-0'
    const globalStyle = `${style}.${alias}::before{content:'after'}`
    const verify = (wxml: string) => assertIconifyConsumer({ wxml, js: '', globalStyle }, ['wxml'], 'phase-content', [icon, after], [icon, after].map(token => replaceWxml(token)), 'consumer')
    expect(() => verify(`<view class="phase-content ${replaceWxml(icon)} ${alias}"/>`)).not.toThrow()
    expect(() => verify(`<view class="phase-content ${replaceWxml(icon)}"/><view class="${alias}"/>`)).toThrow()
  })

  it.each(realCases)('$name 沿用真实模板载体，两个阶段均只在原始源码上插入', async (watchCase) => {
    const config = watchCase.iconifyHmr!
    const original = await readFile(config.sourceFile, 'utf8')
    for (const [phase, content] of [['inject', before], ['content', after]]) {
      const marker = `test-iconify-${phase}`
      const classLiteral = [marker, icon, content].join(' ')
      const next = createIconifyProbeSource(watchCase, config, original, {
        marker,
        classLiteral,
        iconClassTokens: [icon],
        beforeContentClass: before,
        afterContentClass: after,
      })
      if (path.extname(config.sourceFile) === '.tsx') {
        expect(tsxClassValues(next)).toContain(classLiteral)
      }
      else {
        expect(next).toContain(`class="${classLiteral}"`)
      }
      expect(next).not.toContain(`test-iconify-${phase === 'inject' ? 'content' : 'inject'}`)
      expect(await readFile(config.sourceFile, 'utf8')).toBe(original)
    }
  })

  it.each(realCases.filter(watchCase => watchCase.name === 'taro-vite-react-tailwindcss-v4' || watchCase.name === 'taro-webpack-react-tailwindcss-v4'))('$name 的 JSX 模板载体保留单双引号、反斜杠和实体字符', async (watchCase) => {
    const config = watchCase.iconifyHmr!
    const original = await readFile(config.sourceFile, 'utf8')
    const classLiteral = String.raw`probe i-[mdi--star] before:content-['say_"hi"&\tail']`
    const next = createIconifyProbeSource(watchCase, config, original, {
      marker: 'probe',
      classLiteral,
      iconClassTokens: [icon],
      beforeContentClass: before,
      afterContentClass: after,
    })
    expect(tsxClassValues(next)).toContain(classLiteral)
  })

  it('custom mutate 保留现有 payload，但没有当前 class 消费时不能降级到 CSS', async () => {
    const { watchCase, sourceFile, sourceOriginal } = await fixture()
    const config = { sourceFile, mutate: (_source: string, payload: { marker: string }) => `<view>${payload.marker}</view>` }
    const next = createIconifyProbeSource(watchCase, config, sourceOriginal, {
      marker: 'custom-content',
      classLiteral: `custom-content ${icon} ${after}`,
      iconClassTokens: [icon],
      beforeContentClass: before,
      afterContentClass: after,
    })
    expect(next).toBe('<view>custom-content</view>')
    expect(() => assertIconifyConsumer({ wxml: next, js: '', globalStyle: style }, ['wxml'], 'custom-content', [icon, after], [icon, after].map(token => replaceWxml(token)), 'custom')).toThrow()
  })
})
