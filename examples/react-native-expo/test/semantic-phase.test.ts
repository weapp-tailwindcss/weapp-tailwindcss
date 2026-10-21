// @vitest-environment jsdom
import type { ReactNode } from 'react'
import type { NativePairEvidence } from '../src/compatibility/protocol'
import { createRequire } from 'node:module'
import { setManifest } from '@weapp-tailwindcss/react-native/runtime'
import { act, createElement } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SemanticRun } from '../src/compatibility/SemanticRun'
import { nativeImageFixture } from '../src/compatibility/image-fixture'

const imageLoads = vi.hoisted(() => [] as Array<{ onLoad: (event: unknown) => void, onError: (event: unknown) => void }>)
const { createRoot } = createRequire(import.meta.url)('react-dom/client') as {
  createRoot: (node: Element) => { render: (node: ReactNode) => void, unmount: () => void }
}

vi.mock('react-native', async () => {
  const { createElement, forwardRef, useEffect, useImperativeHandle, useMemo } = await import('react')
  const flatten = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
  const View = forwardRef(({ style, testID, children }: { style?: unknown, testID?: string, children?: ReactNode }, ref) => {
    useImperativeHandle(ref, () => ({ measureInWindow: (callback: (...rect: number[]) => void) => callback(0, 0, 80, 40) }))
    return createElement('div', { 'style': flatten(style), 'data-testid': testID }, children)
  })
  const Image = forwardRef(({ onLoad, onError }: { onLoad: (event: unknown) => void, onError: (event: unknown) => void }, ref) => {
    const host = useMemo(() => {
      const image = { tagName: 'IMG', isConnected: true, complete: true, naturalWidth: 16, naturalHeight: 8, currentSrc: nativeImageFixture.uri, src: nativeImageFixture.uri, decode: async () => {} }
      return { isConnected: true, querySelectorAll: () => [image], measureInWindow: (callback: (...rect: number[]) => void) => callback(0, 0, 44, 44) }
    }, [])
    useImperativeHandle(ref, () => host, [host])
    useEffect(() => { imageLoads.push({ onLoad, onError }) }, [onLoad, onError])
    return createElement('img')
  })
  return { View, Text: View, Image, StyleSheet: { flatten }, Platform: { OS: 'web', Version: 'test' }, Dimensions: { get: () => ({ width: 402, height: 874 }) }, PixelRatio: { get: () => 1 } }
})

const oldPublication = { revision: 'old-installation', manifestSha256: 'a'.repeat(64) }
const nextPublication = { revision: 'next-installation', manifestSha256: 'b'.repeat(64) }
const context = { runId: 'owned-run', revision: 'next-phase', publication: nextPublication, fixtureHash: 'fixture', catalogHash: 'catalog', versions: {} }
const evidence = {
  schemaVersion: 2,
  fixtureHash: 'fixture',
  cases: [{ id: 'background-color', className: 'phase-color' }],
  report: { schemaVersion: 2, catalogHash: 'catalog', versions: {}, results: [{ id: 'background-color', generated: true, encoded: true, warnings: [], checkpoints: [] }] },
}
let root: ReturnType<typeof createRoot>
let container: HTMLDivElement

function install(publication: typeof oldPublication, color: string) {
  setManifest({ version: 1, classSet: ['phase-color'], variables: {}, warnings: [], rules: { 'phase-color': [{ style: { backgroundColor: color } }] } }, publication)
}

beforeEach(() => {
  imageLoads.length = 0
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubEnv('EXPO_PUBLIC_RN_REPORT_URL', 'http://owned-host')
  vi.stubEnv('EXPO_PUBLIC_RN_REPORT_CLIENT', 'owned-client')
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  install(oldPublication, '#ff0000')
})

