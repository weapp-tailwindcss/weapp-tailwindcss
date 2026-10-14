import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rustCommand, rustToolchain } from '../scripts/e2e-preflight/probes/rust'

const mocks = vi.hoisted(() => ({ execute: vi.fn(), libraries: vi.fn() }))
vi.mock('execa', () => ({ execa: mocks.execute }))
vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  access: async () => undefined,
  stat: async () => ({ isFile: () => true }),
  realpath: async (file: string) => ['rustc', 'cargo'].includes(path.basename(file).replace(/\.exe$/i, '')) ? path.join(path.dirname(file), `rustup${process.platform === 'win32' ? '.EXE' : ''}`) : file,
  readdir: mocks.libraries,
}))

const tools = path.join(os.tmpdir(), 'preflight-rust-tools')
const library = path.join(os.tmpdir(), 'preflight-rust-library')
const context = { root: process.cwd(), dir: os.tmpdir(), runId: 'synthetic', url: 'http://127.0.0.1', phase: 'prepare' as const, extended: true }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('PATH', tools)
  vi.stubEnv('PATHEXT', '.EXE')
  vi.stubEnv('RUSTC', undefined)
  vi.stubEnv('CARGO_BUILD_RUSTC', undefined)
  mocks.libraries.mockResolvedValue(['libstd-test.rlib', 'libcore-test.rlib'])
  mocks.execute.mockImplementation(async (file: string, args: string[]) => {
    if (args[0] === '--print') {
      return { all: library }
    }
    if (args[0] === 'clippy') {
      return { all: 'clippy 0.1.96' }
    }
    return { all: path.basename(file).startsWith('cargo') ? 'cargo 1.96.0' : 'rustc 1.96.0 (test)' }
  })
})
afterEach(() => vi.unstubAllEnvs())

describe('扩展 Rust 环境预检', () => {
  it('保留 rustup 代理入口名，并分别在两个内核目录验证工具链', async () => {
    const result = await rustToolchain(context)
    expect(result.nativeTarget).toMatch(/apple-darwin|unknown-linux|windows-msvc/)
    const kernels = JSON.parse(result.rustToolchain)
    expect(Object.keys(kernels)).toEqual(['weapp-tailwindcss', 'postcss'])
    const extension = process.platform === 'win32' ? '.EXE' : ''
    expect(kernels['weapp-tailwindcss'].compiler.command).toBe(path.join(tools, `rustc${extension}`))
    expect(kernels['weapp-tailwindcss'].compiler.executable).toBe(path.join(tools, `rustup${extension}`))
    expect(mocks.execute.mock.calls.every(([file]) => !path.basename(file).startsWith('rustup'))).toBe(true)
    expect(new Set(mocks.execute.mock.calls.map(([, , options]) => options.cwd)))
      .toEqual(new Set(['weapp-tailwindcss', 'postcss'].map(name => path.join(context.root, 'packages', name, 'native'))))
  })

  it('低于 Cargo manifest 最低版本时立即阻断', async () => {
    mocks.execute.mockResolvedValue({ all: 'rustc 1.95.0 (test)' })
    await expect(rustToolchain(context)).rejects.toThrow('需要 Rust 1.96')
    expect(mocks.execute).toHaveBeenCalledOnce()
  })

  it('遵循 Cargo 编译器环境覆盖及 RUSTC 优先级', async () => {
    const custom = path.join(tools, `custom-rustc${process.platform === 'win32' ? '.EXE' : ''}`)
    vi.stubEnv('CARGO_BUILD_RUSTC', custom)
    await rustToolchain(context)
    expect(mocks.execute.mock.calls[0]?.[0]).toBe(custom)
    mocks.execute.mockClear()
    vi.stubEnv('RUSTC', path.join(tools, 'rustc'))
    await rustToolchain(context)
    expect(mocks.execute.mock.calls[0]?.[0]).toContain('rustc')
    expect(mocks.execute.mock.calls[0]?.[0]).not.toContain('custom-rustc')
  })

  it('缺少 Clippy 时阻断，不安装组件', async () => {
    mocks.execute.mockImplementation(async (_file, args) => {
      if (args[0] === 'clippy') {
        throw new Error('Clippy component missing')
      }
      return { all: args[0] === '--version' ? 'rustc 1.96.0' : '' }
    })
    await expect(rustToolchain(context)).rejects.toThrow('Clippy component missing')
    expect(mocks.execute.mock.calls.some(([, args]) => args.includes('install'))).toBe(false)
  })

  it('缺少宿主 std/core 时不能把工具版本当作已就绪', async () => {
    mocks.libraries.mockResolvedValue(['libcore-test.rlib'])
    await expect(rustToolchain(context)).rejects.toThrow('缺少 std/core')
  })

  it('拒绝相对工具路径，避免工作目录改变所选编译器', async () => {
    await expect(rustCommand('./rustc', ['--version'], context.root)).rejects.toThrow('必须使用绝对路径')
    expect(mocks.execute).not.toHaveBeenCalled()
  })
})
