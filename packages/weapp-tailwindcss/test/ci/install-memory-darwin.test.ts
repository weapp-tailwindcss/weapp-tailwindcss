import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { needsDarwinMemoryProbe, parseDarwinAvailableMemory, readDarwinAvailableMemory } from '../../../../scripts/ci/install-memory-darwin.mjs'
import { prepareInstallEnvironment, readAvailableInstallMemory, readInstallMemoryResources } from '../../../../scripts/ci/install-memory.mjs'

const gibibyte = 1024 ** 3
const resources = {
  platform: 'darwin' as const,
  libuvVersion: '1.51.0',
  availableBytes: 424 * 1024 ** 2,
  freeBytes: 424 * 1024 ** 2,
  totalBytes: 7 * gibibyte,
  constrainedBytes: 0,
}

function vmStat(pageSize = 16384) {
  return `Mach Virtual Memory Statistics: (page size of ${pageSize} bytes)
Pages free: 1000.
Pages active: 99999999.
Pages inactive: 200000.
Pages speculative: 99999999.
Pages wired down: 99999999.
Pages purgeable: 30000.
Pages stored in compressor: 99999999.
Pages occupied by compressor: 99999999.
`
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('Darwin 安装内存口径', () => {
  it.each([4096, 16384])('按 %s 字节页大小只累加 free、inactive、purgeable', (pageSize) => {
    expect(parseDarwinAvailableMemory(vmStat(pageSize))).toBe(231000 * pageSize)
    expect(parseDarwinAvailableMemory(vmStat(pageSize).replaceAll('\n', '\r\n'))).toBe(231000 * pageSize)
  })

  it.each([
    vmStat().replace('page size of 16384', 'page size of 5000'),
    vmStat().replace('page size of 16384', 'page size of 0'),
    vmStat().replace('Mach Virtual Memory Statistics:', '虚拟内存统计：'),
    vmStat().replace('Pages inactive: 200000.\n', ''),
    `${vmStat()}Pages free: 1000.\n`,
    `${vmStat()}Pages inactive: NaN.\n`,
    vmStat().replace('Pages free: 1000.', 'Pages free: -1.'),
    vmStat().replace('Pages free: 1000.', 'Pages free: 1,000.'),
    vmStat().replace('Pages free: 1000.', 'Pages free: NaN.'),
    vmStat().replace('Pages free: 1000.', 'Pages free: 9007199254740992.'),
    vmStat().replace('Pages free: 1000.', 'Pages free: 9007199254740991.'),
    vmStat().replace('1000.', '0.').replace('200000.', '0.').replace('30000.', '0.'),
    '',
  ])('未知、缺失、重复、溢出或耗尽读数拒绝创建预算：%s', (output) => {
    expect(() => parseDarwinAvailableMemory(output)).toThrow(/Darwin/)
  })

  it('只有旧 libuv 的 Darwin 走兼容读取，不根据 Node major 猜测 API 语义', () => {
    expect(needsDarwinMemoryProbe('darwin', '1.49.2')).toBe(true)
    expect(needsDarwinMemoryProbe('darwin', '1.51.0')).toBe(true)
    expect(needsDarwinMemoryProbe('darwin', '1.52.0')).toBe(false)
    expect(needsDarwinMemoryProbe('darwin', '1.52.1')).toBe(false)
    expect(needsDarwinMemoryProbe('linux', 'unknown')).toBe(false)
    expect(needsDarwinMemoryProbe('win32', '1.49.2')).toBe(false)
    expect(() => needsDarwinMemoryProbe('darwin', 'unknown')).toThrow('统计语义')
    expect(() => needsDarwinMemoryProbe('darwin', '9007199254740992.52.0')).toThrow('统计语义')
  })

  it('Node 22 的 free-only API 不会把可回收内存缩为 212 MiB heap，且继续预留半数', () => {
    expect(prepareInstallEnvironment({}, { ...resources, source: 'node-available' }).environment.NODE_OPTIONS)
      .toBe('--max-old-space-size=212')
    const readDarwin = vi.fn(() => 6 * gibibyte)
    const corrected = readInstallMemoryResources(resources, readDarwin)
    expect(readDarwin).toHaveBeenCalledOnce()
    expect(corrected.source).toBe('darwin-vm-stat')
    const installation = prepareInstallEnvironment({}, corrected)
    expect(installation.environment.NODE_OPTIONS).toBe('--max-old-space-size=3072')
    expect(installation.memory).toEqual({
      source: 'darwin-vm-stat',
      totalBytes: 7 * gibibyte,
      availableBytes: 6 * gibibyte,
      constrainedBytes: 0,
      safeAvailableBytes: 6 * gibibyte,
      heapMb: 3072,
    })
  })

  it('新版 Darwin 和其他平台保留原生 available，缺失才回退 free', () => {
    const readDarwin = vi.fn(() => 6 * gibibyte)
    for (const platform of ['darwin', 'linux', 'win32'] as const) {
      const native = readInstallMemoryResources({ ...resources, platform, libuvVersion: '1.52.0', availableBytes: 5 * gibibyte }, readDarwin)
      expect(readAvailableInstallMemory(native)).toBe(5 * gibibyte)
      expect(native.source).toBe('node-available')
    }
    expect(readDarwin).not.toHaveBeenCalled()
    const { availableBytes: omitted, ...withoutApi } = resources
    expect(omitted).toBeDefined()
    const fallback = readInstallMemoryResources({ ...withoutApi, platform: 'linux' }, readDarwin)
    expect(fallback.source).toBe('os-free')
    expect(readAvailableInstallMemory(fallback)).toBe(resources.freeBytes)
  })

  it('兼容读数仍受宿主和容器限制，失败不回退过小的 free-only API', () => {
    const readDarwin = () => 16 * gibibyte
    expect(readAvailableInstallMemory(readInstallMemoryResources(resources, readDarwin))).toBe(7 * gibibyte)
    const constrained = readInstallMemoryResources({ ...resources, constrainedBytes: 2 * gibibyte }, readDarwin)
    expect(prepareInstallEnvironment({}, constrained).environment.NODE_OPTIONS).toBe('--max-old-space-size=1024')
    expect(() => readInstallMemoryResources(resources, () => {
      throw new Error('probe failed')
    })).toThrow('probe failed')
    expect(() => readAvailableInstallMemory(readInstallMemoryResources(resources, () => 0))).toThrow('安全')
  })

  it('vm_stat 有超时和输出大小上限，locale 只变读取子进程', () => {
    vi.stubEnv('LC_ALL', 'caller-locale')
    const runner = vi.fn(() => vmStat())
    expect(readDarwinAvailableMemory(runner)).toBe(231000 * 16384)
    expect(runner).toHaveBeenCalledWith('/usr/bin/vm_stat', expect.objectContaining({
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 64 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: expect.objectContaining({ LC_ALL: 'C', LANG: 'C' }),
    }))
    expect(process.env.LC_ALL).toBe('caller-locale')
    expect(() => readDarwinAvailableMemory(() => {
      throw new Error('timeout')
    })).toThrow('安全安装内存预算')
  })

  it('显式 heap 不读取自动资源；日志摘要不包含环境或原始 NODE_OPTIONS', () => {
    const available = vi.spyOn(process, 'availableMemory').mockReturnValue(Number.NaN)
    const environment = { NODE_OPTIONS: '--no-warnings --max-old-space-size=768', SECRET_TOKEN: 'private' }
    const explicit = prepareInstallEnvironment(environment)
    expect(explicit.environment).toEqual(environment)
    expect(explicit.memory).toEqual({ source: 'caller' })
    expect(available).not.toHaveBeenCalled()
    expect(JSON.stringify(explicit.memory)).not.toContain('private')
    expect(JSON.stringify(explicit.memory)).not.toContain('NODE_OPTIONS')
  })
})
