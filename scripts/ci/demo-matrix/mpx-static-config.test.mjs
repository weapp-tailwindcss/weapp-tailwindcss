import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { compileFunction } from 'node:vm'
import { afterEach, expect, it, vi } from 'vitest'
import { repo } from './catalog.mjs'

const projectRequire = createRequire(path.join(repo, 'demo', 'mpx-tailwindcss-v4', 'package.json'))
const pluginRequire = createRequire(projectRequire.resolve('@mpxjs/vue-cli-plugin-mpx/package.json'))
const moduleFile = pluginRequire.resolve('./utils/symlink')
const directories = []

// 直接执行安装产物，确保遗漏 pnpm patch 或安装旧依赖时回归会失败。
function load(overrides) {
  const module = { exports: {} }
  const localRequire = createRequire(moduleFile)
  compileFunction(fs.readFileSync(moduleFile, 'utf8'), ['require', 'module', 'exports'], { filename: moduleFile })(
    id => overrides[id] ?? localRequire(id),
    module,
    module.exports,
  )
  return module.exports.symlinkTargetConfig
}

function fixture({ mode = 'wx', name = 'project.config.json', plugin } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mpx-static-config-'))
  directories.push(directory)
  const source = path.join(directory, 'static', mode, name)
  const outputPath = path.join(directory, 'dist', mode)
  const output = path.join(plugin ? path.dirname(outputPath) : outputPath, name)
  fs.mkdirSync(path.dirname(source), { recursive: true })
  fs.mkdirSync(outputPath, { recursive: true })
  fs.writeFileSync(source, '{"appid":"initial"}')
  const filesystem = {
    ...fs,
    lstatSync: vi.fn(fs.lstatSync),
    unlinkSync: vi.fn(fs.unlinkSync),
    linkSync: vi.fn(fs.linkSync),
    copyFileSync: vi.fn(fs.copyFileSync),
  }
  const symlinkTargetConfig = load({ fs: filesystem })
  return {
    source,
    output,
    filesystem,
    run: () => symlinkTargetConfig({
      resolve: file => path.resolve(directory, file),
      hasPlugin: name => name === plugin,
    }, { mode }, { output: { path: outputPath } }),
    clearCalls() {
      for (const key of ['lstatSync', 'unlinkSync', 'linkSync', 'copyFileSync']) {
        filesystem[key].mockClear()
      }
    },
  }
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it.each([
  ['wx', 'project.config.json'],
  ['ali', 'mini.project.json'],
  ['swan', 'project.swan.json'],
  ['qq', 'project.config.json'],
  ['tt', 'project.config.json'],
  ['dd', 'project.config.json'],
  ['ks', 'project.config.json'],
])('%s 首轮创建硬链接，连续编译保留 inode 和 ctime', (mode, name) => {
  const context = fixture({ mode, name })
  context.run()
  const sourceStat = fs.lstatSync(context.source)
  const outputStat = fs.lstatSync(context.output)
  expect(sourceStat.ino).not.toBe(0)
  expect([outputStat.dev, outputStat.ino]).toEqual([sourceStat.dev, sourceStat.ino])
  expect(context.filesystem.linkSync).toHaveBeenCalledExactlyOnceWith(context.source, context.output)
  context.clearCalls()
  context.run()
  context.run()
  expect(context.filesystem.unlinkSync).not.toHaveBeenCalled()
  expect(context.filesystem.linkSync).not.toHaveBeenCalled()
  expect(context.filesystem.copyFileSync).not.toHaveBeenCalled()
  expect(fs.lstatSync(context.source).ctimeMs).toBe(sourceStat.ctimeMs)
})

it.each(['wx', 'ali'].flatMap(mode => ['mpx-cloud-func', 'mpx-plugin-mode'].map(plugin => [mode, plugin])))('%s 的 %s 仍链接到父输出目录', (mode, plugin) => {
  const context = fixture({ mode, plugin, name: mode === 'ali' ? 'mini.project.json' : 'project.config.json' })
  context.run()
  expect(context.filesystem.linkSync).toHaveBeenCalledExactlyOnceWith(context.source, context.output)
  context.clearCalls()
  context.run()
  expect(context.filesystem.linkSync).not.toHaveBeenCalled()
})

it('保留 IDE 对输出配置的原位修改同步', () => {
  const context = fixture()
  context.run()
  context.run()
  fs.writeFileSync(context.output, '{"appid":"from-ide"}')
  expect(fs.readFileSync(context.source, 'utf8')).toBe('{"appid":"from-ide"}')
  context.clearCalls()
  context.run()
  expect(context.filesystem.linkSync).not.toHaveBeenCalled()
})

it('来源原子替换后重新链接到新 inode', () => {
  const context = fixture()
  context.run()
  const replacement = path.join(path.dirname(context.source), 'replacement.json')
  fs.writeFileSync(replacement, '{"appid":"replacement"}')
  fs.renameSync(replacement, context.source)
  expect(fs.lstatSync(context.output).ino).not.toBe(fs.lstatSync(context.source).ino)
  context.clearCalls()
  context.run()
  expect(context.filesystem.unlinkSync).toHaveBeenCalledExactlyOnceWith(context.output)
  expect(context.filesystem.linkSync).toHaveBeenCalledExactlyOnceWith(context.source, context.output)
  expect(fs.readFileSync(context.output, 'utf8')).toBe('{"appid":"replacement"}')
  expect(fs.lstatSync(context.output).ino).toBe(fs.lstatSync(context.source).ino)
})

it('相同内容的独立输出文件仍须替换成硬链接', () => {
  const context = fixture()
  fs.copyFileSync(context.source, context.output)
  expect(fs.lstatSync(context.output).ino).not.toBe(fs.lstatSync(context.source).ino)
  context.run()
  expect(context.filesystem.unlinkSync).toHaveBeenCalledExactlyOnceWith(context.output)
  expect(context.filesystem.linkSync).toHaveBeenCalledExactlyOnceWith(context.source, context.output)
})

it.each(['EXDEV', 'EPERM'])('创建链接失败 %s 时保留复制回退', (code) => {
  const context = fixture()
  context.filesystem.linkSync.mockImplementation(() => {
    throw Object.assign(new Error(code), { code })
  })
  context.run()
  expect(context.filesystem.copyFileSync).toHaveBeenCalledExactlyOnceWith(context.source, context.output)
  expect(fs.readFileSync(context.output, 'utf8')).toBe(fs.readFileSync(context.source, 'utf8'))
  expect(fs.lstatSync(context.output).ino).not.toBe(fs.lstatSync(context.source).ino)
})

it.each(['zero-inode', 'different-device', 'source-symlink', 'output-symlink', 'rounded-inodes'])('元数据为 %s 时不误判为正规硬链接', (kind) => {
  const context = fixture()
  context.run()
  context.clearCalls()
  context.filesystem.lstatSync.mockImplementation((file, options) => {
    expect(options).toEqual({ bigint: true })
    const stat = fs.lstatSync(file, options)
    return {
      ino: kind === 'zero-inode' ? 0n : kind === 'rounded-inodes' ? (file === context.source ? 9007199254740992n : 9007199254740993n) : stat.ino,
      dev: kind === 'different-device' && file === context.output ? stat.dev + 1n : stat.dev,
      isFile: () => !(kind === 'source-symlink' && file === context.source) && !(kind === 'output-symlink' && file === context.output),
    }
  })
  context.run()
  expect(context.filesystem.unlinkSync).toHaveBeenCalledExactlyOnceWith(context.output)
  expect(context.filesystem.linkSync).toHaveBeenCalledExactlyOnceWith(context.source, context.output)
})

it.each([
  [path.posix, '/project', '/project/dist/wx'],
  [path.posix, '/', 'dist/wx'],
  [path.win32, 'C:\\project', 'C:\\project\\dist\\wx'],
  [path.win32, 'C:\\', 'dist\\wx'],
  [path.win32, '\\\\server\\project', '\\\\server\\project\\dist\\wx'],
])('不同路径语义下使用 API 来源与 bundler 输出路径：%s %s %s', (pathApi, root, outputPath) => {
  const source = pathApi.resolve(root, 'static', 'wx', 'project.config.json')
  const output = pathApi.resolve(outputPath, 'project.config.json')
  const filesystem = {
    existsSync: vi.fn(() => true),
    lstatSync: vi.fn(() => ({ ino: 42n, dev: 1n, isFile: () => true })),
    unlinkSync: vi.fn(),
    linkSync: vi.fn(),
    copyFileSync: vi.fn(),
  }
  load({ fs: filesystem, path: pathApi })({
    resolve: file => pathApi.resolve(root, file),
    hasPlugin: () => false,
  }, { mode: 'wx' }, { output: { path: outputPath } })
  expect(filesystem.lstatSync.mock.calls).toEqual([[source, { bigint: true }], [output, { bigint: true }]])
  expect(filesystem.unlinkSync).not.toHaveBeenCalled()
  expect(filesystem.linkSync).not.toHaveBeenCalled()
  expect(filesystem.copyFileSync).not.toHaveBeenCalled()
})
