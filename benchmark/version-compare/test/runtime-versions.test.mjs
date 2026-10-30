import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { bindingFilePath, driverModulePaths, verifyRuntimeBinding } from '../scripts/runtime-diagnostics/binding.mjs'
import { digestBytes } from '../scripts/runtime-diagnostics/bounded-file.mjs'
import { createRuntimeVersions } from '../scripts/source-diagnostics/runtime-versions.mjs'
import { verifyDriverReceipt, verifyPreparedRole } from '../scripts/source-diagnostics/verify.mjs'

// 此夹具只验证 prepare -> runtime 适配；完整准备来源由 source-diagnostics.test.mjs 独立覆盖。
vi.mock('../scripts/source-diagnostics/verify.mjs', () => ({
  verifyDriverReceipt: vi.fn(async input => input),
  verifyPreparedRole: vi.fn(async input => input),
}))
const temporary = []
const sourcePrefix = 'benchmark/version-compare/scripts/source-diagnostics'
const sourceHelpers = ['run', 'verify', 'prepare', 'inputs', 'package-inputs', 'files', 'command', 'git-source', 'runtime-versions', 'join-runtime'].map(name => `${sourcePrefix}/${name}.mjs`)
const hmrPath = 'demo/weapp-vite-tailwindcss-v4/pages/index/index.wxml'
const projectPath = 'demo/weapp-vite-tailwindcss-v4'
const sha = value => value.repeat(40)
beforeEach(() => vi.clearAllMocks())
afterEach(async () => {
  for (const directory of temporary.splice(0)) {
    await fs.rm(directory, {
      recursive: true,
      force: true,
    })
  }
})
async function write(root, logical, value, kind = 'source') {
  const file = bindingFilePath(root, logical)
  await fs.mkdir(path.dirname(file), {
    recursive: true,
  })
  const bytes = Buffer.from(value)
  await fs.writeFile(file, bytes)
  return {
    logical,
    physical: await fs.realpath(file),
    bytes: bytes.length,
    sha256: digestBytes(bytes),
    kind,
    immutableDuringWorkload: true,
  }
}
async function fixture({
  distFiles = 0,
} = {}) {
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-version-adapter-')))
  temporary.push(parent)
  const sourceRepository = path.join(parent, 'driver')
  await fs.mkdir(sourceRepository)
  const files = []
  for (const logical of [...new Set([...driverModulePaths, ...sourceHelpers])]) {
    const text = `export const fixture = ${JSON.stringify(logical)}\n`
    await write(sourceRepository, logical, text)
    const bytes = Buffer.from(text)
    files.push({
      logical,
      mode: '100644',
      gitBlob: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
    })
  }
  const driver = {
    sourceRepository,
    driverCommit: sha('d'),
    driverTree: sha('e'),
    manifest: await write(parent, 'driver-manifest.json', JSON.stringify({
      sourceCommit: sha('d'),
      sourceTree: sha('e'),
      objectFormat: 'sha1',
      files,
    })),
    receipt: await write(parent, 'driver-receipt.json', '{"fixture":true}'),
  }
  const roles = []
  for (const [role, letter] of [['base', 'a'], ['current', 'b']]) {
    const root = path.join(parent, 'products', role)
    await fs.mkdir(root, {
      recursive: true,
    })
    const inputs = {
      project: path.join(root, ...projectPath.split('/')),
      files: [],
      packages: [],
      binaries: [],
    }
    const add = async (logical, text, kind) => {
      const receipt = await write(root, logical, text, kind)
      inputs.files.push(receipt)
      return receipt
    }
    await add('package.json', '{"name":"fixture-root"}', 'package-json')
    const lock = await add('pnpm-lock.yaml', 'lockfileVersion: 9.0\n', 'lock')
    await add(`${projectPath}/package.json`, '{"name":"fixture-project"}', 'package-json')
    await add(`${projectPath}/vite.config.ts`, 'export default {}\n', 'config')
    await add('pnpm-workspace.yaml', 'packages: []\n', 'config')
    await add('scripts/weapp-vite-e2e-watch.mjs', 'export const fixture = true\n', 'source')
    await add(hmrPath, '<view>HMR fixture</view>\n', 'source')
    for (const [name, directory] of [['weapp-tailwindcss', 'packages/weapp-tailwindcss'], ['@weapp-tailwindcss/postcss', 'packages/postcss'], ['weapp-vite', 'node_modules/weapp-vite'], ['vite', 'node_modules/vite']]) {
      const packageJson = await add(`${directory}/package.json`, JSON.stringify({
        name,
        version: '0.0.0-fixture',
      }), 'package-json')
      // 与实际 collectInputs 一致：完整 dist 清单能覆盖入口的 flat kind。
      const entry = await add(`${directory}/dist/index.mjs`, 'export const value = 1\n', 'dist')
      inputs.packages.push({
        name,
        version: '0.0.0-fixture',
        packageJson,
        entry,
        resolution: 'require-from-project',
      })
      if (name === 'weapp-vite') {
        inputs.binaries.push({
          name,
          packageName: name,
          packageJson,
          entry: await add(`${directory}/bin/weapp-vite.mjs`, 'export const main = true\n', 'bin'),
        })
      }
    }
    for (let index = 0; index < distFiles; index++) {
      await add(`packages/weapp-tailwindcss/dist/extra-${index}.mjs`, `export const n = ${index}\n`, 'dist')
    }
    await add('node_modules/.bin/weapp-vite', '# fixture shim\n', 'bin-shim')
    await add('node_modules/pnpm.cjs', '// fixture manager\n', 'package-manager')
    const receipt = await write(parent, `${role}-receipt.json`, JSON.stringify({
      fixture: role,
    }))
    roles.push({
      role,
      kind: 'runtime',
      root,
      sourceCommit: sha(letter),
      sourceTree: sha(letter === 'a' ? 'c' : 'f'),
      lockSha256: lock.sha256,
      driverCommit: driver.driverCommit,
      driverTree: driver.driverTree,
      driverReceipt: driver.receipt,
      inputs,
      receipt,
      preparationReceiptSha256: receipt.sha256,
      trackedManifestSha256: digestBytes('fixture tree'),
      sourceManifest: receipt,
      sourceArchive: {
        manifest: receipt,
      },
    })
  }
  return {
    status: 'complete',
    kind: 'runtime',
    diagnosticOnly: true,
    budgetAcceptance: false,
    executionProvider: 'injected',
    driver,
    roles,
  }
}
const options = {
  allowInjected: true,
}
function expected(role) {
  return {
    root: role.root,
    sourceCommit: role.sourceCommit,
    sourceTree: role.sourceTree,
    expectedEntry: role.inputs.binaries[0].entry.physical,
    manifestPath: role.inputs.binaries[0].packageJson.physical,
  }
}
it('完整准备清单超过 64 KiB 时仅绑定关键输入，同时覆盖 dist kind 的真实 package entry', async () => {
  const report = await fixture({
    distFiles: 400,
  })
  const versions = await createRuntimeVersions(report, options)
  expect(versions.map(version => version.version)).toEqual(['base', 'current'])
  expect(Buffer.byteLength(JSON.stringify(report.roles[0].inputs.files))).toBeGreaterThan(64 * 1024)
  for (const [index, version] of versions.entries()) {
    const role = report.roles[index]
    const {
      binding,
      bindingScope,
    } = version.diagnosticIdentity
    expect(Buffer.byteLength(JSON.stringify(binding))).toBeLessThanOrEqual(64 * 1024)
    expect(binding.driver.files.map(file => file.relativePath)).toEqual(expect.arrayContaining([...driverModulePaths, ...sourceHelpers]))
    const paths = binding.product.files.map(file => file.relativePath)
    expect(paths).toContain('node_modules/weapp-vite/bin/weapp-vite.mjs')
    expect(paths).toContain('packages/weapp-tailwindcss/dist/index.mjs')
    expect(paths).toContain('node_modules/weapp-vite/package.json')
    expect(paths).not.toContain(hmrPath)
    expect(paths).not.toContain('packages/weapp-tailwindcss/dist/extra-0.mjs')
    expect(paths).not.toContain('node_modules/.bin/weapp-vite')
    expect(paths).not.toContain('node_modules/pnpm.cjs')
    expect(bindingScope.omittedDistFiles).toBe(400)
    expect(bindingScope.excludedHmrSources).toEqual([hmrPath])
    expect(verifyRuntimeBinding(binding, expected(role)).productTree).toBe(role.sourceTree)
  }
  expect(verifyDriverReceipt).toHaveBeenCalledWith(report.driver, options)
  expect(verifyPreparedRole).toHaveBeenCalledTimes(2)
  expect(verifyPreparedRole).toHaveBeenNthCalledWith(1, report.roles[0], {
    phase: 'before',
    allowInjected: true,
  })
  expect(verifyPreparedRole).toHaveBeenNthCalledWith(2, report.roles[1], {
    phase: 'before',
    allowInjected: true,
  })
})
it.each(['bin', 'entry', 'config', 'lock'])('HMR mutation 允许临时变动；关键 %s mutation 必须被 runtime 绑定拒绝', async (kind) => {
  const report = await fixture()
  const versions = await createRuntimeVersions(report, options)
  const role = report.roles[0]
  const binding = versions[0].diagnosticIdentity.binding
  await fs.appendFile(bindingFilePath(role.root, hmrPath), '<view>mutation</view>')
  expect(() => verifyRuntimeBinding(binding, expected(role))).not.toThrow()
  const file = kind === 'bin' ? role.inputs.binaries[0].entry : kind === 'entry' ? role.inputs.packages[0].entry : role.inputs.files.find(file => file.kind === kind)
  await fs.appendFile(file.physical, '\n// changed\n')
  expect(() => verifyRuntimeBinding(binding, expected(role))).toThrow('哈希或尺寸')
})
it.each(['bin', 'entry'])('缺少真实 %s 的完整准备回执不能降级为精简绑定', async (kind) => {
  const report = await fixture()
  const role = report.roles[0]
  const file = kind === 'bin' ? role.inputs.binaries[0].entry : role.inputs.packages[0].entry
  role.inputs.files = role.inputs.files.filter(item => item.physical !== file.physical)
  await expect(createRuntimeVersions(report, options)).rejects.toThrow('完整准备 inputs')
})
it('实际 HMR 源不能充当不可变 bin，driver Git blob 必须对应实际 helper 字节', async () => {
  const report = await fixture()
  const role = report.roles[0]
  const original = role.inputs.binaries[0].entry
  role.inputs.binaries[0].entry = role.inputs.files.find(file => file.logical === hmrPath)
  await expect(createRuntimeVersions(report, options)).rejects.toThrow('HMR 源不能')
  role.inputs.binaries[0].entry = original
  await fs.appendFile(bindingFilePath(report.driver.sourceRepository, sourceHelpers[0]), '\n// changed\n')
  await expect(createRuntimeVersions(report, options)).rejects.toThrow('Git blob')
})
it('未完成、注入默认入口、错序以及重复产品根都必须拒绝', async () => {
  const report = await fixture()
  await expect(createRuntimeVersions({
    ...report,
    status: 'incomplete',
  }, options)).rejects.toThrow('完整 runtime')
  await expect(createRuntimeVersions(report)).rejects.toThrow('注入 fixture')
  await expect(createRuntimeVersions({
    ...report,
    roles: [...report.roles].reverse(),
  }, options)).rejects.toThrow('base/current')
  await expect(createRuntimeVersions({
    ...report,
    roles: [report.roles[0], {
      ...report.roles[0],
      role: 'current',
    }],
  }, options)).rejects.toThrow('roots 重复')
})
