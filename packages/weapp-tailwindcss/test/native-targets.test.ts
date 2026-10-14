import { describe, expect, it } from 'vitest'
import { hostNativeTarget } from '../native/targets.mjs'

describe('原生验收的真实宿主目标', () => {
  it.each([
    ['darwin', 'arm64', undefined, 'aarch64-apple-darwin'],
    ['darwin', 'x64', undefined, 'x86_64-apple-darwin'],
    ['win32', 'arm64', undefined, 'aarch64-pc-windows-msvc'],
    ['win32', 'x64', undefined, 'x86_64-pc-windows-msvc'],
    ['linux', 'arm64', { header: { glibcVersionRuntime: '2.39' } }, 'aarch64-unknown-linux-gnu'],
    ['linux', 'x64', { header: { glibcVersionRuntime: '2.39' } }, 'x86_64-unknown-linux-gnu'],
    ['linux', 'arm64', { header: {}, sharedObjects: ['/lib/ld-musl-aarch64.so.1'] }, 'aarch64-unknown-linux-musl'],
    ['linux', 'x64', { header: {}, sharedObjects: ['/lib/ld-musl-x86_64.so.1'] }, 'x86_64-unknown-linux-musl'],
    ['linux', 'x64', { header: {}, sharedObjects: ['/lib/libc.musl-x86_64.so.1'] }, 'x86_64-unknown-linux-musl'],
  ])('%s/%s 必须选择对应 ABI', (platform, arch, report, target) => {
    expect(hostNativeTarget(platform, arch, report)).toBe(target)
  })

  it.each([
    ['linux', 'x64', {}],
    ['linux', 'x64', { header: {}, sharedObjects: [] }],
    ['darwin', 'ia32', undefined],
    ['freebsd', 'x64', undefined],
  ])('拒绝未知平台、架构或 libc：%s/%s', (platform, arch, report) => {
    expect(() => hostNativeTarget(platform, arch, report)).toThrow('无法确认原生宿主')
  })
})
