// 按阶段构建 PostCSS 插件流水线，并提供状态机式上下文信息
import type { AcceptedPlugin } from 'postcss'
import type postcssPresetEnv from 'postcss-preset-env'
import type { FeatureSignal } from '../content-probe'
import type { IStyleHandlerOptions } from '../types'
import type { AuthorStage } from './author'
import type { PreparedPipelineNode } from './execution'
import type { PipelineStage } from './types'
import { isAutoprefixerPlugin, resolveAutoprefixerPlugin } from '../autoprefixer'
import { createColorFunctionalFallback } from '../plugins/colorFunctionalFallback'
import { getCalcDuplicateCleaner } from '../plugins/getCalcDuplicateCleaner'
import { getCalcPlugin } from '../plugins/getCalcPlugin'
import { getCustomPropertyCleaner } from '../plugins/getCustomPropertyCleaner'
import { getPxTransformPlugin } from '../plugins/getPxTransformPlugin'
import { getRemTransformPlugin } from '../plugins/getRemTransformPlugin'
import { getUnitConversionPlugin } from '../plugins/getUnitConversionPlugin'
import { getUnitsToPxPlugin } from '../plugins/getUnitsToPxPlugin'

import { postcssWeappTailwindcssPostPlugin } from '../plugins/post'
import { postcssWeappTailwindcssPrePlugin } from '../plugins/pre'
import { createPresetEnvPlugin } from '../plugins/preset-env'
import { createAuthorStage } from './author'

interface UniAppXInternalStyleHandlerOptions extends IStyleHandlerOptions {
  uniAppXCssSource?: 'tailwind-root' | 'author' | 'author-apply'
}

// normalizeUserPlugins 统一用户自定义插件的写法，确保最终拿到数组形式
function normalizeUserPlugins(plugins: unknown): AcceptedPlugin[] {
  if (!plugins) {
    return []
  }

  if (Array.isArray(plugins)) {
    return plugins.filter(Boolean) as AcceptedPlugin[]
  }

  if (typeof plugins === 'object') {
    return Object.values(plugins as Record<string, unknown>).filter(Boolean) as AcceptedPlugin[]
  }

  return []
}

function createPreparedNode(
  id: string,
  stage: PipelineStage,
  createPlugin: PreparedPipelineNode['createPlugin'],
  fresh = false,
): PreparedPipelineNode {
  return {
    id,
    stage,
    createPlugin,
    fresh,
  }
}

function hasUserAutoprefixerPlugin(rawPlugins: unknown, plugins: AcceptedPlugin[]): boolean {
  if (plugins.some(plugin => isAutoprefixerPlugin(plugin))) {
    return true
  }
  if (rawPlugins && !Array.isArray(rawPlugins) && typeof rawPlugins === 'object') {
    const autoprefixerEntry = (rawPlugins as Record<string, unknown>)['autoprefixer']
    return Boolean(autoprefixerEntry)
  }
  return false
}

function shouldUseDefaultAutoprefixer(options: IStyleHandlerOptions, userPlugins: AcceptedPlugin[]) {
  if (options.autoprefixer === false) {
    return false
  }
  if (hasUserAutoprefixerPlugin(options.postcssOptions?.plugins, userPlugins)) {
    return false
  }
  if (options.autoprefixer === true || typeof options.autoprefixer === 'object') {
    return true
  }
  return options.majorVersion === 4
}

function isUniAppXNativeAuthorStyle(options: IStyleHandlerOptions) {
  const source = (options as UniAppXInternalStyleHandlerOptions).uniAppXCssSource
  return options.uniAppX === true
    && options.uniAppXCssTarget === 'uvue'
    && (source === 'author' || source === 'author-apply')
}

function appendUniAppXNativeAuthorDeclarationNodes(
  preparedNodes: PreparedPipelineNode[],
  options: IStyleHandlerOptions,
) {
  if ((options as UniAppXInternalStyleHandlerOptions).uniAppXCssSource !== 'author-apply') {
    return
  }

  const declarationPlugins = [
    ['normal:calc', getCalcPlugin(options)],
    ['normal:units-to-px', getUnitsToPxPlugin(options)],
    ['normal:px-transform', getPxTransformPlugin(options)],
    ['normal:rem-transform', getRemTransformPlugin(options)],
    ['normal:unit-conversion', getUnitConversionPlugin(options)],
  ] as const

  for (const [id, plugin] of declarationPlugins) {
    if (plugin) {
      preparedNodes.push(createPreparedNode(id, 'normal', () => plugin))
    }
  }
}

