import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { parseBuildArgs } from '../src/build/args'
import { isBuildOutput, resolveFilePath, validateBuildPaths } from '../src/build/paths'
import { createCliFixture, runCliFailure } from './parity-harness'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})
it.each(['input.css', 'out.css', './nested/../input.css'])('拒绝 map 产物冲突：%s', async (map) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-paths-'))
  roots.push(cwd)
  await fs.writeFile(path.join(cwd, 'input.css'), '.flex{}')
  expect(() => parseBuildArgs(['--cwd', cwd, '-i', 'input.css', '-o', 'out.css', `--map=${map}`])).toThrow(/identical|conflict/i)
})

it.each([
  [path.posix, '/project', './nested/../input.css', '/project/input.css'],
  [path.posix, '/', '/input.css', '/input.css'],
  [path.win32, 'C:\\project', '.\\nested\\..\\input.css', 'C:\\project\\input.css'],
  [path.win32, 'C:\\project', '\\input.css', 'C:\\input.css'],
  [path.win32, 'C:\\project', 'D:\\input.css', 'D:\\input.css'],
])('按平台路径语义解析 %s %s %s', (paths, cwd, file, expected) => {
  expect(resolveFilePath(file, cwd, paths)).toBe(expected)
})

it('识别目录符号链接下尚未创建的相同输出', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-path-alias-'))
  roots.push(root)
  const real = path.join(root, 'real')
  const alias = path.join(root, 'alias')
  await fs.mkdir(real)
  await fs.symlink(real, alias, process.platform === 'win32' ? 'junction' : 'dir')
  const output = path.join(real, 'new', 'out.css')
  const map = path.join(alias, 'new', 'out.css')
  expect(() => validateBuildPaths({ output, map })).toThrow(/identical/)
  expect(isBuildOutput(map, [output])).toBe(true)
})

it('识别已有硬链接指向同一输入', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-path-inode-'))
  roots.push(root)
  const input = path.join(root, 'input.css')
  const map = path.join(root, 'map.json')
  await fs.writeFile(input, '.flex{}')
  await fs.link(input, map)
  expect(() => validateBuildPaths({ input, map })).toThrow(/identical/)
})

it.each(['input.css', 'out.css'])('真实 CLI 在写入前拒绝冲突 %s 且保留文件', async (map) => {
  const original = '@import "tailwindcss";'
  const project = await createCliFixture({ 'input.css': original, 'out.css': 'previous output' })
  roots.push(project.root)
  const failure = await runCliFailure(project.root, ['-i', 'input.css', '-o', 'out.css', `--map=${map}`, '--silent'])
  expect(failure.code).toBeGreaterThan(0)
  expect(failure.stderr).toContain('identical')
  expect(await project.read('input.css')).toBe(original)
  expect(await project.read('out.css')).toBe('previous output')
})
