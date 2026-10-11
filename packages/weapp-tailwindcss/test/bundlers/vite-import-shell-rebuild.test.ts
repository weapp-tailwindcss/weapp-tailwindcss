import type { OutputAsset, OutputBundle } from 'rollup'
import type { ResolvedConfig } from 'vite'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createGenerateBundleHook } from '@/bundlers/vite/generate-bundle'
import { createViteSourceOutputRelationOwner, withViteSourceOutputRelationOwner } from '@/bundlers/vite/source-output-relations'
import { createContext } from './vite-plugin.testkit'

vi.mock('@/generation/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/generation/service')>()
  return {
    ...actual,
    generateTailwindV4Css: vi.fn(async (options: { frameworkProcessedUserCss?: string }) => ({
      css: `.generated{color:red}\n${options.frameworkProcessedUserCss ?? ''}`,
      dependencies: [],
    })),
  }
})

function asset(fileName: string, source: string): OutputAsset {
  return { type: 'asset', fileName, source, names: [], originalFileNames: [], needsCodeReference: false }
}

describe('issue 1245 import shell rebuilds', () => {
  it.each(['wxss', 'acss', 'ttss'])('keeps the shell and its target separate across %s rebuilds', async (extension) => {
    const file = `bootstrap.${extension}`
    const target = `theme.${extension}`
    const shell = `@import "./${target}";`
    const ctx = createContext({
      appType: 'uni-app-x',
      generator: false,
      cssMatcher: (file: string) => file.endsWith(`.${extension}`),
      mainCssChunkMatcher: () => false,
      styleHandler: async (css: string) => ({ css }),
      tailwindRuntime: { majorVersion: 3 },
    })
    const relations = new Map<string, string>()
    const record = vi.fn()
    const hook = createGenerateBundleHook({
      opts: ctx as any,
      runtimeState: { tailwindRuntime: ctx.tailwindRuntime, readyPromise: Promise.resolve() } as any,
      ensureRuntimeClassSet: async () => new Set(),
      ensureBundleRuntimeClassSet: async () => new Set(),
      frameworkRootImportShellTargetByFile: relations,
      cssPipelineStrategy: { shouldKeepRootMiniProgramStyleAsImportShell: () => true },
      debug: () => {},
      getResolvedConfig: () => ({
        command: 'build', root: process.cwd(),
        build: { outDir: 'dist', watch: {} },
      } as ResolvedConfig),
      markCssAssetProcessed: vi.fn(),
      isCssAssetProcessed: () => false,
      isViteProcessedCssAsset: () => false,
      recordCssAssetResult: record,
    })
    for (const color of ['#123456', '#123456', '#234567', '#345678']) {
      const css = `.fresh{color:${color}}`
      const bundle: OutputBundle = {
        [target]: asset(target, css),
        [file]: asset(file, shell),
      }
      await hook.call({ addWatchFile: () => {} }, {}, bundle)
      expect((bundle[file] as OutputAsset).source.toString().trim()).toBe(shell)
      expect((bundle[target] as OutputAsset).source).toBe(css)
      expect(relations.get(file)).toBe(target)
    }
    expect(record).not.toHaveBeenCalledWith(target, shell)
    // 增量 bundle 缺少目标时，只保留壳，不能把壳当作目标内容回放。
    const omitted: OutputBundle = { [file]: asset(file, shell) }
    await hook.call({ addWatchFile: () => {} }, {}, omitted)
    expect((omitted[file] as OutputAsset).source.toString().trim()).toBe(shell)
    expect(omitted[target]).toBeUndefined()

    const alternate = `alternate.${extension}`
    const currentShell = `@import "./${alternate}";`
    const switched: OutputBundle = { [file]: asset(file, currentShell), [alternate]: asset(alternate, '.new{color:blue}') }
    await hook.call({ addWatchFile: () => {} }, {}, switched)
    expect(relations.get(file)).toBe(alternate)
    expect((switched[file] as OutputAsset).source.toString().trim()).toBe(currentShell)
    expect((switched[alternate] as OutputAsset).source).toBe('.new{color:blue}')

    const multiple = `${shell}\n${currentShell}`
    const multi: OutputBundle = { [file]: asset(file, multiple), [target]: asset(target, '.first{}'), [alternate]: asset(alternate, '.second{}') }
    await hook.call({ addWatchFile: () => {} }, {}, multi)
    expect((multi[file] as OutputAsset).source).toBe(multiple)
    expect(relations.has(file)).toBe(false)

    const restored: OutputBundle = { [file]: asset(file, shell), [target]: asset(target, '.restored{color:green}') }
    await hook.call({ addWatchFile: () => {} }, {}, restored)
    expect(relations.get(file)).toBe(target)
    expect((restored[target] as OutputAsset).source).toBe('.restored{color:green}')
  })
})