it('Image 三侧真实加载前不采集；就绪后提交独立 phase，不以 View 尺寸兜底', async () => {
  const complete = vi.fn()
  const pairs: NativePairEvidence[] = []
  setManifest({ version: 1, classSet: ['phase-size'], variables: {}, warnings: [], rules: { 'phase-size': [{ style: { width: 44, height: 44 } }] } }, nextPublication)
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/context')) return { ok: true, json: async () => context }
    const pair = JSON.parse(String(options?.body)) as NativePairEvidence
    pairs.push(pair)
    return { ok: true, json: async () => ({ ...pair, checkpoints: [], artifact: { name: 'owned.png', sha256: 'c'.repeat(64), byteLength: 1 } }) }
  }))
  const imageEvidence = { ...evidence, cases: [{ id: 'sizing-size', className: 'phase-size' }], report: { ...evidence.report, results: [{ ...evidence.report.results[0]!, id: 'sizing-size' }] } }
  await act(async () => root.render(createElement(SemanticRun, { evidence: imageEvidence, revision: 'next-phase', onComplete: complete })))
  await act(async () => vi.advanceTimersByTimeAsync(350))
  expect(pairs.map(pair => pair.phase)).toEqual(['default'])
  expect(imageLoads).toHaveLength(3)
  await act(async () => vi.advanceTimersByTimeAsync(350))
  expect(pairs).toHaveLength(1)
  expect(complete).not.toHaveBeenCalled()
  for (const callback of imageLoads) callback.onLoad({ nativeEvent: { type: 'load', isTrusted: true, target: null } })
  await act(async () => vi.advanceTimersByTimeAsync(350))
  expect(pairs.map(pair => pair.phase)).toEqual(['default', 'image'])
  expect(pairs[1]!.image?.loads).toHaveLength(3)
  expect(pairs[1]!.image?.loads.every(load => load.uri === nativeImageFixture.uri && load.revision === 'next-phase')).toBe(true)
  expect(imageLoads).toHaveLength(3)
  expect(complete).toHaveBeenCalledOnce()
})

it('后置 Image 失败保留前序案例和同例 default 的已完成证据，后序案例仍未执行', async () => {
  const complete = vi.fn()
  setManifest({ version: 1, classSet: ['phase-color', 'phase-size'], variables: {}, warnings: [], rules: { 'phase-color': [{ style: { backgroundColor: '#123456' } }], 'phase-size': [{ style: { width: 44, height: 44 } }] } }, nextPublication)
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/context')) return { ok: true, json: async () => context }
    if (url.endsWith('/error')) return { ok: true }
    const pair = JSON.parse(String(options?.body)) as NativePairEvidence
    return { ok: true, json: async () => ({ ...pair, checkpoints: ['geometry', 'pixel', 'control'].map(kind => ({ name: `runtime:${pair.phase}:${kind}`, passed: true })), artifact: { name: 'owned.png', sha256: 'c'.repeat(64), byteLength: 1 } }) }
  }))
  const cases = [{ id: 'background-color', className: 'phase-color' }, { id: 'sizing-size', className: 'phase-size' }, { id: 'border-radius', className: 'phase-radius' }]
  const input = { ...evidence, cases, report: { ...evidence.report, results: cases.map(item => ({ ...evidence.report.results[0]!, id: item.id, status: 'unverified' })) } }
  await act(async () => root.render(createElement(SemanticRun, { evidence: input, revision: 'next-phase', onComplete: complete })))
  await act(async () => vi.advanceTimersByTimeAsync(350))
  await act(async () => vi.advanceTimersByTimeAsync(350))
  expect(imageLoads).toHaveLength(3)
  await act(async () => imageLoads[0]!.onError({ nativeEvent: { error: 'owned-image-decode-failure' } }))
  expect(complete).toHaveBeenCalledOnce()
  const report = complete.mock.calls[0]![0]
  expect(report.receipts).toHaveLength(2)
  expect(report.results[0]).toMatchObject({ id: 'background-color', status: 'supported' })
  expect(report.results[1]).toMatchObject({ id: 'sizing-size', status: 'failed', reason: expect.stringContaining('owned-image-decode-failure') })
  expect(report.results[1].checkpoints).toContainEqual(expect.objectContaining({ name: 'runtime:default:style', passed: true }))
  expect(report.results[2]).toMatchObject({ id: 'border-radius', status: 'unverified' })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it.each(['marker-first', 'publication-first'] as const)('%s 必须先提交匹配实际安装的渲染，再采集节点和样式', async (order) => {
  const complete = vi.fn()
  const pairs: NativePairEvidence[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/context')) {
      return { ok: true, status: 200, json: async () => context }
    }
    const pair = JSON.parse(String(options?.body)) as NativePairEvidence
    pairs.push(pair)
    return { ok: true, json: async () => ({ ...pair, checkpoints: [], artifact: { name: 'owned.png', sha256: 'c'.repeat(64), byteLength: 1 } }) }
  }))
  if (order === 'publication-first') {
    install(nextPublication, '#123456')
  }
  await act(async () => root.render(createElement(SemanticRun, { evidence, revision: 'next-phase', onComplete: complete })))
  if (order === 'marker-first') {
    expect(pairs).toHaveLength(0)
    // 只推进真实 runtime，不靠父组件重新渲染掩盖旧闭包。
    install(nextPublication, '#123456')
    await act(async () => vi.advanceTimersByTimeAsync(100))
  }
  await act(async () => vi.advanceTimersByTimeAsync(350))
  expect(pairs).toHaveLength(1)
  expect(pairs[0]!.runtimeInstallation.publication).toEqual(nextPublication)
  expect(complete).toHaveBeenCalledOnce()
  const report = complete.mock.calls[0]![0]
  expect(report.results[0].checkpoints).toContainEqual(expect.objectContaining({ name: 'runtime:default:style', passed: true }))
  expect(container.querySelector('[data-testid="tw-rn-case-probe"]')?.firstElementChild?.getAttribute('style')).toContain('rgb(18, 52, 86)')
})

