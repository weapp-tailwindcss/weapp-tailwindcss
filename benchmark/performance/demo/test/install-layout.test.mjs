import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'vite'
import { parse } from 'yaml'
import { expect, it } from 'vitest'
import { installationLayout, writeConsumer } from '../published.mjs'
import { pruneLock } from '../lock.mjs'

it('保留符号链接的框架需要可见的传递依赖；三组安装策略写入独立消费配置', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cost-layout-'))
  try {
    const modules = path.join(root, 'node_modules')
    const nested = path.join(modules, '.pnpm', 'wrapper', 'node_modules')
    for (const [name, source] of [['wrapper', 'export {value} from "nested"'], ['nested', 'export const value = 42']]) {
      const directory = path.join(nested, name)
      await mkdir(directory, { recursive: true })
      await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name, type: 'module', exports: './index.js' }))
      await writeFile(path.join(directory, 'index.js'), source)
    }
    const type = process.platform === 'win32' ? 'junction' : 'dir'
    await symlink(path.join(nested, 'wrapper'), path.join(modules, 'wrapper'), type)
    const entry = path.join(root, 'entry.js')
    await writeFile(entry, 'export {value} from "wrapper"')
    const bundle = () => build({ root, configFile: false, logLevel: 'silent', resolve: { preserveSymlinks: true }, build: { write: false, lib: { entry, formats: ['es'] } } })
    await expect(bundle()).rejects.toThrow('nested')
    await symlink(path.join(nested, 'nested'), path.join(modules, 'nested'), type)
    const output = await bundle()
    expect([output].flat().flatMap(result => result.output).some(chunk => chunk.code?.includes('42'))).toBe(true)
    for (const mode of ['native', 'static', 'enabled']) {
      const project = path.join(root, mode)
      await mkdir(project)
      await writeConsumer(project, { name: mode }, { nodeLinker: installationLayout({ family: 'uni' }) })
      expect(parse(await readFile(path.join(project, 'pnpm-workspace.yaml'), 'utf8')).nodeLinker).toBe('hoisted')
      const { hooks } = createRequire(import.meta.url)(path.join(project, '.pnpmfile.cjs'))
      expect(hooks.readPackage({ name: '@dcloudio/uts-linux-x64-gnu', libc: ['gnu'] }).libc).toEqual(['glibc'])
    }
  }
  finally { await rm(root, { recursive: true, force: true }) }
})

it('裁剪消费依赖时保留平台可选包与 pnpm 钩子校验值，冻结安装不能丢失元数据纠正', () => {
  const importer = { dependencies: { uts: { version: '1.0.0' } } }
  const lock = { lockfileVersion: '9.0', pnpmfileChecksum: 'sha256-hook', packages: { 'uts@1.0.0': {}, 'native@1.0.0': { libc: ['glibc'] } }, snapshots: { 'uts@1.0.0': { optionalDependencies: { native: '1.0.0' } }, 'native@1.0.0': {} } }
  const result = pruneLock(lock, importer)
  expect(result.pnpmfileChecksum).toBe(lock.pnpmfileChecksum)
  expect(result.packages['native@1.0.0'].libc).toEqual(['glibc'])
})
