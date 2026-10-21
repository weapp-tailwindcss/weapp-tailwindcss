import type { BuildMatrixCase } from './tailwind-capabilities/build-matrix/providers'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { miniProgramCases } from './hbuilderx-local/cases'
import { MULTIPLATFORM_BUILD_OUTPUT_CASES } from './multiplatform-build-output/cases'
import { isMiniProgramTarget } from './multiplatform-build-output/helpers'
import { buildMatrixContracts, executeBuildMatrixCase } from './tailwind-capabilities/build-matrix/cases'
import { buildMatrixFixtures, resolveBuildMatrixCases, selectBuildMatrixCases, verifyMatrixProvider } from './tailwind-capabilities/build-matrix/providers'
import { BuildMatrixSchedule } from './tailwind-capabilities/build-matrix/schedule'
import { EnvironmentBlockedError } from './tailwind-capabilities/environment-block'
import { digest } from './tailwind-capabilities/identity'
import { stageName } from './tailwind-capabilities/plan'
import { createStageBinding, readStageReceipt, runStageProducer, stageBindingVariable } from './tailwind-capabilities/stage-receipt'

const mocks = vi.hoisted(() => ({ compile: vi.fn() }))
vi.mock('./hbuilderx-local/mini-compile', () => ({ compileMiniProgramWithHBuilderX: mocks.compile }))
const directories: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

const source = MULTIPLATFORM_BUILD_OUTPUT_CASES.filter(isMiniProgramTarget)
const resolved = resolveBuildMatrixCases(source)

async function context() {
  const root = await mkdtemp(path.join(tmpdir(), 'hx-matrix-provider-'))
  directories.push(root)
  return { root, directory: path.join(root, 'artifacts'), runId: 'current-run' }
}

it('保留59个真实CLI入口，接通5个已有IDE夹具，不执行占位命令', () => {
  expect(source).toHaveLength(60)
  expect(resolved).toHaveLength(64)
  expect(resolved.filter(item => item.provider?.kind === 'command')).toHaveLength(59)
  expect(resolved.filter(item => item.provider?.kind === 'hbuilderx-mini')).toHaveLength(5)
  const hxProject = 'demo/uni-app-vite-vue3-hbuilderx-tailwindcss-v4'
  expect(resolved.filter(item => item.projectDir === hxProject && item.platform === 'mp-weixin').map(item => item.provider?.kind)).toEqual(['command', 'hbuilderx-mini'])
  expect(resolved.find(item => item.framework === 'uni-app-x' && item.platform === 'mp-weixin')?.provider?.kind).toBe('hbuilderx-mini')
  expect(stageName('mini-builds')).toContain('HBuilderX')
})

it('完整解析后再过滤，不引入未选IDE项目或其它平台', () => {
  expect(selectBuildMatrixCases(resolved, '^taro').every(item => item.framework === 'taro')).toBe(true)
  const selected = selectBuildMatrixCases(resolved, '^uni-app-x-vdom-tailwindcss-v4 \\[HBuilderX IDE\\]$')
  expect(selected).toHaveLength(1)
  expect(selected[0]!.platform).toBe('mp-weixin')
  expect(selectBuildMatrixCases(resolved, undefined, 'ci').some(item => item.provider?.kind === 'hbuilderx-mini')).toBe(false)
})

it('拒绝同名或同项目平台的歧义IDE夹具', () => {
  expect(() => resolveBuildMatrixCases(source, [miniProgramCases[0]!, miniProgramCases[0]!])).toThrow('不唯一')
})

it('IDE夹具身份不符时不调用宿主，不从其它项目借用编译产物', async () => {
  const item = resolved.find(item => item.provider?.kind === 'hbuilderx-mini')!
  await expect(verifyMatrixProvider({ ...item, projectDir: 'other-project' }, (await context()).root)).rejects.toThrow('身份不符')
  expect(mocks.compile).not.toHaveBeenCalled()
})

it('完整IDE夹具、provider及正则source/flags均改变报告使用的fixtureHash', () => {
  const fixture = miniProgramCases[0]!
  const changes = [
    { ...fixture, cssContains: [/color:red/] },
    { ...fixture, cssContains: [/color:blue/] },
    { ...fixture, cssContains: [/color:red/i] },
    { ...fixture, outputNotContains: { 'app.json': ['different'] } },
  ].map(item => resolveBuildMatrixCases(source, [item]))
  const definitions = changes.map(buildMatrixFixtures)
  expect(new Set(definitions.map(digest)).size).toBe(changes.length)
  const item = changes[0]!.find(item => item.provider?.kind === 'hbuilderx-mini')!
  expect(digest(buildMatrixFixtures([item]))).not.toBe(digest(buildMatrixFixtures([{ ...item, provider: { kind: 'command' } }])))
  expect(buildMatrixContracts([item])[0]!.fixture).toBe(buildMatrixFixtures([item])[0])
})