it('等待安装的旧阶段卸载后，不得产生迟到 case、错误或最终报告', async () => {
  const complete = vi.fn()
  let release!: (value: unknown) => void
  const contextResponse = new Promise(resolve => release = resolve)
  const fetch = vi.fn().mockReturnValue(contextResponse)
  vi.stubGlobal('fetch', fetch)
  await act(async () => root.render(createElement(SemanticRun, { evidence, revision: 'next-phase', onComplete: complete })))
  await act(async () => root.render(null))
  install(nextPublication, '#123456')
  await act(async () => {
    release({ ok: true, status: 200, json: async () => context })
    await vi.advanceTimersByTimeAsync(1_000)
  })
  expect(fetch).toHaveBeenCalledOnce()
  expect(complete).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('旧阶段已提交 case 后卸载，迟到回执也不得提交最终报告或错误', async () => {
  install(nextPublication, '#123456')
  const complete = vi.fn()
  let reject!: (reason: Error) => void
  const pendingCase = new Promise((_resolve, fail) => reject = fail)
  const fetch = vi.fn((url: string) => url.endsWith('/context')
    ? Promise.resolve({ ok: true, status: 200, json: async () => context })
    : pendingCase)
  vi.stubGlobal('fetch', fetch)
  await act(async () => root.render(createElement(SemanticRun, { evidence, revision: 'next-phase', onComplete: complete })))
  await act(async () => vi.advanceTimersByTimeAsync(350))
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/case'))).toHaveLength(1)
  await act(async () => root.render(null))
  await act(async () => {
    reject(new Error('old-case-failed-after-unmount'))
    await vi.advanceTimersByTimeAsync(1_000)
  })
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/error'))).toHaveLength(0)
  expect(complete).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('已读合法 context 后实际安装缺失，将原始门禁错误交付所属 run 而非等待超时', async () => {
  const complete = vi.fn()
  const fetch = vi.fn(async (url: string, _options?: RequestInit) => {
    if (url.endsWith('/context')) {
      return { ok: true, status: 200, json: async () => {
        setManifest({ version: 1, classSet: [], variables: {}, warnings: [], rules: {} })
        return context
      } }
    }
    return { ok: true }
  })
  vi.stubGlobal('fetch', fetch)
  await act(async () => root.render(createElement(SemanticRun, { evidence, revision: 'next-phase', onComplete: complete })))
  const errors = fetch.mock.calls.filter(([url]) => url.endsWith('/error'))
  expect(errors).toHaveLength(1)
  expect(JSON.parse(String(errors[0]![1]?.body))).toEqual(expect.objectContaining({ runId: 'owned-run', revision: 'next-phase', message: expect.stringContaining('缺少稳定发布身份') }))
  expect(complete).not.toHaveBeenCalled()
})
