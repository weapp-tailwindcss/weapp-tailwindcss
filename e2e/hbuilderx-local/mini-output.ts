import type { MiniProgramCase } from './cases'
import path from 'node:path'
import { expect } from 'vitest'
import { fileExists, hbuilderxTimeoutMs, pollIntervalMs, readUtf8, wait } from './process'
import { collectMiniProgramStyleFiles, readReachableMiniProgramStyles, resolveMiniProgramRuntimeStyleEntry } from './styles'

async function waitForFile(file: string, deadline: number) {
  while (Date.now() < deadline) {
    if (await fileExists(file)) {
      return true
    }
    await wait(pollIntervalMs)
  }
  return fileExists(file)
}

function expectContent(source: string, entries: Array<string | RegExp>, label: string) {
  for (const entry of entries) {
    if (typeof entry === 'string') {
      expect(source, `${label} 应包含 ${entry}`).toContain(entry)
    }
    else {
      expect(source, `${label} 应匹配 ${entry}`).toMatch(entry)
    }
  }
}

export async function assertMiniProgramOutput(
  item: MiniProgramCase,
  repoRoot: string,
  ensureRunning?: () => void,
  createFailureDetails?: () => string,
) {
  const projectRoot = path.resolve(repoRoot, item.projectDir)
  let outputRoot = path.resolve(projectRoot, item.outputDir)

  const deadline = Date.now() + hbuilderxTimeoutMs
  while (Date.now() < deadline) {
    ensureRunning?.()
    for (const outputDir of item.outputDirCandidates ?? [item.outputDir]) {
      const candidateRoot = path.resolve(projectRoot, outputDir)
      const ready = await Promise.all(item.requiredFiles.map(file => fileExists(path.resolve(candidateRoot, file))))
      if (ready.every(Boolean)) {
        outputRoot = candidateRoot
        break
      }
    }
    if ((await Promise.all(item.requiredFiles.map(file => fileExists(path.resolve(outputRoot, file))))).every(Boolean)) {
      break
    }
    await wait(pollIntervalMs)
  }

  for (const file of item.requiredFiles) {
    const target = path.resolve(outputRoot, file)
    expect(
      await waitForFile(target, deadline),
      `${item.name} 缺少产物 ${file}${createFailureDetails ? `\n${createFailureDetails()}` : ''}`,
    ).toBe(true)
  }

  const styleFiles = await collectMiniProgramStyleFiles(outputRoot, item.cssExtensions)
  expect(
    styleFiles.length,
    `${item.name} 缺少 ${item.cssExtensions.join('/')} 样式产物`,
  ).toBeGreaterThan(0)
  const runtimeStyleEntry = await resolveMiniProgramRuntimeStyleEntry(outputRoot, item.cssExtensions)
  expect(runtimeStyleEntry, `${item.name} 无法唯一识别小程序运行时根样式入口`).toBeTruthy()
  // 根入口需要沿导入链验证；分包样式由页面路由加载，不会出现在根入口的导入图中。
  const runtimeCss = await readReachableMiniProgramStyles(outputRoot, runtimeStyleEntry!, item.cssExtensions)
  expect(runtimeCss, `${item.name} 根样式入口不可读`).not.toBe('')
  const css = (await Promise.all(styleFiles.map(readUtf8))).join('\n')

  expectContent(css, item.cssContains, item.name)
  if (item.outputContains) {
    for (const [file, entries] of Object.entries(item.outputContains)) {
      const target = path.resolve(outputRoot, file)
      expect(await waitForFile(target, deadline), `${item.name} 缺少产物 ${file}`).toBe(true)
      expectContent(await readUtf8(target), entries, `${item.name} ${file}`)
    }
  }
  if (item.outputNotContains) {
    for (const [file, entries] of Object.entries(item.outputNotContains)) {
      const target = path.resolve(outputRoot, file)
      expect(await waitForFile(target, deadline), `${item.name} 缺少产物 ${file}`).toBe(true)
      const content = await readUtf8(target)
      for (const entry of entries) {
        if (typeof entry === 'string') {
          expect(content, `${item.name} ${file} 不应包含 ${entry}`).not.toContain(entry)
        }
        else {
          expect(content, `${item.name} ${file} 不应匹配 ${entry}`).not.toMatch(entry)
        }
      }
    }
  }
  if (item.cssNotContains) {
    for (const entry of item.cssNotContains) {
      if (typeof entry === 'string') {
        expect(css, `${item.name} 不应包含 ${entry}`).not.toContain(entry)
      }
      else {
        expect(css, `${item.name} 不应匹配 ${entry}`).not.toMatch(entry)
      }
    }
  }
  return { outputRoot, runtimeStyleEntry: runtimeStyleEntry!, styleFiles }
}
