import type { Page } from 'playwright'
import type { FrameworkSourceObservation } from './tailwind-capabilities/framework-source/contract'
import { describe, expect, it, vi } from 'vitest'
import { saveFrameworkSourceAndSettle } from './tailwind-capabilities/framework-source/browser'
import { frameworkSourceContract, sourceCssAssertions, sourceRuntimeAssertions } from './tailwind-capabilities/framework-source/contract'
import { frameworkSource, frameworkSourceCss, frameworkSourceProfiles, sourceCandidate, sourceFrameworks, sourceRevisions } from './tailwind-capabilities/framework-source/fixtures'
import { frameworkSourceResources } from './tailwind-capabilities/framework-source/resources'
import { assertionPassed } from './tailwind-capabilities/report'

const profile = frameworkSourceProfiles.find(profile => profile.id === 'framework/react/conditional')!
const negative = frameworkSourceProfiles.find(profile => profile.id === 'framework/react/interpolation-negative')!
const binding = { runId: 'run', instance: 'server', session: 'document', node: 'react-node' }
const actual: FrameworkSourceObservation = { kind: 'conditional', classes: 'source-probe p-4 w-[123px]', width: 123, padding: 16, active: 'true', marker: 'run/react/added', instance: 'server', session: 'document', node: 'react-node' }
const validCss = '.p-4{padding:16px}.w-\\[123px\\]{width:123px}.w-\\[139px\\]{width:139px}'
const passes = (value: FrameworkSourceObservation, state: 'before' | 'after' | 'restored' = 'before') => sourceRuntimeAssertions(profile, 'added', state, value, binding).every(assertionPassed)

