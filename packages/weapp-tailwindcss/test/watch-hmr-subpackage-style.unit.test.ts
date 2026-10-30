import type { CliOptions, WatchSession } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { buildCases } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases'
import * as classes from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class'
import * as mainStyle from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/main-style'
import * as shared from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/shared'
import * as style from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/style'
import { createSubPackageWatchCase, runSubPackageMutation } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/subpackage'
import * as session from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'
import { createCssClassSignatureReader } from '../../postcss/src/selectorParser/class-signatures'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

it('分包派生移除父级执行面并保留显式零阈值，不修改父配置', () => {
  const base = buildCases('/repo').find(item => item.name === 'mpx-tailwindcss-v4')!
  const parent = { ...base, contentMutation: base.scriptMutation, minGlobalStyleEscapedClasses: 7 }
  const mutation = { ...parent.subPackageMutations![0]!, minGlobalStyleEscapedClasses: 0 }
  const derived = createSubPackageWatchCase(parent, mutation)

  expect(derived.contentMutation).toBeUndefined()
  expect(derived.subPackageMutations).toBeUndefined()
  expect(derived.minGlobalStyleEscapedClasses).toBe(0)
  expect(derived.templateMutation).toBe(mutation.templateMutation)
  expect(derived.globalStyleCandidates).toBe(mutation.globalStyleCandidates)
  expect(parent.contentMutation).toBe(base.scriptMutation)
  expect(parent.subPackageMutations).toBe(base.subPackageMutations)
  expect(parent.minGlobalStyleEscapedClasses).toBe(7)
})

it.each([
  ['有效声明', '.fixture-rule{font-size:23px}', true],
  ['丢失声明', '.other{font-size:23px}', false],
  ['错误声明', '.fixture-rule{font-size:24px}', false],
])('Mpx 分包分开验证 CSS 语义与 JS 样式载体：%s', async (_label, css, valid) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'watch-mpx-boundary-'))
  roots.push(root)
  const watchCase = buildCases(root, { includeLocalOnly: true }).find(item => item.name === 'mpx-tailwindcss-v4')!
  const mutation = watchCase.subPackageMutations!.find(item => item.root === 'sub-normal')!
  const entry = mutation.globalStyleCandidates.find(file => !file.includes('*'))!
  const imported = path.join(path.dirname(entry), 'styles', 'fixture.wxss')
  const originals = new Map([[mutation.templateMutation.sourceFile, '<view/>'], [mutation.styleMutation.sourceFile, '.source{}']])
  for (const [file, contents] of [...originals, [mutation.outputJs, 'self.webpackChunk.push([]); /* style-carrier-marker */'], [entry, '@import "./styles/fixture.wxss";'], [imported, css]] as Array<[string, string]>) {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, contents)
  }
  vi.spyOn(shared, 'waitForOutputsReady').mockResolvedValue(0)
  vi.spyOn(session, 'sleep').mockResolvedValue(undefined)
  const expected = createCssClassSignatureReader('.fixture-rule{font-size:23px}')('fixture-rule')
  const semantic = async (files: string[]) => {
    const actual = createCssClassSignatureReader(await shared.readJoinedOutputFiles(files))('fixture-rule')
    expect(actual).toEqual(expected)
    expect(files).toEqual(mutation.globalStyleCandidates)
  }
  const template = vi.spyOn(classes, 'runClassMutation').mockImplementation(async (...args) => {
    await semantic(args[6])
    return { rounds: [{ escapedClasses: ['fixture-rule'] }], verifiedGlobalStyleEscapedClasses: ['fixture-rule'], hotUpdateEffectiveMs: 1 } as Awaited<ReturnType<typeof classes.runClassMutation>>
  })
  const main = vi.spyOn(mainStyle, 'runMainStyleHotUpdate').mockImplementation(async (...args) => {
    await semantic(args[6])
    return { hotUpdateEffectiveMs: 1 } as Awaited<ReturnType<typeof mainStyle.runMainStyleHotUpdate>>
  })
  const marker = vi.spyOn(style, 'runStyleMutation').mockImplementation(async (...args) => {
    expect(args[5]).toContain(mutation.outputJs)
    expect(await readFile(mutation.outputJs, 'utf8')).toContain('style-carrier-marker')
    return { hotUpdateEffectiveMs: 1 } as Awaited<ReturnType<typeof style.runStyleMutation>>
  })
  const options = { pollMs: 1 } as CliOptions
  const operation = runSubPackageMutation(watchCase, options, { ensureRunning: vi.fn() } as unknown as WatchSession, mutation, originals)
  if (!valid) {
    await expect(operation).rejects.toThrow()
    expect(main).not.toHaveBeenCalled()
    expect(marker).not.toHaveBeenCalled()
    return
  }
  await expect(operation).resolves.toMatchObject({ globalStyleOutputs: mutation.globalStyleCandidates })
  expect(template).toHaveBeenCalledOnce()
  expect(main).toHaveBeenCalledOnce()
  expect(marker).toHaveBeenCalledOnce()
})
