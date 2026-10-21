import type { HBuilderXCommandResult } from '../packages/hbuilderx-runner/src'
import type { MiniProgramCase } from './hbuilderx-local/cases'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { HBuilderXCommandError } from '../packages/hbuilderx-runner/src'
import { compileMiniProgramWithHBuilderX } from './hbuilderx-local/mini-compile'
import { assertMiniProgramOutput } from './hbuilderx-local/mini-output'
import { projectOutputAncestors, projectOutputRoot } from './hbuilderx-local/output-ownership'
import { findEnvironmentBlock } from './tailwind-capabilities/environment-block'

const mocks = vi.hoisted(() => ({ createRunner: vi.fn(), alias: vi.fn() }))
vi.mock('./hbuilderx-local/process', async original => ({ ...await original<typeof import('./hbuilderx-local/process')>(), createLocalHBuilderXRunner: mocks.createRunner, hbuilderxTimeoutMs: 30, pollIntervalMs: 1 }))
vi.mock('../scripts/hbuilderx-project-alias.mjs', () => ({ createHBuilderXProjectAlias: mocks.alias }))
const directories: string[] = []
afterEach(async () => {
  vi.clearAllMocks()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'hx-mini-compile-'))
  directories.push(root)
  const project = path.join(root, 'project')
  const item: MiniProgramCase = { name: 'mini', platform: 'mp-weixin', projectDir: project, outputDir: 'unpackage/dist/dev/mp-weixin', outputDirCandidates: ['unpackage/dist/dev/mp-weixin', 'dist/dev/mp-weixin'], requiredFiles: ['app.json', 'app.js', 'app.wxss'], cssExtensions: ['.wxss'], cssContains: ['.probe'], workflow: { staticTemplateClass: true, dynamicClassBinding: false, userAuthoredStyle: false, thirdPartyOrExternalComponentStyle: false, subpackageStyle: false, webHmr: false } }
  const outputRoot = path.join(project, item.outputDirCandidates![1]!)
  const emit = async (output = outputRoot, css = '.probe{color:red}') => {
    await mkdir(output, { recursive: true })
    await Promise.all(Object.entries({ 'app.json': '{}', 'app.js': '// mini', 'app.wxss': css }).map(([name, text]) => writeFile(path.join(output, name), text)))
  }
  const cleanup = vi.fn(async () => {})
  mocks.alias.mockResolvedValue({ projectName: 'owned-alias', projectPath: path.join(root, 'alias'), cleanup })
  const resolution = { path: 'hbuilderx-cli', isRunning: true, source: 'env' as const, channel: 'alpha' as const, host: 'actual-host', version: 'actual-version' }
  const result = (args: string[]) => ({ command: resolution.path, args: [...args, '--host', resolution.host], cwd: project, exit: { code: 0, signal: null }, logs: [], output: '', issue: { kind: 'unknown' as const, message: 'ok' } })
  const run = vi.fn(async ({ args }: { args: string[] }): Promise<HBuilderXCommandResult> => {
    if (args[0] === 'launch') {
      await emit()
    }
    return result(args)
  })
  mocks.createRunner.mockResolvedValue({ resolution, run })
  return { root, project, item, outputRoot, emit, cleanup, resolution, result, run }
}

it('返回第二候选的已验根和实际host命令，关闭确认后才交付', async () => {
  const f = await fixture()
  let release!: () => void
  let entered!: () => void
  const enteredClose = new Promise<void>((resolve) => {
    entered = resolve
  })
  const closing = new Promise<void>((resolve) => {
    release = resolve
  })
  const original = f.run.getMockImplementation()!
  f.run.mockImplementation(async (options) => {
    if (options.args[1] === 'close') {
      entered()
      await closing
    }
    return original(options)
  })
  let settled = false
  const pending = compileMiniProgramWithHBuilderX(f.item, f.root).finally(() => {
    settled = true
  })
  await enteredClose
  expect(settled).toBe(false)
  expect(f.cleanup).not.toHaveBeenCalled()
  release()
  const observed = await pending
  expect(observed.outputRoot).toBe(f.outputRoot)
  expect(observed.resolution).toEqual(f.resolution)
  expect(observed.commands.map(command => command.args.slice(-2))).toEqual(Array.from({ length: 3 }, () => ['--host', 'actual-host']))
  expect(f.cleanup).toHaveBeenCalledOnce()
})