describe('真实框架源码与语义合同', () => {
  it('React与Vue各9种写法真实执行，独占候选不由其它语法或共享source补齐', () => {
    expect(frameworkSourceProfiles).toHaveLength(18)
    for (const framework of sourceFrameworks) {
      const source = frameworkSource(framework, 'added', 'run')
      const css = frameworkSourceCss(framework)
      expect(css).toContain('source(none)')
      expect(css).toContain(`@source "./Probe.${framework === 'react' ? 'tsx' : 'vue'}"`)
      expect(css).not.toContain('inline(')
      expect(source).not.toContain('@source')
      const positive = frameworkSourceProfiles.filter(profile => profile.framework === framework && profile.kind !== 'interpolation-negative')
      const candidates = positive.flatMap(profile => [true, false].map(active => sourceCandidate(profile, 'added', active)))
      expect(new Set(candidates).size).toBe(candidates.length)
      for (const candidate of candidates) {
        expect(source).toContain(candidate)
      }
      const dynamic = frameworkSourceProfiles.find(profile => profile.framework === framework && profile.kind === 'interpolation-negative')!
      for (const active of [true, false]) {
        expect(source).not.toContain(sourceCandidate(dynamic, 'added', active))
      }
      expect(source).toContain('createMerge({ escape: false, unescape: false })')
      expect(source).toContain('createCva({ escape: false, unescape: false })')
      expect(source).toContain('createVariants({ escape: false, unescape: false })')
      expect(source).toContain(framework === 'react' ? 'useState(true)' : 'const active = ref(true)')
      expect(source).toContain(framework === 'react' ? 'onClick={() => setActive(value => !value)}' : '@click="active = !active"')
    }
  })

  it('服务与报告共用完整HTML/入口/图标清单，候选仍只从独占Probe源码扫描', () => {
    for (const framework of sourceFrameworks) {
      const resources = frameworkSourceResources(framework, 'run')
      expect(resources['index.html']).toContain('__FRAMEWORK_INSTANCE__')
      expect(resources['index.html']).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">')
      expect(resources['favicon.svg']).toContain('<svg')
      expect(resources['entry.js']).toContain(`./Probe.${framework === 'react' ? 'tsx' : 'vue'}`)
      expect(resources['entry.css']).toBe(frameworkSourceCss(framework))
      expect(resources['entry.css']).not.toContain('@source "./favicon.svg"')
    }
  })

  it('源码能够实际新增、替换与删除候选，初始和删除态不遗留工具宽度', () => {
    for (const framework of sourceFrameworks) {
      for (const revision of ['initial', 'deleted'] as const) {
        expect(frameworkSource(framework, revision, 'run')).not.toMatch(/w-\[/)
      }
      const added = frameworkSource(framework, 'added', 'run')
      const replaced = frameworkSource(framework, 'replaced', 'run')
      for (const item of frameworkSourceProfiles.filter(profile => profile.framework === framework && profile.kind !== 'interpolation-negative')) {
        for (const active of [true, false]) {
          expect(added).toContain(sourceCandidate(item, 'added', active))
          expect(replaced).not.toContain(sourceCandidate(item, 'added', active))
          expect(replaced).toContain(sourceCandidate(item, 'replaced', active))
        }
      }
    }
  })

  it('错误样式、被丢弃类名、错误分支、旧缓存、替换DOM或页面不能通过', () => {
    expect(passes(actual)).toBe(true)
    for (const patch of [{ width: 80 }, { padding: 0 }, { classes: 'source-probe p-4' }, { classes: `${actual.classes} w-[91px]` }, { active: 'false' }, { marker: 'old/react/added' }, { instance: 'foreign-server' }, { session: 'new-document' }, { node: 'replaced-node' }, { kind: 'other' }]) {
      expect(passes({ ...actual, ...patch }), JSON.stringify(patch)).toBe(false)
    }
    expect(passes(actual, 'after')).toBe(false)
    const after = { ...actual, classes: 'source-probe p-4 w-[139px]', width: 139, active: 'false' }
    expect(passes(after, 'after')).toBe(true)
    expect(passes(after, 'restored')).toBe(false)
    expect(passes(actual, 'restored')).toBe(true)
  })

  it('空CSS、部分候选、后续覆盖及动态候选意外生成均不能通过', () => {
    expect(sourceCssAssertions(profile, 'added', validCss).every(assertionPassed)).toBe(true)
    expect(sourceCssAssertions(profile, 'added', '').every(assertionPassed)).toBe(false)
    expect(sourceCssAssertions(profile, 'added', '.p-4{padding:16px}.w-\\[123px\\]{width:123px}').every(assertionPassed)).toBe(false)
    expect(sourceCssAssertions(profile, 'added', `${validCss}.w-\\[123px\\]{width:999px}`).every(assertionPassed)).toBe(false)
    expect(sourceCssAssertions(negative, 'added', '.p-4{padding:16px}').every(assertionPassed)).toBe(true)
    expect(sourceCssAssertions(negative, 'added', '.p-4{padding:16px}.w-\\[363px\\]{width:363px}').every(assertionPassed)).toBe(false)
    const dynamic = { ...actual, kind: 'interpolation-negative', classes: 'source-probe p-4 w-[363px]', width: 80 }
    expect(sourceRuntimeAssertions(negative, 'added', 'before', dynamic, binding).every(assertionPassed)).toBe(true)
    expect(sourceRuntimeAssertions(negative, 'added', 'before', { ...dynamic, classes: 'source-probe p-4' }, binding).every(assertionPassed)).toBe(false)
    expect(sourceRuntimeAssertions(negative, 'added', 'before', { ...dynamic, width: 363 }, binding).every(assertionPassed)).toBe(false)
  })

  it('每个分支、恢复和源码版本都登记必需断言，不把源码刷新当generic HMR', () => {
    const contract = frameworkSourceContract(profile)
    for (const revision of sourceRevisions) {
      for (const state of ['before', 'after', 'restored']) {
        expect(contract.requiredAssertions).toContain(`${revision}/${state}/node`)
        expect(contract.requiredAssertions).toContain(`${revision}/${state}/classes`)
        expect(contract.requiredAssertions).toContain(`${revision}/${state}/width`)
      }
      expect(contract.requiredAssertions).toContain(`${revision}/refresh-session`)
      expect(contract.assertionStages![`${revision}/css-generated`]).toBe('generation')
    }
    expect(contract.features).not.toContain('hmr')
    expect(new Set(contract.requiredAssertions).size).toBe(contract.requiredAssertions.length)
    expect(frameworkSourceContract(negative).assertionStages!['added/css-excluded']).toBe('negative')
  })
})

describe('真实框架自动更新与明确刷新边界', () => {
  it('React在保存前登记自动导航，完整导航和marker完成前不能继续明确刷新', async () => {
    const events: string[] = []
    let completeNavigation!: () => void
    const navigation = new Promise<void>((resolve) => {
      completeNavigation = resolve
    })
    const page = { waitForNavigation: vi.fn(() => {
      events.push('navigation-armed')
      return navigation
    }), waitForFunction: vi.fn(async (_predicate, marker) => {
      events.push(`marker:${marker}`)
    }), waitForLoadState: vi.fn(async () => {
      events.push('idle')
    }), reload: vi.fn(async () => {
      events.push('explicit-refresh')
    }) } as unknown as Page
    const saving = saveFrameworkSourceAndSettle(page, 'react', 'added', 'run', async () => {
      events.push('saved')
      return 'source'
    }).then(async (source) => {
      await page.reload()
      return source
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(events).toEqual(['navigation-armed', 'saved'])
    expect(page.reload).not.toHaveBeenCalled()
    completeNavigation()
    await expect(saving).resolves.toBe('source')
    expect(events).toEqual(['navigation-armed', 'saved', 'marker:run/react/added', 'idle', 'explicit-refresh'])
    expect(page.waitForNavigation).toHaveBeenCalledExactlyOnceWith({ waitUntil: 'networkidle', timeout: 15_000 })
  })

  it('Vue等待实际SFC marker和网络空闲，不把保存完成当页面已经更新', async () => {
    const events: string[] = []
    let completeMarker!: () => void
    let completeIdle!: () => void
    const marker = new Promise<void>((resolve) => {
      completeMarker = resolve
    })
    const idle = new Promise<void>((resolve) => {
      completeIdle = resolve
    })
    const page = { waitForNavigation: vi.fn(), waitForFunction: vi.fn((_predicate, value) => {
      events.push(`marker-armed:${value}`)
      return marker
    }), waitForLoadState: vi.fn(() => {
      events.push('idle-armed')
      return idle
    }), reload: vi.fn(async () => {
      events.push('explicit-refresh')
    }) } as unknown as Page
    const saving = saveFrameworkSourceAndSettle(page, 'vue', 'replaced', 'run', async () => {
      events.push('saved')
      return 'source'
    }).then(() => page.reload())
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(events).toEqual(['marker-armed:run/vue/replaced', 'saved'])
    completeMarker()
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(events).toEqual(['marker-armed:run/vue/replaced', 'saved', 'idle-armed'])
    expect(page.reload).not.toHaveBeenCalled()
    completeIdle()
    await saving
    expect(events.at(-1)).toBe('explicit-refresh')
    expect(page.waitForNavigation).not.toHaveBeenCalled()
  })

  it('自动导航失败不能继续明确刷新或把旧marker当本轮成功', async () => {
    const page = { waitForNavigation: vi.fn(async () => {
      throw new Error('automatic navigation failed')
    }), waitForFunction: vi.fn(), waitForLoadState: vi.fn(), reload: vi.fn() } as unknown as Page
    await expect(saveFrameworkSourceAndSettle(page, 'react', 'deleted', 'run', async () => 'source').then(() => page.reload())).rejects.toThrow('automatic navigation failed')
    expect(page.waitForFunction).not.toHaveBeenCalled()
    expect(page.waitForLoadState).not.toHaveBeenCalled()
    expect(page.reload).not.toHaveBeenCalled()
  })
})
