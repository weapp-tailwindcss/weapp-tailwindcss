import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { replaceWxml } from '../../../tools/weapp-tailwindcss-scripts/src/core/replace-wxml'
import { assertClassTokensInOutput, assertPreviousClassEvidenceRemoved } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class/evidence'
import { assertRoundOutputs } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class'
import { assertClassOutputs } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class/added-class'
import { assertMainStyleOutputs } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/main-style'
import { assertUserReportedOutputs } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/user-reported'
import type { ClassMutationConfig, CliOptions, UserReportedHotUpdateConfig, WatchCase, WatchSession } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { readJoinedOutputFiles, waitForOutputFilesUpdated } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/shared'

const utility = 'text-[23px]'
const escaped = replaceWxml(utility)
const reference = `.${escaped} { font-size: 23px; }`
const alias = 'wtu-real-0'
const aliasRule = `.${alias}.${alias}.data-v-a1 { font-size: 23px; }`

function outputs(wxml = `<view class="${alias} data-v-a1"/>`, globalStyle = `${reference}\n${aliasRule}`, js = '') {
  return { wxml, js, globalStyle }
}

function verify(snapshot: ReturnType<typeof outputs>, target: 'wxml' | 'js' = 'wxml') {
  return assertClassTokensInOutput(snapshot, [utility], [escaped], [target], 'test')
}

