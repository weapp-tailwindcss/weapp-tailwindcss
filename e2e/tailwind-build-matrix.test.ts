import type { BuildOutputCase } from './multiplatform-build-output/types'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createLocalTargetCase } from './multiplatform-build-output/helpers'
import { buildMatrixContracts, executeBuildMatrixCase } from './tailwind-capabilities/build-matrix/cases'
import { buildMatrixVersions } from './tailwind-capabilities/build-matrix/versions'
import configuration from './tailwind-capabilities/build-matrix/vitest.config'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function context() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tailwind-matrix-test-'))
  directories.push(root)
  const directory = path.join(root, 'artifacts')
  await mkdir(directory)
  return { root, directory, runId: 'matrix-test' }
}

const executable: BuildOutputCase = {
  name: 'fixture mp-weixin',
  framework: 'uni-app',
  projectDir: 'fixture',
  platform: 'mp-weixin',
  command: ['pnpm', 'build'],
  outputDir: 'dist',
  requiredFiles: ['dist/app.json'],
  styleFiles: ['dist'],
  styleFileExtensions: ['.wxss'],
  styleContains: ['.probe'],
  status: 'ci',
}

describe('逐项目构建证据', () => {
  it('每个项目记录实际安装的构建器版本，不记录 package.json 依赖范围', async () => {
    const ctx = await context()
    const project = path.join(ctx.root, 'fixture')
    const installed = path.join(project, 'node_modules', 'vite')
    await mkdir(installed, { recursive: true })
    await writeFile(path.join(project, 'package.json'), JSON.stringify({ devDependencies: { vite: '^7.0.0' } }))
    await writeFile(path.join(installed, 'package.json'), JSON.stringify({ name: 'vite', version: '7.2.3' }))
    expect(await buildMatrixVersions(ctx.root, [executable])).toEqual({ 'fixture:vite': '7.2.3' })
  })
  it('专用执行配置仅收集矩阵，不能合并父配置后启动全仓测试', () => {
    expect(configuration.test?.include).toEqual(['e2e/tailwind-capabilities/build-matrix/run.test.ts'])
    expect(configuration.test?.update).toBe('none')
    expect(configuration.test?.maxWorkers).toBe(1)
  })
  it('登记占位条目保留未执行，不能调用空构建后判通过', async () => {
    const selected = createLocalTargetCase({ name: 'unavailable', framework: 'taro', projectDir: 'demo/fixture', platform: 'qq', reason: '目标 runner 尚未接入' })
    let called = false
    const observed = await executeBuildMatrixCase(await context(), selected, async () => {
      called = true
    })
    expect(called).toBe(false)
    expect(observed.result.status).toBe('not-run')
    expect(observed.result.reason).toContain('目标 runner 尚未接入')
    expect(observed.result.artifacts).toEqual([])
  })

  it('只有完整断言和本轮真实样式产物归档后通过，后续构建不能覆盖证据', async () => {
    const ctx = await context()
    const output = path.join(ctx.root, 'fixture', 'dist')
    const observed = await executeBuildMatrixCase(ctx, executable, async () => {
      await mkdir(output, { recursive: true })
      await writeFile(path.join(output, 'app.json'), '{}')
      await writeFile(path.join(output, 'app.wxss'), '.probe{color:red}')
    })
    expect(observed.result.status).toBe('passed')
    expect(observed.artifacts.some(item => item.kind === 'css')).toBe(true)
    const archived = observed.artifacts.find(item => item.kind === 'css')!
    await writeFile(path.join(output, 'app.wxss'), '.probe{color:blue}')
    expect(await readFile(path.resolve(ctx.directory, archived.path), 'utf8')).toContain('color:red')
  })

  it('构建断言失败不能由旧产物或退出码遮蔽', async () => {
    const ctx = await context()
    const output = path.join(ctx.root, 'fixture', 'dist')
    await mkdir(output, { recursive: true })
    await writeFile(path.join(output, 'app.wxss'), '.probe{color:red}')
    const observed = await executeBuildMatrixCase(ctx, executable, async () => {
      throw new Error('声明丢失')
    })
    expect(observed.result.status).toBe('failed')
    expect(observed.result.reason).toContain('声明丢失')
    expect(observed.artifacts.every(item => item.kind === 'log')).toBe(true)
  })

  it('空输出或仅 package.json 不能充当真实样式证据', async () => {
    const ctx = await context()
    const output = path.join(ctx.root, 'fixture', 'dist')
    await mkdir(output, { recursive: true })
    await writeFile(path.join(output, 'package.json'), '{}')
    const observed = await executeBuildMatrixCase(ctx, executable, async () => {})
    expect(observed.result.status).toBe('failed')
    expect(observed.result.reason).toMatch(/样式/)
  })

  it('分包不同模式保持独立 ID，夹具 hash 包含正则源和配置', () => {
    const a = { ...executable, name: 'isolated', env: { MODE: 'isolated' }, styleContains: [/color\s*:\s*red/i] }
    const b = { ...executable, name: 'single', env: { MODE: 'single' }, styleContains: [/color\s*:\s*blue/i] }
    const [first, second] = buildMatrixContracts([a, b])
    expect(first!.id).not.toBe(second!.id)
    expect(first!.fixture).toContain('color\\\\s*')
    expect(first!.fixture).not.toBe(second!.fixture)
    expect(first!.expectation.stage).toBe('encoding')
  })
})
