import { describe, expect, it, vi } from 'vitest'
import { createRuntimeClassSetInvalidationPlugin } from '@/bundlers/vite/runtime-class-set/invalidation-plugin'
import { isSourceCandidateRequest } from '@/bundlers/vite/source-candidates'

function handler(hook: any) {
  return typeof hook === 'function' ? hook : hook.handler
}

describe('runtime invalidation lifecycle', () => {
  it.each([
    '/pages/index.uvue',
    'C:\\project\\pages\\index.uvue',
    'C:\\index.nvue?vue&type=template',
    'pages/index.uvue?vue&type=script',
    '/theme.css',
    'C:\\tailwind.config.ts',
  ])('invalidates %s without doing refresh work in the hook', async (id) => {
    const invalidate = vi.fn()
    const plugin = createRuntimeClassSetInvalidationPlugin({ invalidate, isEnabled: () => true, isRelevant: isSourceCandidateRequest })
    expect(plugin.enforce).toBe('pre')
    expect(plugin.handleHotUpdate).toMatchObject({ order: 'pre' })
    await handler(plugin.watchChange)(id)
    expect(invalidate).toHaveBeenCalledTimes(1)
    await handler(plugin.handleHotUpdate)({ file: id })
    expect(invalidate).toHaveBeenCalledTimes(2)
  })

  it('ignores disabled plugins and unrelated files', () => {
    let enabled = false
    const invalidate = vi.fn()
    const plugin = createRuntimeClassSetInvalidationPlugin({ invalidate, isEnabled: () => enabled, isRelevant: isSourceCandidateRequest })
    handler(plugin.watchChange)('/page.uvue')
    enabled = true
    handler(plugin.watchChange)('/image.png')
    expect(invalidate).not.toHaveBeenCalled()
  })
})
