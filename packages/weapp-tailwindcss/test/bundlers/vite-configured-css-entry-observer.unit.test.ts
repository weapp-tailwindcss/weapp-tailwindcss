import { afterEach, describe, expect, it, vi } from 'vitest'
import { createConfiguredCssEntryObserver } from '@/bundlers/vite/shared/configured-css-entry-observer'

describe('vite configured css entry observer', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not report configured entries that entered the module graph', () => {
    vi.useFakeTimers()
    const onMissing = vi.fn()
    const observer = createConfiguredCssEntryObserver({
      delayMs: 10,
      getEntries: () => ['/project/main.css'],
      getRoot: () => '/project',
      onMissing,
    })

    observer.requestCheck()
    observer.observe('/@fs/project/main.css?direct')
    vi.advanceTimersByTime(10)

    expect(onMissing).not.toHaveBeenCalled()
  })

  it('reports unobserved entries once after local style generation settles', () => {
    vi.useFakeTimers()
    const onMissing = vi.fn()
    const observer = createConfiguredCssEntryObserver({
      delayMs: 10,
      getEntries: () => ['/project/main.css', '/project/theme.css'],
      getRoot: () => '/project',
      onMissing,
    })

    observer.observe('/project/main.css')
    observer.requestCheck()
    vi.advanceTimersByTime(10)
    observer.requestCheck()
    observer.flush()

    expect(onMissing).toHaveBeenCalledTimes(1)
    expect(onMissing).toHaveBeenCalledWith(['/project/theme.css'])
  })

  it('accepts configured entries inlined by an SFC style preprocessor', () => {
    vi.useFakeTimers()
    const onMissing = vi.fn()
    const observer = createConfiguredCssEntryObserver({
      delayMs: 10,
      getEntries: () => ['/project/main.css', '/project/main.iconify.css'],
      getRoot: () => '/project',
      onMissing,
    })

    observer.observeSourceImports([
      '@import "../main.css";',
      '@import url(\'../main.iconify.css\');',
    ].join('\n'), '/project/src/App.uvue')
    observer.requestCheck()
    vi.advanceTimersByTime(10)

    expect(onMissing).not.toHaveBeenCalled()
  })

  it('resolves Windows SFC imports without treating module ids as POSIX paths', () => {
    vi.useFakeTimers()
    const onMissing = vi.fn()
    const observer = createConfiguredCssEntryObserver({
      delayMs: 10,
      getEntries: () => ['C:\\project\\main.css'],
      getRoot: () => 'C:\\project',
      onMissing,
    })

    observer.observeSourceImports('@import "..\\\\main.css";', 'C:\\project\\src\\App.uvue')
    observer.requestCheck()
    vi.advanceTimersByTime(10)

    expect(onMissing).not.toHaveBeenCalled()
  })
})