describe('watch class output evidence', () => {
  it('accepts an original escaped class and its rule', () => {
    expect(verify(outputs(`<view class="${escaped}"/>`, reference))[0]?.actualClass).toBe(escaped)
  })

  it('connects a consumed safe class to the complete utility rule', () => {
    expect(verify(outputs())[0]).toMatchObject({ utility, escapedClass: escaped, actualClass: alias, target: 'wxml' })
  })

  it('connects a script string token to its safe CSS rule', () => {
    expect(verify(outputs('', `${reference}\n${aliasRule}`, `const data = { className: "${alias} data-v-a1" }`), 'js')[0]?.actualClass).toBe(alias)
  })

  it.each([
    ['missing alias CSS', reference],
    ['wrong declaration', `${reference}\n.${alias} { font-size: 24px; }`],
    ['missing utility reference', aliasRule],
    ['wrong pseudo', `${reference}\n.${alias}:hover { font-size: 23px; }`],
    ['wrong descendant', `${reference}\n.${alias} > view { font-size: 23px; }`],
    ['wrong condition', `${reference}\n@media (width > 400px) { .${alias} { font-size: 23px; } }`],
    ['wrong important', `${reference}\n.${alias} { font-size: 23px !important; }`],
    ['extra declaration', `${reference}\n.${alias} { font-size: 23px; display: none; }`],
  ])('rejects %s', (_, css) => {
    expect(() => verify(outputs(undefined, css))).toThrow(utility)
  })

  it('does not accept utility text or a class substring as class evidence', () => {
    expect(() => verify(outputs(`<view class="prefix-${escaped}">${utility}</view>`, reference))).toThrow(utility)
    expect(() => verify(outputs(`<view>${alias}</view>`))).toThrow(utility)
  })

  it('does not accept a JS comment as class evidence', () => {
    expect(() => verify(outputs('', `${reference}\n${aliasRule}`, `// "${alias} data-v-a1"`), 'js')).toThrow(utility)
  })

  it('requires every safe class even when another utility has valid CSS', () => {
    const spacing = 'space-y-2.5'
    const css = `${reference}\n${aliasRule}\n.${replaceWxml(spacing)} > view + view { margin-top: 10px; }`
    expect(() => assertClassTokensInOutput(outputs(`<view class="${alias} wtu-missing-1 data-v-a1"/>`, css), [utility, spacing], [escaped, replaceWxml(spacing)], ['wxml'], 'test')).toThrow(spacing)
  })

  it('preserves child selector and conditional rule evidence', () => {
    const css = `@media (width > 400px) { .${escaped} > view + view { margin-top: 10px; } .${alias}.${alias}.data-v-a1 > view + view { margin-top: 10px; } }`
    expect(verify(outputs(undefined, css))[0]?.actualClass).toBe(alias)
  })

  it('preserves fallback declaration order', () => {
    const css = `.${escaped} { display: block; display: flex; } .${alias} { display: flex; display: block; }`
    expect(() => verify(outputs(undefined, css))).toThrow(utility)
  })

  it('preserves cascade order across separate rules', () => {
    const css = `.${escaped}{color:red}.${escaped}{color:blue}.${alias}{color:blue}.${alias}{color:red}`
    expect(() => verify(outputs(undefined, css))).toThrow(utility)
  })

  it('accepts repeated complete rule blocks without losing cascade order', () => {
    const css = `.${escaped}{color:red}.${escaped}{color:blue}.${alias}{color:red}.${alias}{color:blue}.${alias}{color:red}.${alias}{color:blue}`
    expect(verify(outputs(undefined, css))[0]?.actualClass).toBe(alias)
  })

  it('does not borrow a scope class from another template node', () => {
    expect(() => verify(outputs(`<view class="${alias}"/><view class="data-v-a1"/>`))).toThrow(utility)
  })

  it.each([
    `.data-v-a1 .${alias}`,
    `.data-v-a1 > .${alias}`,
    `.data-v-a1 + .${alias}`,
    `.${alias} .data-v-a1`,
    `.${alias} > view.data-v-a1`,
  ])('does not infer another compound scope from the alias node: %s', (selector) => {
    expect(() => verify(outputs(undefined, `${reference}\n${selector}{font-size:23px}`))).toThrow(utility)
  })

  it.each([
    `.data-v-a1.${alias}`,
    `.${alias}.data-v-a1`,
    `.${alias}.data-v-a1.${alias}`,
  ])('accepts the consumed scope on the same alias compound: %s', (selector) => {
    expect(verify(outputs(undefined, `${reference}\n${selector}{font-size:23px}`))[0]?.actualClass).toBe(alias)
  })

  it.each(['data-class', 'hover-class'])('does not treat %s as the class attribute', (attribute) => {
    expect(() => verify(outputs(`<view ${attribute}="${alias} data-v-a1"/>`))).toThrow(utility)
  })

  it('does not accept a class attribute in a WXML comment', () => {
    expect(() => verify(outputs(`<!-- <view class="${alias} data-v-a1"/> -->`))).toThrow(utility)
  })

  it('does not accept class-like text inside another attribute', () => {
    expect(() => verify(outputs(`<view title=" class='${alias} data-v-a1'"/>`))).toThrow(utility)
  })

  it('does not treat an empty rule as utility declarations', () => {
    expect(() => verify(outputs(undefined, `.${escaped}{}.${alias}{}`))).toThrow(utility)
  })

  it('checks rollback against saved aliases even after CSS disappears', () => {
    const previous = verify(outputs())
    expect(() => assertPreviousClassEvidenceRemoved(outputs(`<view class="${alias}"/>`, ''), previous, [], 'rollback')).toThrow(alias)
    expect(() => assertPreviousClassEvidenceRemoved(outputs('<view/>', ''), previous, [], 'rollback')).not.toThrow()
  })

  it('saves every equivalent consumed alias for rollback', () => {
    const second = 'wtu-other-1'
    const previous = verify(outputs(`<view class="${alias} ${second} data-v-a1"/>`, `${reference}\n${aliasRule}\n.${second}{font-size:23px}`))
    expect(previous.map(entry => entry.actualClass)).toEqual([alias, second])
    expect(() => assertPreviousClassEvidenceRemoved(outputs(`<view class="${second}"/>`, ''), previous, [], 'rollback')).toThrow(second)
  })

  it('allows baseline and retained utilities across replacement boundaries', () => {
    const previous = verify(outputs())
    expect(() => assertPreviousClassEvidenceRemoved(outputs(), previous, [utility], 'rollback')).not.toThrow()
  })
})

