import type { NativeCaseReceipt, NativePairEvidence, ReactNativeReport } from '../examples/react-native-expo/src/compatibility/protocol'
import { createServer } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { nativeFixtures } from '../examples/react-native-expo/src/compatibility/protocol'
import { syntheticRuntimeInstallation } from './react-native/installation-fixture'
import { evaluateNativeWait } from './react-native/native-wait'
import { createSemanticReporter } from './react-native/semantic-reporter'
import { allocateExpoWebPort } from './react-native/web-session'

const revision = 'rn-hmr-baseline-10b981'
const headers = { 'x-rn-e2e-client': 'owned-client', 'content-type': 'application/json' }

function pair(overrides: Partial<NativePairEvidence> = {}): NativePairEvidence {
  const rect = { x: 0, y: 0, width: 40, height: 40 }
  return {
    runtimeInstallation: syntheticRuntimeInstallation(),
    runId: 'run',
    revision,
    platform: 'web',
    id: 'background-color',
    phase: 'default',
    probe: rect,
    reference: rect,
    target: rect,
    referenceTarget: rect,
    control: rect,
    controlTarget: rect,
    viewport: { width: 402, height: 874, pixelRatio: 1 },
    ...overrides,
  }
}

function receipt(input: NativePairEvidence): NativeCaseReceipt {
  return { runtimeInstallation: input.runtimeInstallation, runId: input.runId, id: input.id, phase: input.phase, checkpoints: [], artifact: { name: 'owned.png', sha256: 'a'.repeat(64), byteLength: 1 } }
}

