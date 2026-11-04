import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { parseAllDocuments } from 'yaml'
import { isTemplateVersionCompatible, readTemplateDependencyContract, TEMPLATE_PACKAGE_MANAGER, trackedTemplateManifests } from './templateContract'

const stableVersion = '5.6.3'
const major = 5

describe('模板稳定版兼容范围', () => {
  it.each([`^${major}.0.0`, `^${stableVersion}`, stableVersion])('接受兼容范围 %s', (range) => {
    expect(isTemplateVersionCompatible(range, stableVersion)).toBe(true)
  })

  it.each([`>=${major + 1}.0.0`, `<${major}.0.0`, 'invalid', 'workspace:*', undefined, null])('拒绝不兼容或无效范围 %s', (range) => {
    expect(isTemplateVersionCompatible(range, stableVersion)).toBe(false)
  })
})

it('所有模板的 manifest 和独立工具链锁文件使用仓库 pnpm 版本', async () => {
  const repository = fileURLToPath(new URL('../', import.meta.url))
  const version = TEMPLATE_PACKAGE_MANAGER.replace(/^pnpm@/, '').split('+')[0]
  const manifests = await trackedTemplateManifests(repository)
  expect(manifests.length).toBeGreaterThan(0)
  for (const file of manifests) {
    const root = path.dirname(file)
    const name = path.basename(root)
    const manifest = JSON.parse(await readFile(file, 'utf8'))
    expect(manifest.packageManager, name).toBe(TEMPLATE_PACKAGE_MANAGER)
    await expect(readTemplateDependencyContract(root), name).resolves.toMatchObject({ range: expect.any(String), version: expect.any(String) })
    const documents = parseAllDocuments(await readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8'))
    expect(documents.flatMap(document => document.errors), name).toEqual([])
    const toolchain = documents.map(document => document.toJS()).find(document => document.importers?.['.']?.packageManagerDependencies)
    expect(toolchain?.importers['.'].packageManagerDependencies.pnpm, name).toEqual({ specifier: version, version })
  }
})

it('模板发现排除遗留缓存和嵌套依赖，但不会掩盖受跟踪 manifest 缺失', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'template-contract-'))
  const run = promisify(execFile)
  try {
    await run('git', ['init', '--quiet'], { cwd: root })
    const manifest = path.join(root, 'templates', 'current template', 'package.json')
    const dependency = path.join(root, 'templates', 'current template', 'node_modules', 'dep', 'package.json')
    await mkdir(path.dirname(manifest), { recursive: true })
    await mkdir(path.dirname(dependency), { recursive: true })
    await mkdir(path.join(root, 'templates', 'removed-template', 'dist'), { recursive: true })
    await writeFile(manifest, '{}')
    await writeFile(dependency, '{}')
    await run('git', ['add', '--', 'templates'], { cwd: root })
    expect(await trackedTemplateManifests(root)).toEqual([manifest])
    await rm(manifest)
    expect(await trackedTemplateManifests(root)).toEqual([manifest])
    await expect(readFile(manifest, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