describe('watch mutation evidence entrypoints', () => {
  const watchCase = { label: 'test' } as WatchCase
  const mutation = { verifyEscapedIn: ['wxml'], verifyClassLiteralIn: [] } as unknown as ClassMutationConfig
  const config = { ...mutation, label: 'reported', sourceFile: 'fixture.vue' } as unknown as UserReportedHotUpdateConfig

  it('reads reference rules through registered output imports and deduplicates cycles', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'watch-class-evidence-'))
    try {
      const entry = path.join(dir, 'entry.wxss')
      const utilityFile = path.join(dir, 'utilities.wxss')
      const page = path.join(dir, 'component.wxss')
      await Promise.all([
        writeFile(entry, '@import "./utilities.wxss";'),
        writeFile(utilityFile, `@import "./entry.wxss";\n${reference}`),
        writeFile(page, aliasRule),
      ])
      const css = await readJoinedOutputFiles([entry, page])
      expect(css.split(reference)).toHaveLength(2)
      expect(verify(outputs(undefined, css))[0]?.actualClass).toBe(alias)
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not let changed mtimes bypass saved-alias rollback evidence', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'watch-class-rollback-'))
    try {
      const outputWxml = path.join(dir, 'output.wxml')
      const outputJs = path.join(dir, 'output.js')
      const stale = outputs(`<view class="${alias}">rollback-marker</view>`, '', 'export default {}')
      await Promise.all([writeFile(outputWxml, stale.wxml), writeFile(outputJs, stale.js)])
      const previous = verify(outputs())
      let lastError: unknown
      await expect(waitForOutputFilesUpdated(
        { label: 'rollback', outputWxml, outputJs } as WatchCase,
        [outputWxml, outputJs],
        new Map([[outputWxml, 0], [outputJs, 0]]),
        { timeoutMs: 30, pollMs: 2 } as CliOptions,
        { ensureRunning() {} } as WatchSession,
        Date.now(),
        async () => {
          try {
            assertPreviousClassEvidenceRemoved(stale, previous, [], 'rollback')
            return true
          }
          catch (error) {
            lastError = error
            throw error
          }
        },
      )).rejects.toThrow()
      expect(lastError).toBeInstanceOf(Error)
      expect((lastError as Error).message).toContain(alias)
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it.each(['template', 'script'] as const)('checks safe CSS through the %s round assertion', (kind) => {
    const target = kind === 'script' ? 'js' : 'wxml'
    const snapshot = outputs(undefined, `${reference}\n${aliasRule}`, `const className = "${alias} data-v-a1"`)
    const currentMutation = { ...mutation, verifyEscapedIn: [target] } as ClassMutationConfig
    expect(assertRoundOutputs(watchCase, kind, 'fixture.vue', 'add', currentMutation, [], [], 1, [utility], [escaped], snapshot)).toEqual([escaped])
    expect(() => assertRoundOutputs(watchCase, kind, 'fixture.vue', 'modify', currentMutation, [], [], 1, [utility], [escaped], { ...snapshot, globalStyle: reference })).toThrow(utility)
  })

  it('requires alias CSS for added-class and main-style assertions', () => {
    const snapshot = outputs(`<view class="${alias} data-v-a1">marker</view>`)
    expect(assertClassOutputs(snapshot, watchCase, 'template', mutation, [], 'marker', [utility], [escaped], 1).evidence).toHaveLength(1)
    expect(assertMainStyleOutputs(watchCase, mutation, 'hot-update', utility, escaped, snapshot).evidence).toHaveLength(1)
    const missing = { ...snapshot, globalStyle: reference }
    expect(() => assertClassOutputs(missing, watchCase, 'template', mutation, [], 'marker', [utility], [escaped], 1)).toThrow(utility)
    expect(() => assertMainStyleOutputs(watchCase, mutation, 'hot-update', utility, escaped, missing)).toThrow(utility)
  })

  it('checks userReported text and saved safe aliases across rollback', () => {
    const active = assertUserReportedOutputs(watchCase, config, 'hot-update', [utility], [escaped], outputs())
    const before = 'text-xs'
    const restored = outputs(`<view class="${before}">issue-1002 ${utility}</view>`, `.${before}{font-size:12px}`)
    expect(() => assertUserReportedOutputs(watchCase, config, 'rollback', [before], [before], restored, active.evidence)).not.toThrow()
    expect(() => assertUserReportedOutputs(watchCase, config, 'rollback', [before], [before], {
      ...restored, wxml: `<view class="${before} ${alias}">${utility}</view>`,
    }, active.evidence)).toThrow(alias)
    expect(() => assertUserReportedOutputs(watchCase, config, 'hot-update', [utility], [escaped], outputs(`<view>${utility}</view>`, reference))).toThrow(utility)
  })
})
