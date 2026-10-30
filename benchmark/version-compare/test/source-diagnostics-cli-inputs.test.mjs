import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it } from 'vitest'
import { prepareSourceDiagnostics, verifyPreparedRole } from '../scripts/source-diagnostics/prepare.mjs'
import { cliInputFixture, write } from './fixtures/source-cli-inputs.mjs'

const temporary = []
afterEach(async () => {
  for (const directory of temporary.splice(0)) {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
async function fixture(kind, behavior) {
  const result = await cliInputFixture(kind, behavior)
  temporary.push(result.parent)
  return result
}

it.skipIf(process.platform === 'win32').each(['runtime', 'taro'])('%s 使用隐藏 manifest + import-only exports 的真实 CLI bin，完整 prepare/verify 不要求 CJS 主入口', async (kind) => {
  const { options, definition, calls } = await fixture(kind)
  const report = await prepareSourceDiagnostics(options)
  expect(report).toMatchObject({ status: 'complete', diagnosticOnly: true, budgetAcceptance: false, executionProvider: 'injected' })
  expect(report.roles).toHaveLength(2)
  for (const role of report.roles) {
    const require = createRequire(path.join(role.inputs.project, 'package.json'))
    expect(() => require.resolve(definition.binary[0])).toThrow()
    expect(() => require.resolve(`${definition.binary[0]}/package.json`)).toThrow()
    const item = role.inputs.packages.find(item => item.name === definition.binary[0])
    const binary = role.inputs.binaries[0]
    expect(item).toMatchObject({ resolution: kind === 'taro' ? 'require-bin-from-project' : 'manifest-bin-from-project', consumption: { kind: 'cli-bin', name: definition.binary[1] } })
    expect(item.entry.physical).toBe(binary.entry.physical)
    expect(item.entry.physical).toBe(path.join(path.dirname(item.packageJson.physical), 'bin', kind === 'taro' ? 'taro' : 'cli.mjs'))
    if (kind === 'taro') {
      expect(item.consumption.specifier).toBe('@tarojs/cli/bin/taro')
      const taroBin = require.resolve(definition.binarySpecifier, { paths: [role.inputs.project] })
      expect(taroBin).toBe(item.entry.physical)
      expect(require(taroBin)).toEqual({ cli: true })
    }
    expect(role.inputs.files).toContainEqual(expect.objectContaining({ physical: item.entry.physical }))
    expect(role.inputs.files.some(file => file.kind === 'dist' && file.physical === path.join(path.dirname(item.packageJson.physical), 'dist', 'index.mjs'))).toBe(true)
    expect(role.inputs.files.some(file => file.kind === 'source' && file.logical === definition.sources[0])).toBe(true)
    expect(role.inputs.files.some(file => file.kind === 'config' && file.logical.startsWith(`${definition.project}/`))).toBe(true)
    expect(role.installOwnership.packages.filter(item => item.entryStatus === 'build-pending').map(item => item.name)).toEqual(['weapp-tailwindcss', '@weapp-tailwindcss/postcss'])
    expect(role.installOwnership.packages.find(item => item.name === definition.binary[0]).entryStatus).toBe('ready')
    expect(calls.filter(call => call.cwd === role.root).map(call => call.args)).toEqual([['--version'], ['install', '--frozen-lockfile'], ['run', 'build:pkgs']])
    await expect(verifyPreparedRole(role, { allowInjected: true })).resolves.toMatchObject({ trackedSourcesVerified: true })
    await expect(verifyPreparedRole(role, { phase: 'checkpoint', allowInjected: true })).resolves.toMatchObject({ trackedSourcesVerified: false })
  }
  const role = report.roles[0]
  await fs.appendFile(role.inputs.binaries[0].entry.physical, '// changed CLI\n')
  await expect(verifyPreparedRole(role, { allowInjected: true })).rejects.toThrow('身份变化')
}, 30000)

it.skipIf(process.platform === 'win32').each(['missing', 'invalid', 'import-only'])('普通外部 require 包的 %s 错误不进入 build-pending 或 manifest fallback', async (requireFailure) => {
  const { options, calls } = await fixture('runtime', { requireFailure })
  const report = await prepareSourceDiagnostics(options)
  expect(report).toMatchObject({ status: 'incomplete', firstFailure: { role: 'base', stage: 'install' } })
  const expectedCode = { 'missing': 'MODULE_NOT_FOUND', 'invalid': 'ERR_INVALID_PACKAGE_TARGET', 'import-only': 'ERR_PACKAGE_PATH_NOT_EXPORTED' }[requireFailure]
  expect(report.firstFailure.code).toBe(expectedCode)
  expect(calls.some(call => call.args[1] === 'build:pkgs')).toBe(false)
}, 30000)
it.skipIf(process.platform === 'win32').each(['missing', 'borrowed'])('CLI bin %s 时安装验收立即失败，不尝试 CJS 主入口兜底', async (binFailure) => {
  const { options, calls } = await fixture('runtime', { binFailure })
  const report = await prepareSourceDiagnostics(options)
  expect(report).toMatchObject({ status: 'incomplete', firstFailure: { role: 'base', stage: 'install' } })
  expect(calls.some(call => call.args[1] === 'build:pkgs')).toBe(false)
}, 30000)
it.skipIf(process.platform === 'win32')('workspace build-pending 仅限安装阶段，构建后仍缺失必须失败', async () => {
  const { options } = await fixture('runtime', { leaveWorkspacePending: true })
  const report = await prepareSourceDiagnostics(options)
  expect(report).toMatchObject({ status: 'incomplete', firstFailure: { role: 'base', stage: 'inputs' } })
  expect(report.roles[0].installOwnership.packages.filter(item => item.entryStatus === 'build-pending')).toHaveLength(2)
}, 30000)
it.skipIf(process.platform === 'win32')('新增 CLI dist 文件也属于完整输入集合，verify 不能只检查 bin', async () => {
  const { options } = await fixture('runtime')
  const report = await prepareSourceDiagnostics(options)
  expect(report.status).toBe('complete')
  const role = report.roles[0]
  const manifest = role.inputs.binaries[0].packageJson.physical
  await write(path.dirname(manifest), 'dist/new.mjs', 'export const added = true\n')
  await expect(verifyPreparedRole(role, { allowInjected: true })).rejects.toThrow('集合')
}, 30000)

it.skipIf(process.platform === 'win32').each(['../outside.mjs', '..\\outside.mjs', 'C:\\outside.mjs', 'C:outside.mjs', '/outside.mjs', '\\\\host\\share\\cli.mjs'])('manifest bin 拒绝跨平台非所属逻辑路径 %s', async (binPath) => {
  const { options, calls } = await fixture('runtime', { binPath })
  const report = await prepareSourceDiagnostics(options)
  expect(report).toMatchObject({ status: 'incomplete', firstFailure: { role: 'base', stage: 'install' } })
  expect(calls.some(call => call.args[1] === 'build:pkgs')).toBe(false)
}, 30000)
it.skipIf(process.platform === 'win32').each([{ workspaceEntry: './other/index.cjs' }, { workspaceNodeCondition: true }])('workspace 豁免不能吞掉其它主入口或 Node 条件目标 %j', async (behavior) => {
  const { options, calls } = await fixture('runtime', behavior)
  const report = await prepareSourceDiagnostics(options)
  expect(report).toMatchObject({ status: 'incomplete', firstFailure: { role: 'base', stage: 'install', code: 'MODULE_NOT_FOUND' } })
  expect(calls.some(call => call.args[1] === 'build:pkgs')).toBe(false)
}, 30000)

it.skipIf(process.platform === 'win32').each(['missing', 'hidden', 'mismatch', 'string-bin'])('Taro 固定 bin/taro 消费失败 %s 时不接受另一 manifest bin 或根导出兜底', async (taroBinFailure) => {
  const { options, calls } = await fixture('taro', { taroBinFailure })
  const report = await prepareSourceDiagnostics(options)
  expect(report).toMatchObject({ status: 'incomplete', firstFailure: { role: 'base', stage: 'install' } })
  if (taroBinFailure === 'mismatch') {
    expect(report.firstFailure.message).toContain('深层入口与 manifest bin 不一致')
  }
  expect(calls.some(call => call.args[1] === 'build:pkgs')).toBe(false)
}, 30000)
