import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareNativeDependencies } from '../native/ci-dependencies.mjs'

const roots: string[] = []
const target = 'x86_64-unknown-linux-gnu'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'native-ci-deps-'))
  roots.push(root)
  for (const file of ['package.json', 'packages/core/package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', 'patches/dependency.patch']) {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), file.endsWith('package.json') ? '{"name":"fixture","packageManager":"pnpm@12.9.1"}' : 'fixture')
  }
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  mkdirSync(join(root, 'node_modules', 'tsx'), { recursive: true })
  writeFileSync(join(root, 'node_modules', 'tsx', 'package.json'), '{}')
  writeFileSync(join(root, 'node_modules', '.modules.yaml'), 'fixture')
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('Linux native 同轮依赖复用', () => {
  it('冻结安装一次，两个后续 ABI 验证不再次安装', () => {
    const root = fixture()
    const install = vi.fn()
    prepareNativeDependencies({ root, target, install, env: { ...process.env, NATIVE_PNPM_STORE: join(root, 'store') } })
    prepareNativeDependencies({ root, target, install, reuse: true })
    prepareNativeDependencies({ root, target, install, reuse: true })
    expect(install).toHaveBeenCalledExactlyOnceWith(['install', '--frozen-lockfile', '--store-dir', resolve(root, 'store')])
  })

  it('不同运行和重试必须重新安装，而同轮切换 Node ABI 可以复用', () => {
    const root = fixture()
    const env = { GITHUB_RUN_ID: '10', GITHUB_RUN_ATTEMPT: '1', GITHUB_JOB: 'native' }
    prepareNativeDependencies({ root, target, env, install: vi.fn() })
    prepareNativeDependencies({ root, target, env, reuse: true })
    for (const changed of [{ ...env, GITHUB_RUN_ID: '11' }, { ...env, GITHUB_RUN_ATTEMPT: '2' }, { ...env, GITHUB_JOB: 'another' }]) {
      expect(() => prepareNativeDependencies({ root, target, env: changed, reuse: true })).toThrow('same target and configuration')
    }
  })

  it.each(['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'package.json', 'packages/core/package.json', '.npmrc', 'patches/dependency.patch'])('拒绝安装后变化的 %s', (file) => {
    const root = fixture()
    prepareNativeDependencies({ root, target, install: vi.fn() })
    writeFileSync(join(root, file), 'changed')
    expect(() => prepareNativeDependencies({ root, target, reuse: true })).toThrow('same target and configuration')
  })

  it.each(['missing-stamp', 'missing-modules', 'missing-tsx', 'different-target'])('拒绝缺失或错误的同轮依赖证据：%s', (failure) => {
    const root = fixture()
    const stamp = join(root, 'node_modules', '.cache', 'native-ci-dependencies.json')
    if (failure !== 'missing-stamp') {
      prepareNativeDependencies({ root, target, install: vi.fn() })
    }
    if (failure === 'missing-modules') {
      rmSync(join(root, 'node_modules', '.modules.yaml'))
    }
    if (failure === 'missing-tsx') {
      rmSync(join(root, 'node_modules', 'tsx'), { recursive: true })
    }
    expect(() => prepareNativeDependencies({ root, target: failure === 'different-target' ? 'x86_64-unknown-linux-musl' : target, reuse: true }))
      .toThrow('same target and configuration')
    if (failure === 'missing-stamp') {
      expect(existsSync(stamp)).toBe(false)
    }
  })

  it('重新安装失败时清除旧成功标记，不允许验证继续使用', () => {
    const root = fixture()
    const stamp = join(root, 'node_modules', '.cache', 'native-ci-dependencies.json')
    prepareNativeDependencies({ root, target, install: vi.fn() })
    expect(JSON.parse(readFileSync(stamp, 'utf8')).schemaVersion).toBe(1)
    expect(() => prepareNativeDependencies({ root, target, install: () => { throw new Error('install failed') } })).toThrow('install failed')
    expect(existsSync(stamp)).toBe(false)
    expect(() => prepareNativeDependencies({ root, target, reuse: true })).toThrow('same target and configuration')
  })
})