it('IDE完整输出通过后仍执行旧矩阵marker，不能因换provider丢失断言', async () => {
  const ctx = await context()
  const selected = resolved.find(item => item.projectDir === 'demo/uni-app-vite-vue3-hbuilderx-tailwindcss-v4' && item.platform === 'mp-weixin' && item.provider?.kind === 'hbuilderx-mini')!
  const project = path.join(ctx.root, selected.projectDir)
  const outputRoot = path.join(project, 'dist', 'dev', selected.platform)
  for (const file of selected.requiredFiles) {
    const relative = path.relative(selected.outputDir, file)
    const destination = path.join(outputRoot, relative)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, '{}')
  }
  await writeFile(path.join(outputRoot, 'app.wxss'), selected.styleContains.filter(item => item !== '.w-_b120px_B').map(item => `${item}{color:red}`).join('\n'))
  mocks.compile.mockResolvedValue({ outputRoot, provider: 'hbuilderx-mini', resolution: { host: 'actual' }, commands: [] })
  await expect(verifyMatrixProvider(selected, ctx.root)).rejects.toThrow('.w-_b120px_B')
  expect(mocks.compile).toHaveBeenCalledExactlyOnceWith(selected.provider && 'fixture' in selected.provider ? selected.provider.fixture : undefined, ctx.root)
})

it('环境异常写当前案例blocked和专属终态，后续provider零调用', async () => {
  const ctx = await context()
  const binding = createStageBinding(ctx, 'mini-builds')!
  expect(binding?.producer).toBe('mini-builds')
  vi.stubEnv(stageBindingVariable, JSON.stringify(binding))
  const schedule = new BuildMatrixSchedule()
  const primary = new EnvironmentBlockedError('actual HBuilderX host mismatch')
  const error = new AggregateError([primary, new Error('close failed')], 'cleanup', { cause: primary })
  const next = vi.fn(async () => {})
  const blocked = vi.fn()
  const selected = resolved[0]!
  await expect(schedule.execute(() => executeBuildMatrixCase(ctx, selected, async () => {
    throw error
  }, blocked))).rejects.toBe(error)
  expect(blocked.mock.calls[0]![0].result.status).toBe('blocked')
  const log = blocked.mock.calls[0]![0].artifacts[0]
  expect(await readFile(path.resolve(ctx.directory, log.path), 'utf8')).toContain('actual HBuilderX host mismatch')
  await schedule.execute(next)
  expect(next).not.toHaveBeenCalled()
  await expect(runStageProducer('mini-builds', async () => {
    throw schedule.blocked
  })).rejects.toBe(error)
  await expect(readStageReceipt(binding)).rejects.toThrow('actual HBuilderX host mismatch')
})

it('普通编译/断言错误保留failed，后续provider可执行，回执不能变为completed', async () => {
  const ctx = await context()
  const binding = createStageBinding(ctx, 'mini-builds')!
  vi.stubEnv(stageBindingVariable, JSON.stringify(binding))
  const schedule = new BuildMatrixSchedule()
  const item: BuildMatrixCase = resolved[0]!
  const observed = await schedule.execute(() => executeBuildMatrixCase(ctx, item, async () => {
    throw new Error('missing declaration')
  }))
  expect(observed!.result.status).toBe('failed')
  const next = vi.fn(async () => {})
  await schedule.execute(next)
  expect(next).toHaveBeenCalledOnce()
  await expect(runStageProducer('mini-builds', async () => {
    throw new Error(observed!.result.reason)
  })).rejects.toThrow('missing declaration')
  await expect(readStageReceipt(binding)).resolves.toBe('failed')
})

it('调用方超时放弃等待后，旧provider关闭前不能启动下一个宿主', async () => {
  const schedule = new BuildMatrixSchedule()
  let release!: () => void
  let entered!: () => void
  const ready = new Promise<void>((resolve) => {
    entered = resolve
  })
  const closing = new Promise<void>((resolve) => {
    release = resolve
  })
  const first = schedule.execute(async () => {
    entered()
    await closing
  })
  await ready
  const next = vi.fn(async () => {})
  const second = schedule.execute(next)
  await Promise.resolve()
  await Promise.resolve()
  const startedBeforeClose = next.mock.calls.length
  release()
  await Promise.all([first, second])
  expect(startedBeforeClose).toBe(0)
  expect(next).toHaveBeenCalledOnce()
})