// unibestX 热更新省略框架根样式，缓存回放把该资产追加到 bundle 尾部。
describe('framework root ownership in partial bundles', () => {
  it.each(['wxss', 'acss', 'ttss'])('preserves ownership before an importing root is processed (%s)', async (extension) => {
    const root = process.cwd()
    const sourceFile = path.join(root, 'theme.css')
    const css = '@import "tailwindcss"; @plugin "example";'
    const ctx = createContext({
      appType: 'uni-app-x',
      cssEntries: [sourceFile],
      tailwindcssBasedir: root,
      cssMatcher: (file: string) => file.endsWith(`.${extension}`),
      styleHandler: async (css: string) => ({ css }),
      tailwindRuntime: { majorVersion: 4, options: {
        projectRoot: root, tailwindcss: { cwd: root, v4: { cssSources: [{ file: sourceFile, css, base: root, dependencies: [] }] } },
      } },
    })
    const relations = new Map<string, string>()
    const framework = `framework.${extension}`
    const consumer = `bootstrap.${extension}`
    const target = `theme.${extension}`
    const importedCss = `@import "/${framework}"; .author{color:blue}`
    const owner = createViteSourceOutputRelationOwner()
    const hook = withViteSourceOutputRelationOwner(owner, () => createGenerateBundleHook({
      opts: ctx as any,
      runtimeState: { tailwindRuntime: ctx.tailwindRuntime, readyPromise: Promise.resolve() } as any,
      ensureRuntimeClassSet: async () => new Set(),
      ensureBundleRuntimeClassSet: async () => new Set(),
      frameworkRootImportShellTargetByFile: relations,
      cssPipelineStrategy: {
        shouldKeepRootMiniProgramStyleAsImportShell: () => true,
        shouldSelectConfiguredCssEntryRootSource: () => true,
      },
      debug: () => {},
      getResolvedConfig: () => ({ command: 'build', root, build: { outDir: 'dist', watch: {} } } as ResolvedConfig),
    }))
    const run = async (bundle: OutputBundle) => {
      await hook.call({ addWatchFile: () => {} }, {}, bundle)
      expect(relations.get(framework)).toBe(target)
      expect(relations.has(consumer)).toBe(false)
      expect((bundle[consumer] as OutputAsset).source).toContain(`@import "/${framework}"`)
      expect((bundle[consumer] as OutputAsset).source).toContain('.author')
      expect((bundle[target] as OutputAsset).source).not.toContain('@import')
      return Object.fromEntries(Object.entries(bundle).filter(([, value]) => value.type === 'asset').map(([file, value]) => [file, (value as OutputAsset).source]))
    }
    const initial = await run({ [framework]: asset(framework, 'page{height:100%}'), [consumer]: asset(consumer, importedCss) })
    const rebuild = await run({ [consumer]: asset(consumer, importedCss) })
    const removed = await run({ [consumer]: asset(consumer, importedCss), [framework]: asset(framework, '') })
    expect(String(removed[target])).not.toContain('height:100%')
    const restored = await run({ [consumer]: asset(consumer, importedCss), [framework]: asset(framework, 'page{height:100%}') })
    expect(String(restored[target])).toContain('height:100%')
    owner.recordOwnedOutput(sourceFile, target)
    for (let revision = 0; revision < 2; revision++) {
      // 主入口重建先重新登记同名输出，随后内部空 bundle 消费上一轮删除通知。
      owner.observeSource(sourceFile)
      owner.recordOwnedOutput(sourceFile, target)
      await hook.call({ addWatchFile: () => {} }, {}, {})
      expect(relations.get(framework)).toBe(target)
      await run({ [consumer]: asset(consumer, importedCss) })
    }
    expect({ initial, rebuild, removed, restored }).toMatchSnapshot()
  })
})
