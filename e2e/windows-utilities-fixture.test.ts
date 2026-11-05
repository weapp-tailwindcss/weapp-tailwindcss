import { cp, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { copyWindowsUtilitiesFixture, isFixtureOwnedPath, verifyWindowsUtilitiesFixtureIsolation } from '../scripts/ci/windows-utilities-fixture.mjs'

const temporary: string[] = []

async function createProject(engine = '@weapp-tailwindcss/engine') {
  const root = await mkdtemp(path.join(tmpdir(), 'weapp-utilities-isolation-'))
  temporary.push(root)
  const project = path.join(root, 'project')
  const modules = path.join(project, 'node_modules')
  await mkdir(path.join(modules, '.pnpm'), { recursive: true })
  await mkdir(path.join(modules, '.bin'))
  await writeFile(path.join(project, 'package.json'), '{}')
  for (const name of ['weapp-tailwindcss', 'tailwindcss', '@tarojs/cli', 'webpack', '@weapp-tailwindcss/postcss', engine, '@tailwindcss/node', '@tailwindcss/oxide']) {
    const packageRoot = path.join(modules, name)
    await mkdir(packageRoot, { recursive: true })
    await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name, main: 'index.js', ...(name === 'weapp-tailwindcss' ? { dependencies: { [engine]: '1.0.0' } } : {}) }))
    await writeFile(path.join(packageRoot, 'index.js'), '')
  }
  await mkdir(path.join(modules, '@tarojs', 'cli', 'bin'))
  await writeFile(path.join(modules, '@tarojs', 'cli', 'bin', 'taro'), '')
  await writeFile(path.join(modules, '.bin', process.platform === 'win32' ? 'taro.CMD' : 'taro'), '')
  return { root, project, modules }
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('Windows utilities 临时夹具隔离', () => {
  it('复制输入和补丁但不复制本地依赖或旧产物', async () => {
    const { root, project } = await createProject()
    await mkdir(path.join(project, 'patches'))
    await mkdir(path.join(project, 'dist'))
    await writeFile(path.join(project, 'patches', 'guard.patch'), 'guard')
    await writeFile(path.join(project, 'pnpm-lock.yaml'), 'lock')
    await writeFile(path.join(project, 'dist', 'app.wxss'), 'old')
    const target = path.join(root, 'copied')
    await copyWindowsUtilitiesFixture(project, target)
    expect(await readFile(path.join(target, 'package.json'), 'utf8')).toBe('{}')
    expect(await readFile(path.join(target, 'pnpm-lock.yaml'), 'utf8')).toBe('lock')
    expect(await readFile(path.join(target, 'patches', 'guard.patch'), 'utf8')).toBe('guard')
    await expect(readFile(path.join(target, 'node_modules', 'tailwindcss', 'package.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(path.join(target, 'dist', 'app.wxss'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each(['@weapp-tailwindcss/engine', '@tailwindcss-mangle/engine'])('沿声明的 %s 记录独立依赖和实际命令入口', async (engine) => {
    const { project } = await createProject(engine)
    const result = await verifyWindowsUtilitiesFixtureIsolation(project)
    expect(Object.keys(result.dependencies)).toHaveLength(8)
    expect(isFixtureOwnedPath(result.modules, result.cli)).toBe(true)
    expect(isFixtureOwnedPath(result.modules, result.command)).toBe(true)
  })

  it.each([{}, { '@weapp-tailwindcss/engine': '1.0.0', '@tailwindcss-mangle/engine': '1.0.0' }])('拒绝缺失或含混的引擎声明 %s', async (dependencies) => {
    const { project, modules } = await createProject()
    await writeFile(path.join(modules, 'weapp-tailwindcss', 'package.json'), JSON.stringify({ dependencies }))
    await expect(verifyWindowsUtilitiesFixtureIsolation(project)).rejects.toThrow(/唯一引擎/)
  })

  it('原位切换发布版和候选版后使用当前槽位，避免模块解析缓存保留旧包', async () => {
    const { project, modules } = await createProject()
    const slot = path.join(modules, 'weapp-tailwindcss')
    const published = path.join(modules, '.pnpm', 'published-core')
    const candidate = path.join(modules, '.pnpm', 'candidate-core')
    await rename(slot, published)
    await symlink(published, slot, 'junction')
    const require = createRequire(path.join(project, 'package.json'))
    require.resolve('weapp-tailwindcss/package.json')
    expect((await verifyWindowsUtilitiesFixtureIsolation(project)).dependencies['weapp-tailwindcss']).toBe(await realpath(path.join(published, 'package.json')))
    await cp(published, candidate, { recursive: true })
    await rm(slot, { recursive: true, force: true })
    await symlink(candidate, slot, 'junction')
    expect((await verifyWindowsUtilitiesFixtureIsolation(project)).dependencies['weapp-tailwindcss']).toBe(await realpath(path.join(candidate, 'package.json')))
  })

  it.each([
    { segments: ['node_modules'] },
    { segments: ['node_modules', '.pnpm'] },
    { segments: ['node_modules', '.bin'] },
    { segments: ['node_modules', 'webpack'] },
    { segments: ['node_modules', '@tarojs', 'cli', 'bin'] },
  ])('拒绝借用 $segments', async ({ segments }) => {
    const { root, project } = await createProject()
    const external = path.join(root, 'external')
    await mkdir(external)
    await writeFile(path.join(external, 'package.json'), '{}')
    await writeFile(path.join(external, 'taro'), '')
    const borrowed = path.join(project, ...segments)
    await rm(borrowed, { recursive: true, force: true })
    await symlink(external, borrowed, 'junction')
    await expect(verifyWindowsUtilitiesFixtureIsolation(project)).rejects.toThrow(/临时夹具/)
  })
})

describe('临时夹具路径归属', () => {
  it.each([
    [path.posix, '/fixture/node_modules', '/fixture/node_modules/tailwindcss/index.js', true],
    [path.posix, '/fixture/node_modules', '/fixture/node_modules-borrowed/index.js', false],
    [path.posix, '/fixture/node_modules', '/fixture/tailwindcss/index.js', false],
    [path.posix, '/', '/tailwindcss/index.js', true],
    [path.posix, 'fixture/node_modules', 'fixture/node_modules/tailwindcss/index.js', true],
    [path.win32, 'C:\\fixture\\node_modules', 'C:\\fixture\\node_modules\\tailwindcss\\index.js', true],
    [path.win32, 'C:\\fixture\\node_modules', 'C:\\fixture\\node_modules-borrowed\\index.js', false],
    [path.win32, 'C:\\fixture\\node_modules', 'D:\\fixture\\node_modules\\tailwindcss\\index.js', false],
    [path.win32, 'C:\\', 'C:\\tailwindcss\\index.js', true],
    [path.win32, 'fixture\\node_modules', 'fixture\\node_modules\\tailwindcss\\index.js', true],
  ] as const)('%s 检查 %s 中的 %s', (pathApi, root, file, expected) => {
    expect(isFixtureOwnedPath(root, file, pathApi)).toBe(expected)
  })
})
