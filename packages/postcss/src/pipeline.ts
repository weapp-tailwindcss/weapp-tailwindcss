// 按阶段构建 PostCSS 插件流水线，并提供状态机式上下文信息
import type { AcceptedPlugin } from 'postcss'
import type postcssPresetEnv from 'postcss-preset-env'
import type { FeatureSignal } from './content-probe'
import type { IStyleHandlerOptions } from './types'
import { isAutoprefixerPlugin, resolveAutoprefixerPlugin } from './autoprefixer'
import { resolvePostcssFrameworkProfile } from './frameworks'
import { createColorFunctionalFallback } from './plugins/colorFunctionalFallback'
import { createContext } from './plugins/ctx'
import { getCalcDuplicateCleaner } from './plugins/getCalcDuplicateCleaner'
import { getCalcPlugin } from './plugins/getCalcPlugin'
import { getCustomPropertyCleaner } from './plugins/getCustomPropertyCleaner'
import { getPxTransformPlugin } from './plugins/getPxTransformPlugin'
import { getRemTransformPlugin } from './plugins/getRemTransformPlugin'
import { getUnitConversionPlugin } from './plugins/getUnitConversionPlugin'
import { getUnitsToPxPlugin } from './plugins/getUnitsToPxPlugin'
import { postcssWeappTailwindcssPostPlugin } from './plugins/post'
import { postcssWeappTailwindcssPrePlugin } from './plugins/pre'
import { createPresetEnvPlugin } from './plugins/preset-env'
import { createUserPluginStage } from './plugins/user-plugin-stage'

export type PipelineStage = 'pre' | 'normal' | 'post'

export interface PipelineNodeCursor {
  id: string
  stage: PipelineStage
}

export interface PipelineNodeContext {
  stage: PipelineStage
  /**
   * 整个流水线内的顺序索引（从 0 开始）
   */
  index: number
  /**
   * 当前流水线包含的节点总数
   */
  size: number
  /**
   * 所在阶段内的顺序索引（从 0 开始）
   */
  stageIndex: number
  /**
   * 所在阶段的节点数量
   */
  stageSize: number
  /**
   * 指向前一个节点的游标（若存在）
   */
  previous?: PipelineNodeCursor
  /**
   * 指向后一个节点的游标（若存在）
   */
  next?: PipelineNodeCursor
}

interface PipelinePreparedNode extends PipelineNodeCursor {
  createPlugin: (context: PipelineNodeContext) => AcceptedPlugin
}

interface UniAppXInternalStyleHandlerOptions extends IStyleHandlerOptions {
  uniAppXCssSource?: 'tailwind-root' | 'author' | 'author-apply'
}

export interface ResolvedPipelineNode extends PipelineNodeCursor {
  plugin: AcceptedPlugin
  context: PipelineNodeContext
}

export interface StyleProcessingPipeline {
  framework: ReturnType<typeof resolvePostcssFrameworkProfile>['framework']
  target: ReturnType<typeof resolvePostcssFrameworkProfile>['target']
  branch: ReturnType<typeof resolvePostcssFrameworkProfile>['branch']
  nodes: ResolvedPipelineNode[]
  plugins: AcceptedPlugin[]
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
  createPlugin: PipelinePreparedNode['createPlugin'],
): PipelinePreparedNode {
  return {
    id,
    stage,
    createPlugin,
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
  preparedNodes: PipelinePreparedNode[],
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
function createPreparedNodes(options: IStyleHandlerOptions, signal?: FeatureSignal): PipelinePreparedNode[] {
  const preparedNodes: PipelinePreparedNode[] = []
  if (isUniAppXNativeAuthorStyle(options)) {
    appendUniAppXNativeAuthorDeclarationNodes(preparedNodes, options)
    return preparedNodes
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
  const stagedUserPlugins = calcPlugin && userPlugins.length > 0
    ? [createUserPluginStage(userPlugins)]
    : userPlugins
  stagedUserPlugins.forEach((plugin, index) => {
    preparedNodes.push(createPreparedNode(`pre:user-${index}`, 'pre', () => plugin))
  })

  // 作者插件完成后、选择器和单位改写前求值，保留原始作用域及层叠上下文。
  if (calcPlugin) {
    preparedNodes.push(createPreparedNode('pre:calc', 'pre', () => calcPlugin))
  }

  preparedNodes.push(createPreparedNode('pre:core', 'pre', () => postcssWeappTailwindcssPrePlugin(options)))

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

  preparedNodes.push(createPreparedNode('post:core', 'post', () => postcssWeappTailwindcssPostPlugin(options)))

  return preparedNodes
}

// createStylePipeline 会实例化上下文、串联各个节点并提供邻接信息
export function createStylePipeline(options: IStyleHandlerOptions, signal?: FeatureSignal): StyleProcessingPipeline {
  // 管线创建前先初始化上下文，以便各插件共享状态
  options.ctx = createContext()

  const preparedNodes = createPreparedNodes(options, signal)
  const frameworkProfile = resolvePostcssFrameworkProfile(options)

  if (preparedNodes.length === 0) {
    return {
      framework: frameworkProfile.framework,
      target: frameworkProfile.target,
      branch: frameworkProfile.branch,
      nodes: [],
      plugins: [],
    }
  }

  const stageSizes = new Map<PipelineStage, number>()
  // 预先统计各阶段节点数量，便于生成上下文
  preparedNodes.forEach((node) => {
    stageSizes.set(node.stage, (stageSizes.get(node.stage) ?? 0) + 1)
  })

  const stageIndices = new Map<PipelineStage, number>()
  const nodes: ResolvedPipelineNode[] = []
  const size = preparedNodes.length

  preparedNodes.forEach((node, index) => {
    const stageIndex = stageIndices.get(node.stage) ?? 0
    const context: PipelineNodeContext = {
      stage: node.stage,
      index,
      size,
      stageIndex,
      stageSize: stageSizes.get(node.stage) ?? 0,
    }

    if (index > 0) {
      const prevNode = preparedNodes[index - 1]
      if (prevNode) {
        context.previous = {
          id: prevNode.id,
          stage: prevNode.stage,
        }
      }
    }

    if (index < size - 1) {
      const nextNode = preparedNodes[index + 1]
      if (nextNode) {
        context.next = {
          id: nextNode.id,
          stage: nextNode.stage,
        }
      }
    }

    stageIndices.set(node.stage, stageIndex + 1)

    nodes.push({
      id: node.id,
      stage: node.stage,
      plugin: node.createPlugin(context),
      context,
    })
  })

  return {
    framework: frameworkProfile.framework,
    target: frameworkProfile.target,
    branch: frameworkProfile.branch,
    nodes,
    plugins: nodes.map(node => node.plugin),
  }
}
