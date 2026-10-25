import type { InternalUserDefinedOptions } from '@/types'
import { execFile } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { runCompilerOwnerActivity } from '@/compiler/compiler-owner-state'
import { disposeCompilerOwner } from '@/compiler/owner-lifecycle'
import { resolveCompilationProfile } from '@/context/compilation-profile'
import { initializeFrameworkEnvironment } from '@/framework-policies/environment-snapshot'

function createContext() {
  const context = { generator: false, cssPreflight: false } as InternalUserDefinedOptions
  initializeFrameworkEnvironment(context)
  return context
}

describe('编译配置缓存的 owner 关闭边界', () => {
  it('默认 context owner 同样通过统一关闭入口释放配置', async () => {
    const context = createContext()
    const first = resolveCompilationProfile(context)
    expect(resolveCompilationProfile(context).profile).toBe(first.profile)
    await disposeCompilerOwner(context)
    expect(first.isCurrent()).toBe(false)
    expect(() => resolveCompilationProfile(context)).toThrow('已释放')
  })

  it('关闭等待已接收任务，排空后清除配置缓存且禁止重新创建', async () => {
    const context = createContext()
    const owner = {}
    const independent = {}
    const first = resolveCompilationProfile(context, owner)
    const other = resolveCompilationProfile(context, independent)
    const gate = Promise.withResolvers<void>()
    const accepted = runCompilerOwnerActivity(owner, async () => {
      await gate.promise
      expect(resolveCompilationProfile(context, owner).profile).toBe(first.profile)
    })
    const closing = disposeCompilerOwner(owner)
    expect(disposeCompilerOwner(owner)).toBe(closing)
    expect(() => resolveCompilationProfile(context, owner)).toThrow('正在释放')
    expect(first.isCurrent()).toBe(true)
    gate.resolve()
    await Promise.all([accepted, closing])

    expect(first.isCurrent()).toBe(false)
    expect(() => resolveCompilationProfile(context, owner)).toThrow('已释放')
    expect(resolveCompilationProfile(context, independent).profile).toBe(other.profile)
    expect(other.isCurrent()).toBe(true)
    expect(disposeCompilerOwner(owner)).toBe(closing)
    await disposeCompilerOwner(independent)
    expect(other.isCurrent()).toBe(false)
  })

  it('前序清理失败后仍删除含回调的配置，重复关闭保留同一失败结果', async () => {
    const context = createContext()
    context.postcssOptions = { plugins: [{ postcssPlugin: 'captured', Once() {} }] }
    const owner = {}
    const first = resolveCompilationProfile(context, owner)
    const closing = disposeCompilerOwner(owner, {
      beforeDispose() {
        throw new Error('extension cleanup')
      },
    })
    await expect(closing).rejects.toThrow('编译会话释放失败')

    expect(first.isCurrent()).toBe(false)
    expect(() => resolveCompilationProfile(context, owner)).toThrow('已释放')
    expect(disposeCompilerOwner(owner)).toBe(closing)
  })

  it('宿主持有已关闭 owner 与版本查询时，配置回调及其 provider 仍可被回收', async ({ signal }) => {
    await promisify(execFile)(process.execPath, [
      '--expose-gc',
      '--import',
      'tsx',
      fileURLToPath(new URL('./fixtures/compilation-profile-retention.mjs', import.meta.url)),
    ], { timeout: 15_000, signal })
  }, 20_000)
})
