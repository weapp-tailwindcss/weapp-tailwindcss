import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { parseTemplateDependencyContract, verifyInstalledTemplateDependency } from './templateContract'

const manifest = { devDependencies: { 'weapp-tailwindcss': '^5.6.3' } }

function lockfile(options: { specifier?: string, version?: string, integrity?: string } = {}) {
  return stringify({
    importers: { '.': { devDependencies: { 'weapp-tailwindcss': {
      specifier: options.specifier ?? '^5.6.3',
      version: options.version ?? '5.6.3(tailwindcss@4.3.3)',
    } } } },
    packages: { 'weapp-tailwindcss@5.6.3': { resolution: { integrity: options.integrity ?? `sha512-${'a'.repeat(86)}==` } } },
    snapshots: { [`weapp-tailwindcss@${options.version ?? '5.6.3(tailwindcss@4.3.3)'}`]: {} },
  })
}

describe('独立模板的已发布依赖身份', () => {
  it('按模板自己的声明和锁验证稳定版，不读取工作区候选包版本', () => {
    const toolchain = stringify({ importers: { '.': { packageManagerDependencies: { pnpm: { version: '12.15.0' } } } } })
    expect(parseTemplateDependencyContract(manifest, `${toolchain}\n---\n${lockfile()}`)).toEqual({ range: '^5.6.3', version: '5.6.3' })
    expect(parseTemplateDependencyContract({ devDependencies: { 'weapp-tailwindcss': '^6.0.0' } }, lockfile())).toBeUndefined()
  })

  it.each([
    { specifier: '^5.0.0' },
    { version: '6.0.0' },
    { version: '5.6.3-beta.1' },
    { version: 'link:../../packages/weapp-tailwindcss' },
    { version: 'npm:another-package@5.6.3' },
    { integrity: 'invalid' },
  ])('拒绝锁文件身份不一致 %j', (options) => {
    expect(parseTemplateDependencyContract(manifest, lockfile(options))).toBeUndefined()
  })

  it.each(['workspace:*', 'file:../../core', 'invalid', '^5.6.3-beta.1'])('拒绝非稳定发布范围 %s', (range) => {
    expect(parseTemplateDependencyContract({ devDependencies: { 'weapp-tailwindcss': range } }, lockfile({ specifier: range }))).toBeUndefined()
  })

  it('拒绝缺失、重复或损坏的依赖来源', () => {
    expect(parseTemplateDependencyContract({}, lockfile())).toBeUndefined()
    expect(parseTemplateDependencyContract({ ...manifest, dependencies: manifest.devDependencies }, lockfile())).toBeUndefined()
    expect(parseTemplateDependencyContract(manifest, '{}')).toBeUndefined()
    expect(parseTemplateDependencyContract(manifest, `${lockfile()}\n---\n${lockfile()}`)).toBeUndefined()
    expect(parseTemplateDependencyContract(manifest, lockfile().replace(/integrity:.+/, ''))).toBeUndefined()
    const nonRegistry = parse(lockfile())
    nonRegistry.packages['weapp-tailwindcss@5.6.3'].resolution.tarball = 'file:local.tgz'
    expect(parseTemplateDependencyContract(manifest, stringify(nonRegistry))).toBeUndefined()
    const missingSnapshot = parse(lockfile())
    missingSnapshot.snapshots['weapp-tailwindcss@5.6.3(tailwindcss@4.3.3)'] = null
    expect(parseTemplateDependencyContract(manifest, stringify(missingSnapshot))).toBeUndefined()
    expect(parseTemplateDependencyContract(manifest, 'importers: [')).toBeUndefined()
  })

  it('核实际安装的包名和版本，拒绝候选包替换独立稳定版', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'template-dependency-'))
    const file = path.join(root, 'node_modules', 'weapp-tailwindcss', 'package.json')
    const contract = { range: '^5.6.3', version: '5.6.3' }
    try {
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, JSON.stringify({ name: 'weapp-tailwindcss', version: '5.6.3' }))
      await expect(verifyInstalledTemplateDependency(root, contract)).resolves.toBeUndefined()
      await writeFile(file, JSON.stringify({ name: 'weapp-tailwindcss', version: '6.0.0' }))
      await expect(verifyInstalledTemplateDependency(root, contract)).rejects.toThrow(/安装依赖/)
      await writeFile(file, JSON.stringify({ name: 'another-package', version: '5.6.3' }))
      await expect(verifyInstalledTemplateDependency(root, contract)).rejects.toThrow(/安装依赖/)
      await rm(file)
      await expect(verifyInstalledTemplateDependency(root, contract)).rejects.toThrow()
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it.each(['package', 'node_modules'])('拒绝把外部同版本依赖目录链接进模板：%s', async (target) => {
    const base = await mkdtemp(path.join(tmpdir(), 'template-dependency-link-'))
    const root = path.join(base, 'template')
    const outside = path.join(base, 'outside')
    try {
      const file = path.join(outside, 'node_modules', 'weapp-tailwindcss', 'package.json')
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, JSON.stringify({ name: 'weapp-tailwindcss', version: '5.6.3' }))
      await mkdir(path.join(root, target === 'package' ? 'node_modules' : ''), { recursive: true })
      await symlink(
        path.join(outside, 'node_modules', ...(target === 'package' ? ['weapp-tailwindcss'] : [])),
        path.join(root, 'node_modules', ...(target === 'package' ? ['weapp-tailwindcss'] : [])),
        'junction',
      )
      await expect(verifyInstalledTemplateDependency(root, { range: '^5.6.3', version: '5.6.3' })).rejects.toThrow(/安装依赖/)
    }
    finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('接受模板自己 node_modules 内的正常 pnpm 包链接', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'template-dependency-pnpm-'))
    try {
      const installed = path.join(root, 'node_modules', '.pnpm', 'weapp-tailwindcss@5.6.3', 'node_modules', 'weapp-tailwindcss')
      await mkdir(installed, { recursive: true })
      await writeFile(path.join(installed, 'package.json'), JSON.stringify({ name: 'weapp-tailwindcss', version: '5.6.3' }))
      await symlink(installed, path.join(root, 'node_modules', 'weapp-tailwindcss'), 'junction')
      await expect(verifyInstalledTemplateDependency(root, { range: '^5.6.3', version: '5.6.3' })).resolves.toBeUndefined()
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
