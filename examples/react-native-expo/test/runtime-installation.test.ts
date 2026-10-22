import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { acquireRuntimePhase, assertCurrentRuntimeInstallation, assertRuntimePhaseActive, captureRuntimeInstallation, runtimeInstanceForRealm } from '../src/compatibility/runtime-installation'

const runtime = vi.hoisted(() => ({
  manifest: { version: 1, rules: { 'bg-red': [{ style: { backgroundColor: '#f00' } }] } },
  publication: { revision: 'actual-runtime-publication', manifestSha256: 'a'.repeat(64) } as { revision: string, manifestSha256: string } | undefined,
}))
vi.mock('@weapp-tailwindcss/react-native/runtime', () => ({ getManifest: () => runtime.manifest, getPublication: () => runtime.publication }))
beforeEach(() => {
  runtime.manifest = { version: 1, rules: { 'bg-red': [{ style: { backgroundColor: '#f00' } }] } }
  runtime.publication = { revision: 'actual-runtime-publication', manifestSha256: 'a'.repeat(64) }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
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

it('marker 先更新时先等待发布 fence，实际新安装匹配后才冻结，不复用 mount 旧快照', async () => {
  vi.useFakeTimers()
  vi.stubEnv('EXPO_PUBLIC_RN_REPORT_CLIENT', 'owned-client')
  const old = captureRuntimeInstallation()
  const next = { revision: 'next-publication-same-content', manifestSha256: old.publication.manifestSha256 }
  const context = { runId: 'run', revision: 'next-phase', publication: next }
  const fetch = vi.fn().mockResolvedValueOnce({ status: 425 }).mockResolvedValue({ status: 200, ok: true, json: async () => context })
  vi.stubGlobal('fetch', fetch)
  let resolved = false
  const pending = acquireRuntimePhase('http://owned-host', 'next-phase', new AbortController().signal).then((value) => {
    resolved = true
    return value
  })
  await vi.advanceTimersByTimeAsync(100)
  expect(resolved).toBe(false)
  runtime.publication = next
  await vi.advanceTimersByTimeAsync(100)
  const result = await pending
  expect(result.installation.publication).toEqual(next)
  expect(result.installation.runtimeInstanceId).toBe(old.runtimeInstanceId)
  expect(result.context).toEqual(context)
})

it('开始采集后安装改变仍立即拒绝，并保留前后发布身份诊断', async () => {
  vi.stubEnv('EXPO_PUBLIC_RN_REPORT_CLIENT', 'owned-client')
  const installed = captureRuntimeInstallation()
  runtime.publication = { ...runtime.publication!, revision: 'changed-during-capture' }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ revision: 'current-phase', publication: runtime.publication }) }))
  await expect(acquireRuntimePhase('http://owned-host', 'current-phase', new AbortController().signal, installed)).rejects.toThrow(/actual.*changed-during-capture.*expected.*actual-runtime-publication/)
})

it('发布未就绪时取消会释放轮询，不产生迟到采集', async () => {
  vi.useFakeTimers()
  vi.stubEnv('EXPO_PUBLIC_RN_REPORT_CLIENT', 'owned-client')
  const fetch = vi.fn().mockResolvedValue({ status: 425 })
  vi.stubGlobal('fetch', fetch)
  const cancel = new AbortController()
  const pending = acquireRuntimePhase('http://owned-host', 'current-phase', cancel.signal)
  const failure = expect(pending).rejects.toThrow('cancel-owned-phase')
  await vi.advanceTimersByTimeAsync(0)
  cancel.abort(new Error('cancel-owned-phase'))
  await failure
  await vi.advanceTimersByTimeAsync(1_000)
  expect(fetch).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it('publication 先于 marker 时直接取得实际安装，开始后连续新发布仍拒绝', async () => {
  vi.stubEnv('EXPO_PUBLIC_RN_REPORT_CLIENT', 'owned-client')
  runtime.publication = { ...runtime.publication!, revision: 'publication-before-marker' }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ revision: 'next-phase', publication: runtime.publication }) }))
  const cancel = new AbortController()
  const acquired = await acquireRuntimePhase('http://owned-host', 'next-phase', cancel.signal)
  expect(acquired.installation.publication.revision).toBe('publication-before-marker')
  runtime.publication = { ...runtime.publication!, revision: 'repeated-publication-after-start' }
  await expect(acquireRuntimePhase('http://owned-host', 'next-phase', cancel.signal, acquired.installation)).rejects.toThrow('采集期间')
})

it('原生仅实现 aborted 的取消信号也能阻断，不依赖额外 AbortSignal 方法', () => {
  expect(() => assertRuntimePhaseActive({ aborted: false } as AbortSignal)).not.toThrow()
  expect(() => assertRuntimePhaseActive({ aborted: true } as AbortSignal)).toThrow('所属阶段')
})