async function withReporter(action: (session: {
  endpoint: string
  reporter: ReturnType<typeof createSemanticReporter>
  capture: ReturnType<typeof vi.fn<(input: NativePairEvidence) => Promise<NativeCaseReceipt>>>
  complete: ReturnType<typeof vi.fn<() => Promise<void>>>
  post: (route: string, value: unknown, client?: string) => Promise<Response>
}) => Promise<void>, publication?: () => Promise<NativePairEvidence['runtimeInstallation']['publication']>) {
  const capture = vi.fn(async (input: NativePairEvidence) => receipt(input))
  const complete = vi.fn(async () => {})
  const reporter = createSemanticReporter({ runId: 'run', fixtureHash: 'fixture', catalogHash: 'catalog', versions: {} }, capture, { clientToken: 'owned-client', revision, platform: 'web', complete, publication })
  const server = createServer((request, response) => {
    if (!reporter.handle(request, response)) {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Missing test reporter port')
    }
    const endpoint = `http://127.0.0.1:${address.port}`
    await action({ endpoint, reporter, capture, complete, post: (route, value, client = 'owned-client') => fetch(`${endpoint}${route}`, { method: 'POST', headers: { ...headers, 'x-rn-e2e-client': client }, body: JSON.stringify(value) }) })
  }
  finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

describe('React Native 采集客户端与 revision 隔离', () => {
  it('当前阶段的真实 publication 读取失败仍立即阻断', async () => {
    await withReporter(async ({ endpoint, reporter }) => {
      expect((await fetch(`${endpoint}/context`, { headers })).status).toBe(500)
      expect(() => reporter.assertReady()).toThrow('semantic evidence failed')
    }, async () => { throw new Error('current-publication-read-failed') })
  })

  it.each(['resolve', 'reject'] as const)('旧 context 延迟 %s 不得污染新阶段的 fence 或错误集合', async (outcome) => {
    let release!: (value: NativePairEvidence['runtimeInstallation']['publication']) => void
    let reject!: (error: Error) => void
    let started!: () => void
    const entered = new Promise<void>(resolve => started = resolve)
    const delayed = new Promise<NativePairEvidence['runtimeInstallation']['publication']>((resolve, fail) => {
      release = resolve
      reject = fail
    })
    const publication = vi.fn().mockImplementationOnce(() => {
      started()
      return delayed
    }).mockResolvedValue(syntheticRuntimeInstallation().publication)
    await withReporter(async ({ endpoint, reporter, post }) => {
      const stale = fetch(`${endpoint}/context`, { headers })
      await entered
      reporter.setRevision('next-phase')
      if (outcome === 'resolve') {
        release({ ...syntheticRuntimeInstallation().publication, revision: 'stale-publication' })
      }
      else {
        reject(new Error('old-phase-read-failed'))
      }
      expect((await stale).status).toBe(409)
      expect(() => reporter.assertReady()).not.toThrow()
      expect((await fetch(`${endpoint}/context`, { headers })).status).toBe(200)
      expect((await post('/case', pair({ revision: 'next-phase' }))).status).toBe(200)
    }, publication)
  })

  it('新阶段旧 publication 返回未就绪，新的实际安装通过 fence 后才能采集', async () => {
    let current = syntheticRuntimeInstallation().publication
    await withReporter(async ({ endpoint, post, reporter, capture }) => {
      const context = () => fetch(`${endpoint}/context`, { headers })
      expect((await (await context()).json()).publication).toEqual(current)
      expect((await post('/case', pair())).status).toBe(200)
      reporter.setRevision('next-phase')
      expect((await context()).status).toBe(425)
      expect((await post('/case', pair({ revision: 'next-phase' }))).status).toBe(409)
      current = { ...current, revision: 'next-publication-same-content' }
      expect((await (await context()).json()).publication).toEqual(current)
      expect((await post('/case', pair({ revision: 'next-phase' }))).status).toBe(409)
      const installed = { ...syntheticRuntimeInstallation(), publication: current }
      expect((await post('/case', pair({ revision: 'next-phase', runtimeInstallation: installed }))).status).toBe(200)
      expect(capture).toHaveBeenCalledTimes(2)
    }, async () => current)
  })

  it('同阶段 case 与报告不能替换实际安装；跨 HMR 保持同一运行实例', async () => {
    await withReporter(async ({ post, reporter, capture }) => {
      expect((await post('/case', pair())).status).toBe(200)
      const other = syntheticRuntimeInstallation(undefined, 'another-publication')
      expect((await post('/case', pair({ id: 'border-radius', runtimeInstallation: other }))).status).toBe(409)
      expect((await post('/report', { hmrMarker: 'rn-hmr-baseline', cssHmrColor: '#10b981', report: { runId: 'run', revision, platform: 'web', receipts: [receipt(pair())], runtimeInstallation: other } })).status).toBe(409)
      reporter.setRevision('rn-hmr-updated-10b981')
      const next = pair({ revision: 'rn-hmr-updated-10b981', runtimeInstallation: { ...other, runtimeInstanceId: 'different-realm-after-full-reload' } })
      expect((await post('/case', next)).status).toBe(409)
      next.runtimeInstallation = other
      expect((await post('/case', next)).status).toBe(200)
      expect(capture).toHaveBeenCalledTimes(2)
    })
  })

  it('宿主采集回执的安装身份被替换时立即阻断', async () => {
    await withReporter(async ({ post, reporter, capture }) => {
      capture.mockImplementationOnce(async input => ({ ...receipt(input), runtimeInstallation: { ...input.runtimeInstallation, runtimeInstanceId: 'other-host-receipt-runtime-instance' } }))
      expect((await post('/case', pair())).status).toBe(500)
      expect(() => reporter.assertReady()).toThrow('semantic evidence failed')
    })
  })

  it('只有当前认证的唯一 case 获得实际采集预算；旧回执和下一轮不能重用抵扣', async () => {
    let now = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
    try {
      await withReporter(async ({ post, reporter, capture, complete }) => {
        capture.mockImplementation(async (input) => {
          now += 4_000
          return receipt(input)
        })
        for (const invalid of [{ runId: 'old' }, { revision: 'old' }, { id: 'unknown' }, { phase: 'old' }]) {
          expect((await post('/case', pair(invalid))).status).toBe(409)
        }
        expect((await post('/case', pair(), 'unrelated-page')).status).toBe(401)
        expect(reporter.captureElapsed()).toBe(0)
        expect((await post('/case', pair())).status).toBe(200)
        expect(reporter.captureElapsed()).toBe(4_000)
        now += 100_000
        expect((await post('/case', pair())).status).toBe(409)
        expect(reporter.captureElapsed()).toBe(4_000)
        const phases = Object.entries(nativeFixtures).flatMap(([id, fixture]) => (fixture.phases ?? ['default']).map(phase => ({ id, phase })))
        for (const candidate of phases.filter(candidate => candidate.id !== pair().id || candidate.phase !== pair().phase)) {
          expect((await post('/case', pair(candidate))).status).toBe(200)
        }
        expect(reporter.captureElapsed()).toBe(phases.length * 4_000)
        expect(evaluateNativeWait({ now: reporter.captureElapsed() + 120_001, runCompletedAt: 1, startedAt: 0, reportTimeout: 120_000, startupTimeout: 1_800_000, recovered: true, recoveryDelay: 180_000, hostCaptureElapsed: reporter.captureElapsed() }).timedOut).toBe(true)
        expect(complete).not.toHaveBeenCalled()
        reporter.setRevision('rn-hmr-updated-10b981')
        const nextStarted = reporter.captureElapsed()
        expect((await post('/case', pair())).status).toBe(409)
        expect(reporter.captureElapsed() - nextStarted).toBe(0)
        expect((await post('/case', pair({ revision: 'rn-hmr-updated-10b981' }))).status).toBe(200)
        expect(reporter.captureElapsed() - nextStarted).toBe(4_000)
        expect(capture).toHaveBeenCalledTimes(phases.length + 1)
      })
    }
    finally { clock.mockRestore() }
  })

  it('context 不授予身份，其他 Expo 页面不能读取或提交本轮证据', async () => {
    await withReporter(async ({ endpoint, post, reporter, capture, complete }) => {
      expect((await fetch(`${endpoint}/context`)).status).toBe(401)
      for (const route of ['/case', '/report', '/error']) {
        expect((await post(route, pair(), 'unrelated-page')).status).toBe(401)
      }
      expect(capture).not.toHaveBeenCalled()
      expect(complete).not.toHaveBeenCalled()
      const context = await (await fetch(`${endpoint}/context`, { headers })).json()
      expect(context).toEqual({ runId: 'run', fixtureHash: 'fixture', catalogHash: 'catalog', versions: {}, revision })
      expect(() => reporter.assertReady()).not.toThrow()
    })
  })

  it('旧 run、revision、平台与重复 case 都不能再次触发截图或覆盖回执', async () => {
    await withReporter(async ({ post, reporter, capture }) => {
      for (const invalid of [{ runId: 'old' }, { revision: 'old' }, { platform: 'ios' as const }, { id: 'unknown' }, { phase: 'unknown' }]) {
        expect((await post('/case', pair(invalid))).status).toBe(409)
      }
      expect((await post('/case', pair())).status).toBe(200)
      expect((await post('/case', pair())).status).toBe(409)
      expect(capture).toHaveBeenCalledOnce()
      reporter.assertReceipts({ runtimeInstallation: syntheticRuntimeInstallation(), runId: 'run', revision, platform: 'web', receipts: [receipt(pair())] } as ReactNativeReport)
      expect(() => reporter.assertReady()).not.toThrow()
    })
  })

  it('截图尚未完成时拒绝并发与 revision 切换，结束后才允许下一项', async () => {
    await withReporter(async ({ post, reporter, capture }) => {
      let release!: () => void
      let started!: () => void
      const pending = new Promise<void>((resolve) => {
        release = resolve
      })
      const capturing = new Promise<void>((resolve) => {
        started = resolve
      })
      capture.mockImplementationOnce(async (input) => {
        started()
        await pending
        return receipt(input)
      })
      const first = post('/case', pair())
      try {
        await capturing
        expect((await post('/case', pair())).status).toBe(409)
        expect((await post('/case', pair({ id: 'border-radius' }))).status).toBe(409)
        expect(() => reporter.setRevision('next')).toThrow(/pending/)
        expect(capture).toHaveBeenCalledOnce()
      }
      finally { release() }
      expect((await first).status).toBe(200)
      expect((await post('/case', pair({ id: 'border-radius' }))).status).toBe(200)
      expect(capture).toHaveBeenCalledTimes(2)
    })
  })

  it('最终报告只接收已核对回执；重复投递幂等，冲突与旧 revision 不能覆盖文件', async () => {
    await withReporter(async ({ post, reporter, complete }) => {
      const report = { runtimeInstallation: syntheticRuntimeInstallation(), runId: 'run', revision, platform: 'web', receipts: [receipt(pair())] } as ReactNativeReport
      const envelope = { hmrMarker: 'rn-hmr-baseline', cssHmrColor: '#10b981', report }
      expect((await post('/', envelope)).status).toBe(404)
      expect((await post('/report', envelope)).status).toBe(409)
      expect((await post('/case', pair())).status).toBe(200)
      expect((await post('/report', { ...envelope, hmrMarker: 'old' })).status).toBe(409)
      expect((await post('/report', envelope)).status).toBe(204)
      expect((await post('/report', envelope)).status).toBe(204)
      expect((await post('/report', { ...envelope, report: { ...report, verifiedAt: 'changed' } })).status).toBe(409)
      expect((await post('/case', pair({ id: 'border-radius' }))).status).toBe(409)
      expect(complete).toHaveBeenCalledOnce()
      reporter.setRevision('rn-hmr-updated-10b981')
      expect((await post('/report', envelope)).status).toBe(409)
      expect((await post('/case', pair())).status).toBe(409)
      expect((await post('/case', pair({ revision: 'rn-hmr-updated-10b981' }))).status).toBe(200)
      expect(() => reporter.setRevision(revision)).toThrow(/previously used/)
      expect(complete).toHaveBeenCalledOnce()
    })
  })

  it('所属宿主的截图失败仍立即阻断，而非当作可忽略协议请求', async () => {
    await withReporter(async ({ post, reporter, capture }) => {
      capture.mockRejectedValueOnce(new Error('owned screenshot failed'))
      expect((await post('/case', pair())).status).toBe(500)
      expect(() => reporter.assertReady()).toThrow(/semantic evidence failed/)
    })
  })

  it('动态端口保留其他服务，分配完成后释放自己的临时监听器', async () => {
    const unrelated = createServer()
    const owned = createServer()
    await new Promise<void>(resolve => unrelated.listen(0, '127.0.0.1', resolve))
    try {
      const existing = unrelated.address()
      const port = await allocateExpoWebPort()
      expect(port).toBeGreaterThan(0)
      expect(typeof existing === 'object' && existing?.port).not.toBe(port)
      expect(unrelated.listening).toBe(true)
      await new Promise<void>((resolve, reject) => {
        owned.once('error', reject)
        owned.listen(port, '127.0.0.1', resolve)
      })
      expect(owned.listening).toBe(true)
    }
    finally {
      if (owned.listening) {
        await new Promise<void>(resolve => owned.close(() => resolve()))
      }
      await new Promise<void>(resolve => unrelated.close(() => resolve()))
    }
  })
})
