import type { InternalUserDefinedOptions } from '@/types'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { disposeCompilerOwner } from '@/compiler'
import { getCompilerContext } from '@/context'
import { resolveStyleOptionsFromContext } from '@/context/style-options'
import { withFrameworkEnvironment } from '@/framework-policies/environment-snapshot'
import { generatorTargetEnvKeys } from '@/framework-policies/resolve'
import { generateTailwindV4Css } from '@/context/generation'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from '@/generator'
import { resolveContextGeneratorConfiguration } from '@/generator/context-options'
import { normalizeWeappTailwindcssGeneratorOptions } from '@/generator/options'

const projectRoot = path.resolve(__dirname, '../..')
const rawSource = '@import "tailwindcss" source(none);'

function createInstance(options: Parameters<typeof getCompilerContext>[0] = {}, graph = false) {
  const opts = getCompilerContext({
    appType: 'mpx',
    tailwindcssBasedir: projectRoot,
    cssPreflight: false,
    ...options,
  })
  const runtimeState = { tailwindRuntime: opts.tailwindRuntime, readyPromise: Promise.resolve() }
  return {
    opts,
    async generate(candidates = ['p-4', 'w-[20rpx]'], owner: InternalUserDefinedOptions = opts) {
      const file = path.join(projectRoot, 'framework-environment.css')
      return generateTailwindV4Css({
        compilerMode: graph ? undefined : 'legacy',
        opts: owner,
        runtimeState,
        runtime: new Set(candidates),
        rawSource,
        file,
        disableSourceScan: true,
        cssHandlerOptions: {
          ...resolveStyleOptionsFromContext(owner),
          isMainChunk: true,
          postcssOptions: { options: { from: file } },
        },
        styleHandler: opts.styleHandler,
        debug: () => {},
      })
    },
    dispose: () => disposeCompilerOwner(runtimeState),
  }
}

beforeEach(() => {
  for (const key of generatorTargetEnvKeys) {
    vi.stubEnv(key, undefined)
  }
})
afterEach(() => vi.unstubAllEnvs())

