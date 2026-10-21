import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { validateInstalledManifest, validateRuntimeIdentity, validateRuntimeInstallation } from './react-native/installation-evidence'
import { syntheticRuntimeInstallation } from './react-native/installation-fixture'

const source = '{"version":1,"rules":{"bg-red":[{"style":{"backgroundColor":"#f00","width":24}}]}}'

it('实际内容和发布身份分别匹配，宿主的合法序列化格式差异不改变语义', () => {
  const installed = syntheticRuntimeInstallation(source)
  expect(() => validateInstalledManifest(installed, source, installed.publication)).not.toThrow()
  const formatted = `${JSON.stringify(JSON.parse(source), null, 2)}\n`
  const publication = { revision: 'formatted-publication', manifestSha256: createHash('sha256').update(formatted).digest('hex') }
  expect(() => validateInstalledManifest({ ...installed, publication }, formatted, publication)).not.toThrow()
})

it.each(['missing', 'old-version', 'empty-manifest', 'wrong-manifest', 'other-publication', 'wrong-digest', 'host-bytes'] as const)('完整宿主摘要不能掩盖 %s 设备安装证据', (kind) => {
  const installed = syntheticRuntimeInstallation(source)
  const publication = { ...installed.publication }
  let host = source
  if (kind === 'missing') {
    return expect(() => validateInstalledManifest(undefined, host, publication)).toThrow('安装')
  }
  if (kind === 'old-version') {
    Object.assign(installed, { version: 0 })
  }
  if (kind === 'empty-manifest') {
    installed.manifestJson = '{}'
  }
  if (kind === 'wrong-manifest') {
    installed.manifestJson = '{"version":1,"rules":{"bg-red":[{"style":{"backgroundColor":"#f00"}}]}}'
  }
  if (kind === 'other-publication') {
    installed.publication.revision = 'same-manifest-other-publication'
  }
  if (kind === 'wrong-digest') {
    installed.publication.manifestSha256 = 'b'.repeat(64)
  }
  if (kind === 'host-bytes') {
    host += '\n'
  }
  expect(() => validateInstalledManifest(installed, host, publication)).toThrow(/安装/)
})

it('接受合法新发布与相同 manifest，不强制 HMR 内容摘要互异', () => {
  const first = syntheticRuntimeInstallation(source, 'publication-1')
  const next = syntheticRuntimeInstallation(source, 'publication-2')
  expect(next.publication.manifestSha256).toBe(first.publication.manifestSha256)
  expect(() => validateInstalledManifest(next, source, next.publication)).not.toThrow()
  expect(() => validateInstalledManifest(first, source, next.publication)).toThrow('发布身份')
})

it('JSON 原始值和空规则缺证不会被有效 JSON 语法掩盖', () => {
  for (const manifestJson of ['null', '1', '[]', '{"rules":null}', '{"rules":[]}']) {
    expect(() => validateRuntimeInstallation({ ...syntheticRuntimeInstallation(), manifestJson })).toThrow('安装')
  }
})

it('摘要必须是字符串，不能由数组或自定义字符串转换冒充', () => {
  const installed = syntheticRuntimeInstallation(source)
  for (const manifestSha256 of [[installed.publication.manifestSha256], { toString: () => installed.publication.manifestSha256 }]) {
    expect(() => validateRuntimeIdentity({ ...installed, publication: { ...installed.publication, manifestSha256 } })).toThrow('有效实际安装')
  }
})
