import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getNativeSelectorBindingSuffix } from '@/selectorParser/native-platform'

afterEach(() => vi.restoreAllMocks())

describe('CSS Rust 预编译平台路由', () => {
  it.each(['arm64', 'x64'] as const)('macOS 和 Windows %s', (arch) => {
    expect(getNativeSelectorBindingSuffix('darwin', arch)).toBe(`darwin-${arch}`)
    expect(getNativeSelectorBindingSuffix('win32', arch)).toBe(`win32-${arch}-msvc`)
  })

  it.each(['arm64', 'x64'] as const)('Linux %s 的 GNU 与 musl 独立路由', (arch) => {
    const report = vi.spyOn(process.report, 'getReport')
    report.mockReturnValue({ header: { glibcVersionRuntime: '2.31' } } as ReturnType<typeof process.report.getReport>)
    expect(getNativeSelectorBindingSuffix('linux', arch)).toBe(`linux-${arch}-gnu`)
    report.mockReturnValue({ header: {} } as ReturnType<typeof process.report.getReport>)
    expect(getNativeSelectorBindingSuffix('linux', arch)).toBe(`linux-${arch}-musl`)
  })

  it('其它架构和平台交回 TypeScript 路径', () => {
    expect(getNativeSelectorBindingSuffix('aix', 'ppc64')).toBeUndefined()
    expect(getNativeSelectorBindingSuffix('linux', 'ia32')).toBeUndefined()
    expect(getNativeSelectorBindingSuffix('win32', 'ia32')).toBeUndefined()
  })

  it('无法获取 Linux report 时不猜测 libc', () => {
    vi.spyOn(process.report, 'getReport').mockReturnValue(undefined as unknown as ReturnType<typeof process.report.getReport>)
    expect(getNativeSelectorBindingSuffix('linux', 'x64')).toBeUndefined()
  })
})
