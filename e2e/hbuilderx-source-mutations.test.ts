import type { WebHmrStep } from './hbuilderx-local/cases'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parse } from '@vue/compiler-sfc'
import { afterEach, expect, it, vi } from 'vitest'
import { rewriteAppMarker } from './hbuilderx-local/app-marker'
import { createIssue1325NativeControlCase } from './hbuilderx-local/issue-1325'
import { appendHmrSourceMutation } from './hbuilderx-local/source-mutations'
import { rewriteHmrMarker } from './hbuilderx-local/web/source'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function createSource(source: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hbuilderx-source-mutations-'))
  directories.push(root)
  const file = path.join(root, 'page.uvue')
  await writeFile(file, source)
  return { root, file }
}

it('原生对照的一次保存同时替换颜色、增加作者 style 并更新 marker', async () => {
  const item = createIssue1325NativeControlCase()
  const original = await readFile(path.resolve(item.projectDir, item.sourceFile), 'utf8')
  const { root, file } = await createSource(original)
  const step = item.hmrSteps![0]!
  const writer = vi.fn(async (target: string, source: string) => {
    await writeFile(target, rewriteAppMarker(source, [item.markerAnchor], {
      className: step.markerClass,
      textClassName: step.markerTextClass,
      text: step.markerText,
      structureToken: 'combined-save',
    }))
  })
  await appendHmrSourceMutation(root, { ...step.sourceMutation!, file: path.basename(file) }, writer)

  const saved = await readFile(file, 'utf8')
  const parsed = parse(saved)
  expect(writer).toHaveBeenCalledTimes(1)
  expect(parsed.errors).toEqual([])
  expect(parsed.descriptor.styles).toHaveLength(2)
  expect(parsed.descriptor.styles[0]!.content).toContain('background-color: #9a3412')
  expect(parsed.descriptor.styles[1]!.content).toBe('.control-author { color: #111827; }')
  expect(saved).toContain('data-wt-runtime-token="combined-save"')
  expect(saved.match(/id="native-hmr-probe"/g)).toHaveLength(1)
  expect(saved).toMatchSnapshot()
})

it('已替换的中断状态仍补齐 append，并允许 marker 在一次保存中前进', async () => {
  const { root, file } = await createSource('<template><view>anchor</view></template>\n<style>.probe { width: 20px; }</style>\n')
  const mutation = {
    file: path.basename(file),
    replace: { from: 'width: 10px', to: 'width: 20px' },
    append: '<style>.author { height: 30px; }</style>',
  }
  let ordinal = 0
  const writer = vi.fn(async (target: string, source: string) => {
    await writeFile(target, rewriteAppMarker(source, ['<view>anchor'], {
      className: 'w-[10px]',
      text: `save-${++ordinal}`,
      structureToken: `save-${ordinal}`,
    }))
  })
  await appendHmrSourceMutation(root, mutation, writer)
  await appendHmrSourceMutation(root, mutation, writer)
  const saved = await readFile(file, 'utf8')
  expect(writer).toHaveBeenCalledTimes(2)
  expect(parse(saved).descriptor.styles).toHaveLength(2)
  expect(saved.match(/height: 30px/g)).toHaveLength(1)
  expect(saved).toContain('data-wt-runtime-token="save-2"')
})

it('替换目标缺失时不写入 append 半成品', async () => {
  const original = '<template><view /></template>'
  const { root, file } = await createSource(original)
  const writer = vi.fn(async (target: string, source: string) => writeFile(target, source))
  await expect(appendHmrSourceMutation(root, {
    file: path.basename(file),
    replace: { from: 'missing-from', to: 'missing-to' },
    append: '<style>.author { width: 20px; }</style>',
  }, writer)).rejects.toThrow('替换目标')
  expect(writer).not.toHaveBeenCalled()
  expect(await readFile(file, 'utf8')).toBe(original)
})

it('Web 同一 SFC 的 replace、append 与 marker 只保存一次', async () => {
  const { file } = await createSource('<template><view class="w-[10px]">anchor</view></template>\n')
  const step: WebHmrStep = {
    markerClass: 'w-[30px]',
    markerText: 'combined-web-save',
    cssContains: [],
    sourceMutation: {
      file: path.basename(file),
      replace: { from: 'w-[10px]', to: 'w-[20px]' },
      append: '<style>.author { height: 40px; }</style>',
    },
  }
  const writer = vi.fn(async (target: string, source: string) => writeFile(target, source))
  await rewriteHmrMarker(file, ['<view class="w-[20px]"'], [step], 0, step.sourceMutation, writer)
  const saved = await readFile(file, 'utf8')
  expect(writer).toHaveBeenCalledTimes(1)
  expect(saved).toContain('w-[20px]')
  expect(saved).toContain('combined-web-save')
  expect(saved.match(/hbuilderx-web-hmr-probe/g)).toHaveLength(1)
  expect(parse(saved).descriptor.styles.map(style => style.content)).toEqual(['.author { height: 40px; }'])
})
