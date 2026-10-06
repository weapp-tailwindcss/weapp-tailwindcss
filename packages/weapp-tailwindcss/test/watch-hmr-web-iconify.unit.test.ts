import type { Page } from 'playwright'
import type { CliOptions, IconifyHotUpdatePayload, WatchCase, WebHmrConfig } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeWatchedFilePreserveEol } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import { runWebIconifyHmr } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/web/iconify'

vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text')>()
  return { ...original, writeWatchedFilePreserveEol: vi.fn() }
})

const legacyBefore = 'before:content-[\'现在，让我们开始神奇的_tailwindcss_开发之旅吧！\']'
const legacyAfter = 'before:content-[\'现在，让我们继续神奇的_tailwindcss_HMR_回归之旅吧！\']'
const icons = ['i-[mdi--github-circle]', 'i-[mdi--star]', 'i-[svg-spinners--180-ring-with-bg]']
const source = 'export const demo = true\n'
const options = { timeoutMs: 40, pollMs: 1 } as CliOptions
const watchCase = { label: 'unit/web-iconify', name: 'web-iconify' } as WatchCase

function selector(token: string) {
  return `.${token.replace(/[^\w-]/gu, character => `\\${character}`)}`
}

function stylesheet(tokens: string[]) {
  return tokens.map(token => `${selector(token)} { --tw-content: 'sample'; }`).join('\n')
}

function createFixture() {
  let style = stylesheet([...icons, legacyBefore, legacyAfter])
  let payload: IconifyHotUpdatePayload | undefined
  const page = {
    evaluate: vi.fn(async (_callback: unknown, tokens?: string[]) => tokens ? tokens.map(selector) : style),
  } as unknown as Page
  const config = {
    sourceFile: 'index.tsx',
    iconifyHmr: {
      mutate(original: string, next: IconifyHotUpdatePayload) {
        payload = next
        return `${original}\n// ${next.classLiteral}\n`
      },
    },
  } as WebHmrConfig
  return {
    page,
    config,
    getPayload: () => payload!,
    setStyle: (tokens: string[]) => { style = stylesheet(tokens) },
  }
}

beforeEach(() => vi.resetAllMocks())

