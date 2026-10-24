import type { Plugin } from 'vite'
import type { ViteFrameworkExtraPluginContext } from '@/bundlers/vite/shared/framework-services'
import type { VitePluginSlot } from '@/bundlers/vite/shared/plugin-slots'
import type { UserDefinedOptions } from '@/types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createViteFrameworkPlugins } from '@/bundlers/vite/shared/create-framework-plugins'
import { createGenerationConfigHook } from '@/bundlers/vite/shared/generation-config-hook'
import { frameworkOutputSlots, frameworkTransformSlots, postPluginSlot, runtimeLifecycleSlot, sourcePluginSlots } from '@/bundlers/vite/shared/plugin-descriptors'
import { createDeferredVitePlugins } from '@/bundlers/vite/shared/plugin-slots'
import { createDebug } from '@/debug'
import { resolvePackageDir } from '@/utils/resolve-package'

export interface CapabilitySessionEvidence {
  id: number
  builds: number
  closes: number
  events: string[]
  groups: Set<'sources' | 'generation' | 'styles' | 'assets'>
  assetViewsFrozen: boolean
  replacedViewRetained: boolean
  duplicateEmissionRejected: boolean
  missingReplacementRejected: boolean
}

export const capabilityOutput = {
  styles: 'capability-root.css',
  replaced: 'capability-replaced.txt',
  emitted: 'capability-emitted.txt',
  removed: 'capability-removed.txt',
} as const

const extensionName = 'capability-fixture:source-protocol'
const extensionSlot = {
  name: extensionName,
  enforce: 'pre',
  hooks: { configResolved: true, buildStart: true, transform: true, closeBundle: true, closeWatcher: true },
} satisfies VitePluginSlot

const slots = [
  ...sourcePluginSlots,
  ...frameworkTransformSlots,
  extensionSlot,
  ...frameworkOutputSlots,
  runtimeLifecycleSlot,
  {
    name: 'weapp-tailwindcss:framework-css-emission-finalizer',
    enforce: 'post',
    hooks: { generateBundle: { order: 'post' } },
  },
] satisfies VitePluginSlot[]

function createSourceProtocol(
  services: ViteFrameworkExtraPluginContext,
  state: CapabilitySessionEvidence,
  persistent: boolean,
  beforeTransform: (() => Promise<void>) | undefined,
): Plugin {
  const facts = () => {
    const config = services.getResolvedConfig()
    if (!config) {
      throw new Error('测试框架缺少已解析构建事实')
    }
    return config
  }
  const close = () => {
    if (state.closes === 0) {
      state.closes++
      state.events.push('closed')
    }
  }
  return {
    name: extensionName,
    enforce: 'pre',
    async buildStart() {
      state.builds++
      state.events.push(`build:${state.builds}`)
      const sourceFile = path.join(facts().root, 'view.html')
      this.addWatchFile(sourceFile)
      const source = await readFile(sourceFile, 'utf8').catch((error: unknown) => {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          return ''
        }
        throw error
      })
      await services.registerModuleGraphCandidates(sourceFile, source)
      this.emitFile({ type: 'asset', fileName: capabilityOutput.styles, source: '.capability-shell { --shell: 1; }' })
      this.emitFile({ type: 'asset', fileName: capabilityOutput.replaced, source: 'pending' })
      this.emitFile({ type: 'asset', fileName: capabilityOutput.removed, source: 'discard' })
    },
    async transform(code, id) {
      if (path.resolve(id) !== path.resolve(facts().root, 'entry.css')) {
        return
      }
      state.events.push('transform:start')
      await beforeTransform?.()
      const css = await services.generateCss(id, code, { addWatchFile: this.addWatchFile.bind(this) })
      if (css === undefined) {
        throw new Error('测试框架的来源协议未获得生成结果')
      }
      state.events.push('transform:end')
      return { code: css, map: null }
    },
    closeBundle() {
      if (!persistent) {
        close()
      }
    },
    closeWatcher: close,
  }
}

