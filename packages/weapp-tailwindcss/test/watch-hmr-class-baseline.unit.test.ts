import type {
  ClassMutationConfig,
  CliOptions,
  WatchCase,
  WatchSession,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runClassMutation, waitForClassMutationBaselineOutputs } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class'

function createOptions(): CliOptions {
  return {
    caseName: 'all',
    timeoutMs: 1000,
    pollMs: 10,
    skipBuild: true,
    quietSass: true,
    webOnly: false,
    miniProgramOnly: false,
    styleOnly: false,
    mainStyleOnly: false,
  }
}

describe('watch-hmr class baseline', () => {
  let tempDir = ''

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('空轮次配置在等待产物或改写源文件前失败', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-empty-rounds-'))
    const sourceFile = path.join(tempDir, 'content.ts')
    const original = 'export const classes = "text-red-500"'
    await writeFile(sourceFile, original, 'utf8')
    const mutate = vi.fn((source: string) => source)
    const mutation: ClassMutationConfig = {
      sourceFile,
      verifyEscapedIn: ['js'],
      roundConfigs: [],
      mutate,
    }
    const session = {
      ensureRunning: vi.fn(() => {
        throw new Error('空轮次不应启动产物等待')
      }),
    } as unknown as WatchSession
    const watchCase = {
      name: 'uni-app-vite-tailwindcss-v4',
      label: '空轮次 content',
      outputWxml: path.join(tempDir, 'missing.wxml'),
      outputJs: path.join(tempDir, 'missing.js'),
    } as WatchCase

    const result = runClassMutation(watchCase, createOptions(), session, 'content', mutation, original, [])
    await expect(result).rejects.toThrow('no mutation rounds configured')
    expect(session.ensureRunning).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
    await expect(readFile(sourceFile, 'utf8')).resolves.toBe(original)
  })

  it('waits for temporarily empty baseline outputs before mutating content', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-class-baseline-'))
    const outputWxml = path.join(tempDir, 'index.wxml')
    const outputJs = path.join(tempDir, 'index.js')
    const outputStyle = path.join(tempDir, 'app.wxss')

    await Promise.all([
      writeFile(outputWxml, '', 'utf8'),
      writeFile(outputJs, '', 'utf8'),
      writeFile(outputStyle, '.ready{}', 'utf8'),
    ])

    const session: WatchSession = {
      child: {} as WatchSession['child'],
      ensureRunning: vi.fn(),
      lastCompileSuccessAt: vi.fn(() => 0),
      logs: vi.fn(() => ''),
      stop: vi.fn(async () => {}),
    }
    const watchCase = {
      label: 'demo/uni-app-vite-tailwindcss-v4',
      outputWxml,
      outputJs,
    } as WatchCase

    const refillOutputs = async () => {
      await Promise.all([
        writeFile(outputWxml, '<view class="ready"></view>', 'utf8'),
        writeFile(outputJs, 'export default {}', 'utf8'),
      ])
    }
    setTimeout(() => {
      void refillOutputs()
    }, 30)

    const outputs = await waitForClassMutationBaselineOutputs(
      watchCase,
      createOptions(),
      session,
      'content',
      [outputStyle],
    )

    expect(outputs.wxml).toContain('ready')
    expect(outputs.js).toContain('export default')
    expect(outputs.globalStyle).toContain('.ready')
    expect(session.ensureRunning).toHaveBeenCalled()
  })

  it('accepts an existing empty global style output as a class mutation baseline', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-class-empty-style-'))
    const outputWxml = path.join(tempDir, 'index.wxml')
    const outputJs = path.join(tempDir, 'index.js')
    const outputStyle = path.join(tempDir, 'app.wxss')

    await Promise.all([
      writeFile(outputWxml, '<view class="ready"></view>', 'utf8'),
      writeFile(outputJs, 'export default {}', 'utf8'),
      writeFile(outputStyle, '', 'utf8'),
    ])

    const session: WatchSession = {
      child: {} as WatchSession['child'],
      ensureRunning: vi.fn(),
      lastCompileSuccessAt: vi.fn(() => 0),
      logs: vi.fn(() => ''),
      stop: vi.fn(async () => {}),
    }
    const watchCase = {
      label: 'demo/weapp-vite-tailwindcss-v4',
      outputWxml,
      outputJs,
    } as WatchCase

    const outputs = await waitForClassMutationBaselineOutputs(
      watchCase,
      createOptions(),
      session,
      'script',
      [outputStyle],
    )

    expect(outputs.wxml).toContain('ready')
    expect(outputs.js).toContain('export default')
    expect(outputs.globalStyle).toBe('')
  })
})