describe('web Iconify HMR freshness', () => {
  it('rejects a page that only retains pre-generated before and after selectors', async () => {
    const fixture = createFixture()
    const settled = vi.fn(async () => {})

    await expect(runWebIconifyHmr(watchCase, options, fixture.page, fixture.config, source, settled))
      .rejects
      .toThrow('probe did not generate expected CSS')

    expect(settled).not.toHaveBeenCalled()
    expect(writeWatchedFilePreserveEol).toHaveBeenCalledTimes(1)
  })

  it('rejects stale content after a successful fresh probe injection', async () => {
    const fixture = createFixture()
    vi.mocked(writeWatchedFilePreserveEol).mockImplementation(async () => {
      fixture.setStyle([...icons, fixture.getPayload().beforeContentClass, legacyAfter])
    })
    const settled = vi.fn(async () => {})

    await expect(runWebIconifyHmr(watchCase, options, fixture.page, fixture.config, source, settled))
      .rejects
      .toThrow('content update did not preserve icon CSS')

    expect(settled).toHaveBeenCalledTimes(1)
    expect(writeWatchedFilePreserveEol).toHaveBeenCalledTimes(2)
  })

  it('accepts each saved content class only after it reaches the page stylesheet', async () => {
    const fixture = createFixture()
    const savedSources: string[] = []
    vi.mocked(writeWatchedFilePreserveEol).mockImplementation(async (_file, next) => {
      savedSources.push(next)
      const payload = fixture.getPayload()
      fixture.setStyle([...icons, savedSources.length === 1 ? payload.beforeContentClass : payload.afterContentClass])
    })
    const settled = vi.fn(async () => {})

    const result = await runWebIconifyHmr(watchCase, options, fixture.page, fixture.config, source, settled)

    expect(result?.beforeContentClass).not.toBe(legacyBefore)
    expect(result?.afterContentClass).not.toBe(legacyAfter)
    expect(savedSources[0]).toContain(result?.beforeContentClass)
    expect(savedSources[0]).not.toContain(result?.afterContentClass)
    expect(savedSources[1]).toContain(result?.afterContentClass)
    expect(savedSources[1]).not.toContain(result?.beforeContentClass)
    expect(result?.verifiedContentCssIncludes).toEqual([selector(result!.afterContentClass)])
    expect(settled).toHaveBeenNthCalledWith(1, expect.any(Number), 'iconify inject')
    expect(settled).toHaveBeenNthCalledWith(2, expect.any(Number), 'iconify content')
    expect(result?.marker).toContain(`tw-watch-web-iconify-${watchCase.name}-`)
  })

  it('rejects an already generated probe before writing source', async () => {
    const fixture = createFixture()
    fixture.config.iconifyHmr!.mutate = (original, payload) => {
      fixture.setStyle([...icons, payload.beforeContentClass])
      return `${original}\n// ${payload.classLiteral}\n`
    }

    await expect(runWebIconifyHmr(watchCase, options, fixture.page, fixture.config, source, async () => {}))
      .rejects
      .toThrow('baseline already contains this run')

    expect(writeWatchedFilePreserveEol).not.toHaveBeenCalled()
  })

  it('rejects an after selector generated before the content save', async () => {
    const fixture = createFixture()
    vi.mocked(writeWatchedFilePreserveEol).mockImplementation(async () => {
      const payload = fixture.getPayload()
      fixture.setStyle([...icons, payload.beforeContentClass, payload.afterContentClass])
    })

    await expect(runWebIconifyHmr(watchCase, options, fixture.page, fixture.config, source, async () => {}))
      .rejects
      .toThrow('before content update already contains this run')

    expect(writeWatchedFilePreserveEol).toHaveBeenCalledTimes(1)
  })

  it.each(['iconify inject', 'iconify content'])('rechecks the live stylesheet after %s settles', async (lostPhase) => {
    const fixture = createFixture()
    vi.mocked(writeWatchedFilePreserveEol).mockImplementation(async (_file, next) => {
      const payload = fixture.getPayload()
      fixture.setStyle([...icons, next.includes(payload.afterContentClass) ? payload.afterContentClass : payload.beforeContentClass])
    })
    const settled = async (_at: number, phase: string) => {
      if (phase === lostPhase) {
        fixture.setStyle([...icons, legacyBefore, legacyAfter])
      }
    }

    await expect(runWebIconifyHmr(watchCase, options, fixture.page, fixture.config, source, settled))
      .rejects
      .toThrow('after compile settled missing content CSS selector')
  })

  it('includes compilation settlement in the reported effective duration', async () => {
    const fixture = createFixture()
    vi.mocked(writeWatchedFilePreserveEol).mockImplementation(async (_file, next) => {
      const payload = fixture.getPayload()
      fixture.setStyle([...icons, next.includes(payload.afterContentClass) ? payload.afterContentClass : payload.beforeContentClass])
    })
    let settledAt = 0
    let phaseStartedAt = 0
    const settled = async (at: number, phase: string) => {
      if (phase === 'iconify content') {
        await new Promise(resolve => setTimeout(resolve, 15))
        phaseStartedAt = at
        settledAt = Date.now()
      }
    }

    const result = await runWebIconifyHmr(watchCase, options, fixture.page, fixture.config, source, settled)

    expect(result!.hotUpdateEffectiveMs).toBeGreaterThanOrEqual(settledAt - phaseStartedAt)
    expect(result!.hotUpdateEffectiveMs).toBeGreaterThan(0)
  })

  it('rejects a custom mutation that preloads both phases', async () => {
    const fixture = createFixture()
    fixture.config.iconifyHmr!.mutate = (original, payload) => `${original}\n// ${payload.classLiteral} ${payload.afterContentClass}\n`

    await expect(runWebIconifyHmr(watchCase, options, fixture.page, fixture.config, source, async () => {}))
      .rejects
      .toThrow('must contain only the inject content class')

    expect(writeWatchedFilePreserveEol).not.toHaveBeenCalled()
  })

  it('retains configured content and uses a different marker on a subsequent run', async () => {
    const fixture = createFixture()
    fixture.config.iconifyHmr!.beforeContentClass = 'after:content-["first_label"]'
    fixture.config.iconifyHmr!.afterContentClass = 'after:content-["second_label"]'
    vi.mocked(writeWatchedFilePreserveEol).mockImplementation(async (_file, next) => {
      const payload = fixture.getPayload()
      fixture.setStyle([...icons, next.includes(payload.afterContentClass) ? payload.afterContentClass : payload.beforeContentClass])
    })

    const first = await runWebIconifyHmr(watchCase, options, fixture.page, fixture.config, source, async () => {})
    const second = await runWebIconifyHmr(watchCase, options, fixture.page, fixture.config, source, async () => {})

    expect(first?.beforeContentClass).toMatch(/^after:content-\["first_label_tw-watch-web-iconify-/)
    expect(first?.afterContentClass).toMatch(/^after:content-\["second_label_tw-watch-web-iconify-/)
    expect(first?.marker).not.toBe(second?.marker)
  })

  it('preserves the default TSX comment carrier while requiring fresh stylesheet output', async () => {
    const fixture = createFixture()
    delete fixture.config.iconifyHmr!.mutate
    const savedSources: string[] = []
    vi.mocked(writeWatchedFilePreserveEol).mockImplementation(async (_file, next) => {
      savedSources.push(next)
      const contentClass = next.match(/before:content-\['[^']+'\]/u)![0]
      fixture.setStyle([...icons, contentClass])
    })

    const result = await runWebIconifyHmr(watchCase, options, fixture.page, fixture.config, source, async () => {})

    expect(result?.verifiedContentCssIncludes).toEqual([selector(result!.afterContentClass)])
    expect(savedSources).toHaveLength(2)
    expect(savedSources.every(next => next.startsWith(`${source}\n// `))).toBe(true)
  })
})
