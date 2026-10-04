import { describe, expect, it, vi } from 'vitest'
import { getNativeBindingSuffix, requireNativeBinding } from '@/native/resolve'

describe('native platform resolution', () => {
  it.each(['arm64', 'x64'])('selects the right platform package for %s', (arch) => {
    expect(getNativeBindingSuffix('darwin', arch)).toBe(`darwin-${arch}`)
    expect(getNativeBindingSuffix('win32', arch)).toBe(`win32-${arch}-msvc`)
    expect(getNativeBindingSuffix('linux', arch, () => ({ header: { glibcVersionRuntime: '2.28' } }))).toBe(`linux-${arch}-gnu`)
    expect(getNativeBindingSuffix('linux', arch, () => ({ header: {} }))).toBe(`linux-${arch}-musl`)
  })

  it('does not guess an unsupported architecture or unknown libc', () => {
    expect(getNativeBindingSuffix('linux', 'riscv64')).toBeUndefined()
    expect(getNativeBindingSuffix('freebsd', 'x64')).toBeUndefined()
    expect(getNativeBindingSuffix('linux', 'x64', () => undefined)).toBeUndefined()
  })

  it.each(['/opt/node_modules/native.node', 'C:\\work\\node_modules\\native.node', '\\native.node', 'relative.node'])('preserves resolved filesystem identities: %s', (resolved) => {
    const binding = { tokenizeWxml: vi.fn() }
    const require = Object.assign(vi.fn(() => binding), { resolve: vi.fn(() => resolved) })
    expect(requireNativeBinding(require, 'darwin-arm64')).toBe(binding)
    expect(require.resolve).toHaveBeenCalledExactlyOnceWith('@weapp-tailwindcss/native-darwin-arm64')
    expect(require).toHaveBeenCalledExactlyOnceWith(resolved)
  })

  it('uses local development output only when the optional package cannot be resolved', () => {
    const require = Object.assign(vi.fn(() => ({ native: true })), {
      resolve: vi.fn()
        .mockImplementationOnce(() => { throw Object.assign(new Error('missing'), { code: 'MODULE_NOT_FOUND' }) })
        .mockReturnValue('/source/native.node'),
    })
    expect(requireNativeBinding(require, 'darwin-arm64')).toEqual({ native: true })
    expect(require.resolve).toHaveBeenNthCalledWith(2, 'weapp-tailwindcss/native/bindings/weapp-tailwindcss-native.darwin-arm64.node')
  })

  it.each(['ERR_DLOPEN_FAILED', 'MODULE_NOT_FOUND'])('preserves an installed package load error: %s', (code) => {
    const error = Object.assign(new Error('broken binary'), { code })
    const require = Object.assign(vi.fn(() => { throw error }), { resolve: vi.fn(() => '/native.node') })
    expect(() => requireNativeBinding(require, 'linux-x64-gnu')).toThrow(error)
    expect(require.resolve).toHaveBeenCalledTimes(1)
  })

  it('retains both resolution failures for required-mode diagnostics', () => {
    const require = Object.assign(vi.fn(), {
      resolve: vi.fn(() => { throw Object.assign(new Error('missing'), { code: 'MODULE_NOT_FOUND' }) }),
    })
    expect(() => requireNativeBinding(require, 'win32-x64-msvc')).toThrow(AggregateError)
    expect(require).not.toHaveBeenCalled()
  })
})
