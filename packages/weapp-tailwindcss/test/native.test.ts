import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ require: vi.fn() }))
vi.mock('node:module', () => ({ createRequire: () => native.require }))

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('WEAPP_TW_NATIVE', 'auto')
  native.require.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('native compiler loader', () => {
  it('loads a binding once and reuses it', async () => {
    const binding = { tokenizeWxml: vi.fn(), analyzeJs: vi.fn(), jsRuntimeSignature: vi.fn() }
    native.require.mockReturnValue(binding)
    const { loadNativeCompiler } = await import('@/native')
    expect(loadNativeCompiler()).toBe(binding)
    expect(loadNativeCompiler()).toBe(binding)
    expect(native.require).toHaveBeenCalledOnce()
  })

  it('retains automatic fallback after a missing optional binding', async () => {
    native.require.mockImplementation(() => { throw new Error('binding missing') })
    const { loadNativeCompiler } = await import('@/native')
    expect(loadNativeCompiler()).toBeUndefined()
    expect(loadNativeCompiler()).toBeUndefined()
    expect(native.require).toHaveBeenCalledOnce()
  })

  it('fails required mode with the original load error, including after a cached auto failure', async () => {
    const cause = new Error('wrong architecture')
    native.require.mockImplementation(() => { throw cause })
    const { loadNativeCompiler } = await import('@/native')
    expect(loadNativeCompiler()).toBeUndefined()
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    expect(loadNativeCompiler).toThrowError(expect.objectContaining({ cause }))
  })

  it('does not load native bindings in off mode', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'off')
    const { loadNativeCompiler } = await import('@/native')
    expect(loadNativeCompiler()).toBeUndefined()
    expect(native.require).not.toHaveBeenCalled()
  })

  it('rejects bindings without the required ABI', async () => {
    native.require.mockReturnValue({})
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    const { loadNativeCompiler } = await import('@/native')
    expect(loadNativeCompiler).toThrow('native compiler could not be loaded')
  })

  it.each(['analyzeJs', 'jsRuntimeSignature'])('rejects a stale binding missing %s', async (method) => {
    const binding: Record<string, unknown> = { tokenizeWxml: vi.fn(), analyzeJs: vi.fn(), jsRuntimeSignature: vi.fn() }
    delete binding[method]
    native.require.mockReturnValue(binding)
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    const { loadNativeCompiler } = await import('@/native')
    expect(loadNativeCompiler).toThrowError(expect.objectContaining({
      cause: expect.objectContaining({ message: `Native compiler does not provide ${method}` }),
    }))
  })

  it('rejects invalid modes instead of silently disabling verification', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'requred')
    const { loadNativeCompiler } = await import('@/native')
    expect(loadNativeCompiler).toThrow('Invalid WEAPP_TW_NATIVE mode')
    expect(native.require).not.toHaveBeenCalled()
  })
})

describe('native platform mapping', () => {
  it.each([
    ['darwin', 'arm64', 'darwin-arm64'],
    ['darwin', 'x64', 'darwin-x64'],
    ['win32', 'arm64', 'win32-arm64-msvc'],
    ['win32', 'x64', 'win32-x64-msvc'],
    ['linux', 'ia32', undefined],
    ['freebsd', 'x64', undefined],
  ] as const)('maps %s/%s', async (platform, arch, expected) => {
    const { getNativeBindingSuffix } = await import('@/native')
    expect(getNativeBindingSuffix(platform, arch)).toBe(expected)
  })

  it.each([
    [{ header: { glibcVersionRuntime: '2.31' } }, 'gnu'],
    [{ header: {} }, 'musl'],
  ])('distinguishes Linux libc families', async (report, suffix) => {
    vi.spyOn(process.report, 'getReport').mockReturnValue(report as ReturnType<typeof process.report.getReport>)
    const { getNativeBindingSuffix } = await import('@/native')
    expect(getNativeBindingSuffix('linux', 'arm64')).toBe(`linux-arm64-${suffix}`)
    expect(getNativeBindingSuffix('linux', 'x64')).toBe(`linux-x64-${suffix}`)
  })
})