/** 新框架只登记描述与能力；会话、生成队列和资产提交均复用生产组装器。 */
export function createProductionCapabilityFramework(
  options: UserDefinedOptions,
  sessions: CapabilitySessionEvidence[],
  beforeTransform?: () => Promise<void>,
  failAt?: 'binding' | 'configuration',
): Plugin[] {
  const plugins = createDeferredVitePlugins(slots, (config) => {
    const state: CapabilitySessionEvidence = {
      id: sessions.length + 1,
      builds: 0,
      closes: 0,
      events: [],
      groups: new Set(),
      assetViewsFrozen: false,
      replacedViewRetained: false,
      duplicateEmissionRejected: false,
      missingReplacementRejected: false,
    }
    sessions.push(state)
    return createViteFrameworkPlugins(options, {
      frameworkName: 'capability-fixture',
      styleInjectorDelegate: Object.assign(() => [], { slots: [] }),
      sourceCandidatesBeforeExtraPlugin: plugin => plugin.name === extensionName,
      createExtraPlugins(services) {
        return createDeferredVitePlugins([extensionSlot], () => {
          const plugin = createSourceProtocol(services, state, config.build.watch != null, beforeTransform)
          plugin.configResolved = () => {
            if (failAt === 'configuration') {
              throw new Error('fixture initialization failed')
            }
          }
          if (failAt === 'binding' && typeof plugin.transform === 'function') {
            plugin.transform = { order: 'post', handler: plugin.transform }
          }
          return [plugin]
        })
      },
      cssPipelineStrategy: {
        sources: {
          shouldDeferPreTransformTailwindGeneration({ id }) {
            const ownsSource = path.resolve(id) === path.resolve(config.root, 'entry.css')
            if (ownsSource) {
              state.groups.add('sources')
            }
            return ownsSource
          },
        },
        generation: {
          transformGeneratedCss(css) {
            state.groups.add('generation')
            return `${css}\n.capability-generation { --session: ${state.id}; }`
          },
        },
        styles: {
          resolveConfiguredCssEntryRootInjectionTarget({ assets, sourceFile, isConfiguredCssEntryFile }) {
            if (isConfiguredCssEntryFile(sourceFile) && assets[capabilityOutput.styles]) {
              state.groups.add('styles')
              return capabilityOutput.styles
            }
          },
        },
        assets: {
          transformEmittedWebCss(css) {
            if (!css.includes('.capability-generation')) {
              return css
            }
            state.groups.add('assets')
            return `${css}\n.capability-emission { --session: ${state.id}; }`
          },
        },
      },
      createAssetPipeline: () => ({
        async finalizeStyles({ assets }) {
          const snapshot = assets.read()
          const replaced = snapshot[capabilityOutput.replaced]
          state.assetViewsFrozen = Object.isFrozen(snapshot) && Object.values(snapshot).every(Object.isFrozen)
          const text = JSON.stringify({ session: state.id, build: state.builds })
          assets.replaceText(capabilityOutput.replaced, text)
          state.replacedViewRetained = replaced?.type === 'asset' && replaced.source === 'pending'
          assets.emit(capabilityOutput.emitted, text)
          assets.remove(capabilityOutput.removed)
          try {
            assets.emit(capabilityOutput.emitted, 'overwrite')
          }
          catch {
            state.duplicateEmissionRejected = true
          }
          try {
            assets.replaceText(capabilityOutput.removed, 'missing')
          }
          catch {
            state.missingReplacementRejected = true
          }
        },
      }),
    }) ?? []
  })
  // 与公开入口相同，配置前置不访问上一轮实例。
  const post = plugins.find(plugin => plugin.name === postPluginSlot.name)
  if (post) {
    post.config = createGenerationConfigHook({
      shouldOwnTailwindGeneration: true,
      generatorPlaceholderCssFile: path.join(resolvePackageDir('weapp-tailwindcss'), 'generator-placeholder.css'),
      debug: createDebug(),
    })
  }
  return plugins
}
