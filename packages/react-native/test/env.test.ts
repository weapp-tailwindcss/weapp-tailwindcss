const reactNativeModule = vi.hoisted(() => ({ loaded: false }))

vi.mock('react-native', () => {
  reactNativeModule.loaded = true
  return {}
})

describe('React Native type environment', () => {
  it('does not load a second React Native runtime', async () => {
    await import('@/env')

    expect(reactNativeModule.loaded).toBe(false)
  })
})