it.each(['open', 'close'])('退出零但%s明确携带host冲突时阻断，保留别名', async (stage) => {
  const f = await fixture()
  const original = f.run.getMockImplementation()!
  f.run.mockImplementation(async (options) => {
    const result = await original(options)
    return options.args[1] === stage ? { ...result, issue: { kind: 'cli-instance-mismatch', message: 'wrong host' } } : result
  })
  const error = await compileMiniProgramWithHBuilderX(f.item, f.root).catch(error => error)
  expect(findEnvironmentBlock(error)).toBeDefined()
  if (stage === 'close') {
    expect(String(error)).toContain('保留别名')
    expect(f.cleanup).not.toHaveBeenCalled()
  }
  else {
    expect(f.run.mock.calls.some(([options]) => options.args[0] === 'launch')).toBe(false)
  }
})

it('编译超时与关闭失败保留两个结构化原异常，不交付成功根', async () => {
  const f = await fixture()
  const command = { ...f.result(['launch']), issue: { kind: 'timeout' as const, message: 'timeout' } }
  const primary = new HBuilderXCommandError('deadline', command)
  const close = new Error('close unconfirmed')
  f.run.mockImplementation(async ({ args }) => {
    if (args[0] === 'launch') {
      throw primary
    }
    if (args[1] === 'close') {
      throw close
    }
    return f.result(args)
  })
  const error = await compileMiniProgramWithHBuilderX(f.item, f.root).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors[0].cause).toBe(primary)
  expect(error.errors[1].cause.cause).toBe(close)
  expect(f.cleanup).not.toHaveBeenCalled()
})

it('普通编译失败仍failed，完整错误结果不丢失', async () => {
  const f = await fixture()
  const primary = new HBuilderXCommandError('bad source', { ...f.result(['launch']), exit: { code: 1, signal: null }, issue: { kind: 'config-load-failed', message: 'bad config' } })
  f.run.mockImplementation(async ({ args }) => {
    if (args[0] === 'launch') {
      throw primary
    }
    return f.result(args)
  })
  const error = await compileMiniProgramWithHBuilderX(f.item, f.root).catch(error => error)
  expect(error).toBe(primary)
  expect(findEnvironmentBlock(error)).toBeUndefined()
  expect(f.cleanup).toHaveBeenCalledOnce()
})

it('首个完整候选样式错误不能择优选择另一个可过候选', async () => {
  const f = await fixture()
  await f.emit(path.join(f.project, f.item.outputDir), '.wrong{color:blue}')
  await f.emit()
  await expect(assertMiniProgramOutput(f.item, f.root)).rejects.toThrow('.probe')
})

it('删除前检查全部输出候选，不能穿越链接或先删除有效目录', async () => {
  const f = await fixture()
  await f.emit()
  f.item.outputDirCandidates!.push('..')
  await expect(compileMiniProgramWithHBuilderX(f.item, f.root)).rejects.toThrow('独立目录')
  expect(await readFile(path.join(f.outputRoot, 'app.wxss'), 'utf8')).toContain('.probe')
  f.item.outputDirCandidates = ['linked/output']
  const outside = path.join(f.root, 'outside')
  await mkdir(outside)
  await symlink(outside, path.join(f.project, 'linked'), 'junction')
  await expect(compileMiniProgramWithHBuilderX(f.item, f.root)).rejects.toThrow('符号链接')
  expect(mocks.createRunner).not.toHaveBeenCalled()
})

it.each([
  [path.posix, '/repo/project', 'dist/dev', '/repo/project/dist/dev'],
  [path.win32, 'C:\\repo\\project', 'dist\\dev', 'C:\\repo\\project\\dist\\dev'],
] as const)('项目输出边界支持平台路径 %#', (paths, project, output, expected) => {
  expect(projectOutputRoot(project, output, paths)).toBe(expected)
  for (const invalid of ['.', '..', paths.parse(project).root]) {
    expect(() => projectOutputRoot(project, invalid, paths)).toThrow('独立目录')
  }
})

it('Windows项目根大小写差异不会让祖先检查走到盘符根自循环', () => {
  expect(projectOutputAncestors('C:\\Project', 'c:\\project\\dist\\dev', path.win32)).toEqual(['c:\\project\\dist\\dev', 'c:\\project\\dist'])
  expect(() => projectOutputRoot('C:\\Project', 'D:\\other', path.win32)).toThrow('独立目录')
})