// createPreparedNodes 直接按最终顺序生成可实例化节点，避免 definition 二次中转
export function createPreparedNodes(options: IStyleHandlerOptions, signal?: FeatureSignal) {
  let author: AuthorStage | undefined
  const preparedNodes: PreparedPipelineNode[] = []
  if (isUniAppXNativeAuthorStyle(options)) {
    appendUniAppXNativeAuthorDeclarationNodes(preparedNodes, options)
    return { nodes: preparedNodes, author }
  }
  const userPlugins = normalizeUserPlugins(options.postcssOptions?.plugins)
  const presetEnvOptions = {
    ...options.cssPresetEnv,
    features: {
      ...options.cssPresetEnv?.features,
      'cascade-layers': false,
    },
  } as Parameters<typeof postcssPresetEnv>[0]
  const calcPlugin = getCalcPlugin(options)
  if (calcPlugin && userPlugins.length > 0) {
    author = createAuthorStage(userPlugins)
  }
  else {
    userPlugins.forEach((plugin, index) => {
      preparedNodes.push(createPreparedNode(`pre:user-${index}`, 'pre', () => plugin))
    })
  }

  // 作者插件完成后、选择器和单位改写前求值，保留原始作用域及层叠上下文。
  if (calcPlugin) {
    preparedNodes.push(createPreparedNode('pre:calc', 'pre', () => calcPlugin))
  }

  preparedNodes.push(createPreparedNode('pre:core', 'pre', (_context, runOptions) => postcssWeappTailwindcssPrePlugin(runOptions), true))

  if (!signal || signal.hasPresetEnvFeatures) {
    // 小程序和 WebView 保留运行时状态，UVUE 继续使用原生静态降级契约。
    const preserveRuntimeVariables = options.appType === 'uni-app-x'
      && !(options.uniAppX === true && options.uniAppXCssTarget === 'uvue')
    preparedNodes.push(createPreparedNode('normal:preset-env', 'normal', () => createPresetEnvPlugin(presetEnvOptions, preserveRuntimeVariables)))
  }
  if (!signal || signal.hasModernColorFunction) {
    preparedNodes.push(createPreparedNode('normal:color-functional-fallback', 'normal', () => createColorFunctionalFallback()))
  }

  const unitsToPxPlugin = getUnitsToPxPlugin(options)
  if (unitsToPxPlugin) {
    preparedNodes.push(createPreparedNode('normal:units-to-px', 'normal', () => unitsToPxPlugin))
  }

  const pxTransformPlugin = getPxTransformPlugin(options)
  if (pxTransformPlugin) {
    preparedNodes.push(createPreparedNode('normal:px-transform', 'normal', () => pxTransformPlugin))
  }

  const remTransformPlugin = getRemTransformPlugin(options)
  if (remTransformPlugin) {
    preparedNodes.push(createPreparedNode('normal:rem-transform', 'normal', () => remTransformPlugin))
  }

  const unitConversionPlugin = getUnitConversionPlugin(options)
  if (unitConversionPlugin) {
    preparedNodes.push(createPreparedNode('normal:unit-conversion', 'normal', () => unitConversionPlugin))
  }

  const calcDuplicateCleaner = getCalcDuplicateCleaner(options)
  if (calcDuplicateCleaner) {
    preparedNodes.push(createPreparedNode('normal:calc-duplicate-cleaner', 'normal', () => calcDuplicateCleaner))
  }

  const customPropertyCleaner = getCustomPropertyCleaner(options)
  if (customPropertyCleaner) {
    preparedNodes.push(createPreparedNode('normal:custom-property-cleaner', 'normal', () => customPropertyCleaner))
  }

  if (shouldUseDefaultAutoprefixer(options, userPlugins)) {
    const plugin = resolveAutoprefixerPlugin(options.autoprefixer)
    if (plugin) {
      preparedNodes.push(createPreparedNode('normal:autoprefixer', 'normal', () => plugin))
    }
  }

  preparedNodes.push(createPreparedNode('post:core', 'post', (_context, runOptions) => postcssWeappTailwindcssPostPlugin(runOptions), true))

  return { nodes: preparedNodes, author }
}
