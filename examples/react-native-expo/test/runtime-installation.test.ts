import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { assertCurrentRuntimeInstallation, captureRuntimeInstallation, runtimeInstanceForRealm } from '../src/compatibility/runtime-installation'

const runtime = vi.hoisted(() => ({
  manifest: { version: 1, rules: { 'bg-red': [{ style: { backgroundColor: '#f00' } }] } },
  publication: { revision: 'actual-runtime-publication', manifestSha256: 'a'.repeat(64) } as { revision: string, manifestSha256: string } | undefined,
}))
vi.mock('@weapp-tailwindcss/react-native/runtime', () => ({ getManifest: () => runtime.manifest, getPublication: () => runtime.publication }))
afterEach(() => vi.restoreAllMocks())

beforeEach(() => {
  runtime.manifest = { version: 1, rules: { 'bg-red': [{ style: { backgroundColor: '#f00' } }] } }
  runtime.publication = { revision: 'actual-runtime-publication', manifestSha256: 'a'.repeat(64) }
})

it('读取实际安装内容，后续 runtime 变更不能改写已采快照', () => {
  const installed = captureRuntimeInstallation()
  expect(JSON.parse(installed.manifestJson)).toEqual(runtime.manifest)
  expect(installed.publication).toEqual(runtime.publication)
  runtime.manifest.rules['bg-red'][0]!.style.backgroundColor = '#00f'
  expect(JSON.parse(installed.manifestJson).rules['bg-red'][0].style.backgroundColor).toBe('#f00')
  expect(() => assertCurrentRuntimeInstallation(installed)).toThrow('采集期间')
})

it('相同内容也必须保留实际发布身份，不能用宿主或旧 UUID 回显', () => {
  const installed = captureRuntimeInstallation()
  runtime.publication = { ...runtime.publication!, revision: 'another-publication-same-content' }
  expect(() => assertCurrentRuntimeInstallation(installed)).toThrow('采集期间')
})

it('缺少 runtime 发布身份立即失败', () => {
  runtime.publication = undefined
  expect(captureRuntimeInstallation).toThrow('缺少稳定发布身份')
})

it('同 realm 的模块 HMR 保持身份，新的 JS realm 产生不同身份', async () => {
  const first = captureRuntimeInstallation().runtimeInstanceId
  vi.resetModules()
  const reloaded = await import('../src/compatibility/runtime-installation')
  expect(reloaded.captureRuntimeInstallation().runtimeInstanceId).toBe(first)
  const realm = {}
  expect(runtimeInstanceForRealm(realm)).toBe(runtimeInstanceForRealm(realm))
  expect(runtimeInstanceForRealm({})).not.toBe(runtimeInstanceForRealm(realm))
  expect(Object.keys(realm)).toEqual([])
})

it('不覆盖被其它代码占用的运行实例槽', () => {
  const realm = { __WEAPP_TAILWIND_E2E_RUNTIME_INSTANCE__: 'forged-instance-identity' }
  expect(() => runtimeInstanceForRealm(realm)).toThrow('占用或修改')
  expect(realm.__WEAPP_TAILWIND_E2E_RUNTIME_INSTANCE__).toBe('forged-instance-identity')
})

it('零随机值仍生成符合合同且可重复读取的 realm 身份', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0)
  vi.spyOn(Date, 'now').mockReturnValue(0)
  const realm = {}
  const identity = runtimeInstanceForRealm(realm)
  expect(identity).toMatch(/^[\w-]{16,128}$/)
  expect(runtimeInstanceForRealm(realm)).toBe(identity)
})
