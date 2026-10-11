import { describe, expect, it, vi } from 'vitest'
import { ensureMiniProgramLiveMarker, relaunchMiniProgramPage } from '../scripts/demo-visual-e2e-report/cases'
import { isThemeTargetVisible } from '../scripts/demo-visual-e2e-report/theme-capture'

vi.mock('./frameworkIdeLivePage.ts', () => ({
  getDevToolsRelaunchTimeoutMs: () => 1000,
  readPageLiveContent: async (page: { content?: string } | undefined) => page?.content ?? '',
}))

describe('mini-program visual live evidence', () => {
  function options(page: { content?: string } | undefined, timeoutMs: number) {
    return {
      marker: 'current-save-marker',
      miniProgram: {},
      name: 'test-case',
      options: { timeoutMs, pollMs: 1 } as any,
      page,
      port: 9420,
      projectPath: '',
      route: '/pages/index/index',
      session: { ensureRunning: vi.fn() } as any,
      timeoutMs,
    }
  }

  it('requires the current marker in the existing runtime', async () => {
    const input = options({ content: 'current-save-marker' }, 1000)
    const result = await ensureMiniProgramLiveMarker(input)
    expect(result.content).toBe('current-save-marker')
    expect(result.miniProgram).toBe(input.miniProgram)
    expect(result.liveReadStatus).toBe('live')
  })

  it('propagates relaunch failure without replacing the runtime', async () => {
    const failure = new Error('DevTools did not respond within timeout')
    const miniProgram = {
      currentPage: vi.fn().mockResolvedValue({ path: 'previous-page' }),
      reLaunch: vi.fn().mockRejectedValue(failure),
      close: vi.fn(),
    }
    await expect(relaunchMiniProgramPage({
      ...options(undefined, 1000),
      miniProgram,
    })).rejects.toBe(failure)
    expect(miniProgram.close).not.toHaveBeenCalled()
  })

  it.each([undefined, { content: 'previous-save-marker' }])('rejects missing or stale runtime evidence', async (page) => {
    await expect(ensureMiniProgramLiveMarker(options(page, 0))).rejects.toThrow('live page marker was not visible')
  })
})

describe('theme screenshot visibility', () => {
  const visible = { rootRect: null, manualRect: { left: 10, top: 40, width: 80, height: 30 }, windowWidth: 100, windowHeight: 100 }
  it('requires the target rectangle inside the current viewport', () => {
    expect(isThemeTargetVisible(visible)).toBe(true)
    expect(isThemeTargetVisible({ ...visible, manualRect: { ...visible.manualRect, top: 830 } })).toBe(false)
    expect(isThemeTargetVisible({ ...visible, manualRect: { ...visible.manualRect, width: 0 } })).toBe(false)
    expect(isThemeTargetVisible({ ...visible, manualRect: null })).toBe(false)
  })
})