describe('编译实例的框架环境快照', () => {
  it('Mpx Web 与小程序实例交错生成时保留创建环境和各自的 CSS', async () => {
    vi.stubEnv('MPX_CLI_MODE', 'web')
    const web = createInstance()
    const initialWeb = await web.generate()
    vi.stubEnv('MPX_CLI_MODE', 'wx')
    const mini = createInstance({ generator: {} })
    try {
      const firstMini = await mini.generate()
      expect(mini.opts).not.toBe(web.opts)
      const laterWeb = await web.generate(['p-4', 'w-[20rpx]', 'm-2'])
      vi.stubEnv('MPX_CLI_MODE', 'web')
      const laterMini = await mini.generate()
      const replayWeb = await web.generate()
      expect(initialWeb?.target).toBe('web')
      expect(laterWeb?.target).toBe('web')
      expect(replayWeb?.css).toBe(initialWeb?.css)
      expect(laterWeb?.css).toContain('.m-2')
      expect(firstMini?.target).toBe('weapp')
      expect(laterMini?.target).toBe('weapp')
      expect(laterMini?.css).toBe(firstMini?.css)
      expect(firstMini?.css).not.toBe(initialWeb?.css)
      expect(web.opts.platform).toBe('web')
      expect(mini.opts.platform).toBe('mp-weixin')
    }
    finally {
      await Promise.all([web.dispose(), mini.dispose()])
    }
  })

  it('代理与浅复制保留快照，显式 generator target 更新仍立即生效', async () => {
    vi.stubEnv('MPX_CLI_MODE', 'web')
    const instance = createInstance()
    vi.stubEnv('MPX_CLI_MODE', 'wx')
    try {
      const owner = new Proxy({ ...instance.opts }, {})
      expect((await instance.generate(undefined, owner))?.target).toBe('web')
      instance.opts.generator = { target: 'weapp' }
      expect((await instance.generate())?.target).toBe('weapp')
      instance.opts.generator = { target: 'web', webCompat: false }
      expect((await instance.generate())?.target).toBe('web')
      expect(resolveContextGeneratorConfiguration(instance.opts).options.webCompat).toBe(false)
      expect(normalizeWeappTailwindcssGeneratorOptions(undefined).target).toBe('weapp')
    }
    finally {
      await instance.dispose()
    }
  })

  it('原生平台环境变化后仍保留实例的 UTS 分支，并接受显式阶段平台覆盖', async () => {
    vi.stubEnv('UNI_UTS_PLATFORM', 'app-android')
    const instance = createInstance({ appType: 'uni-app-x', uniAppX: true })
    vi.stubEnv('UNI_UTS_PLATFORM', 'web')
    try {
      expect(resolveContextGeneratorConfiguration(instance.opts).options.branch).toMatchObject({ isNativeApp: true, platform: 'app-android' })
      expect(resolveContextGeneratorConfiguration(instance.opts, { uniUtsPlatform: 'app-ios' }).options.branch).toMatchObject({ isNativeApp: true, platform: 'app-ios' })
      instance.opts.generator = { target: 'web' }
      expect(resolveContextGeneratorConfiguration(instance.opts).options.branch.isWeb).toBe(true)
    }
    finally {
      await instance.dispose()
    }
  })

  it('Mpx 与 Taro 交错增删候选时独立推进 revision，释放一个实例不影响另一个', async () => {
    vi.stubEnv('WEAPP_TAILWINDCSS_COMPILER', 'graph')
    vi.stubEnv('MPX_CLI_MODE', 'web')
    const web = createInstance({ generator: { hmr: { preserveDeletedCss: false } } }, true)
    vi.stubEnv('MPX_CLI_MODE', 'wx')
    const mini = createInstance({ appType: 'taro', generator: { hmr: { preserveDeletedCss: false } } }, true)
    try {
      const webInitial = await web.generate(['p-4'])
      const miniInitial = await mini.generate(['m-2'])
      const webAdded = await web.generate(['p-4', 'w-[20rpx]'])
      const miniAdded = await mini.generate(['m-2', 'p-8'])
      const webDeleted = await web.generate(['w-[20rpx]'])
      expect([webInitial?.metadata.revision, webAdded?.metadata.revision, webDeleted?.metadata.revision]).toEqual([1, 2, 3])
      expect([miniInitial?.metadata.revision, miniAdded?.metadata.revision]).toEqual([1, 2])
      expect(webAdded?.classSet).toEqual(new Set(['p-4', 'w-[20rpx]']))
      expect(webDeleted?.classSet).toEqual(new Set(['w-[20rpx]']))
      expect(webDeleted?.css).not.toContain('.p-4')
      expect(miniAdded?.classSet).toEqual(new Set(['m-2', 'p-8']))
      await web.dispose()
      vi.stubEnv('MPX_CLI_MODE', 'web')
      const miniDeleted = await mini.generate(['p-8'])
      expect(miniDeleted?.target).toBe('weapp')
      expect(miniDeleted?.metadata.revision).toBe(3)
      expect(miniDeleted?.classSet).toEqual(new Set(['p-8']))
      expect(miniDeleted?.css).not.toContain('.m-2')
    }
    finally {
      await Promise.all([web.dispose(), mini.dispose()])
    }
  })

  it('相同 Web target 的单位兼容和增量缓存仍按实例环境隔离', async () => {
    vi.stubEnv('MPX_CLI_MODE', 'web')
    const compatible = createInstance({ generator: { target: 'web', webCompat: false } })
    vi.stubEnv('MPX_CLI_MODE', 'wx')
    const standard = createInstance({ appType: 'taro', generator: { target: 'web', webCompat: false } })
    const generator = createWeappTailwindcssGenerator(await resolveTailwindV4Source({ base: projectRoot, css: rawSource }))
    try {
      const compatibleCss = await compatible.generate(['w-[20rpx]'])
      const standardCss = await standard.generate(['w-[20rpx]'])
      expect(compatibleCss?.target).toBe('web')
      expect(standardCss?.target).toBe('web')
      expect(compatibleCss?.css).not.toBe(standardCss?.css)
      expect(compatibleCss?.css).toContain('width: 0.625rem')
      expect(standardCss?.css).toContain('width: 20rpx')
      expect((await compatible.generate(['w-[20rpx]', 'w-[21rpx]']))?.css).toContain('width: 0.65625rem')
      vi.stubEnv('MPX_CLI_MODE', 'web')
      expect((await standard.generate(['w-[20rpx]', 'w-[21rpx]']))?.css).toContain('width: 21rpx')
      const request = { candidates: ['w-[20rpx]'], target: 'web' as const, scanSources: false, incrementalCache: true }
      const compatibleResult = await generator.generate({ ...request, styleOptions: withFrameworkEnvironment({}, compatible.opts) })
      const standardResult = await generator.generate({ ...request, styleOptions: withFrameworkEnvironment({}, standard.opts) })
      expect(compatibleResult.css).toContain('width: 0.625rem')
      expect(standardResult.css).toContain('width: 20rpx')
    }
    finally {
      await Promise.all([compatible.dispose(), standard.dispose(), generator.dispose?.()])
    }
  })
})
