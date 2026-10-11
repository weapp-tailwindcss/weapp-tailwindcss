import { describe, expect, it, vi } from 'vitest'
import { createCompilationEventBus, createCompilerRuntimeState } from '../../src/compiler'

describe('compiler lifecycle protocol', () => {
  it('serializes events and advances a shared revision', async () => {
    const bus = createCompilationEventBus()
    const received: string[] = []
    const unsubscribe = bus.subscribe(async (event) => {
      received.push(event.type)
    })

    await expect(bus.emit({ type: 'source-updated', id: 'a.ts', source: 'export {}' })).resolves.toBe(1)
    await expect(bus.emit({ type: 'hot-update', id: 'a.ts', mutation: 'script' })).resolves.toBe(2)
    expect(bus.revision).toBe(2)
    expect(received).toEqual(['source-updated', 'hot-update'])

    unsubscribe()
    await bus.emit({ type: 'source-removed', id: 'a.ts' })
    expect(received).toEqual(['source-updated', 'hot-update'])
    bus.clear()
  })

  it('keeps legacy runtime fields while exposing a disposable state owner', () => {
    const tailwindRuntime = {
      packageInfo: { name: 'tailwindcss', version: '4.0.0', rootPath: '', packageJsonPath: '', packageJson: {} },
      majorVersion: 4,
      getClassSet: vi.fn(() => new Set<string>()),
      extract: vi.fn(() => ({ classList: [], classSet: new Set<string>() })),
    }
    const state = createCompilerRuntimeState({
      tailwindRuntime,
      refreshTailwindcssRuntime: async () => tailwindRuntime,
    })

    expect(state.tailwindRuntime).toBe(tailwindRuntime)
    expect(state.readyPromise).toBeInstanceOf(Promise)
    expect(state.revision).toBe(0)
    state.dispose()
    expect(state.events.revision).toBe(0)
  })
})
