import type { ElementNode, NodeTransform } from '@vue/compiler-dom'
import type { Plugin, ResolvedConfig } from 'vite'
import { NodeTypes } from '@vue/compiler-dom'
import { BORDER_PREFLIGHT_CLASS, shouldInjectBorderPreflight } from '../border-preflight'

interface VueCompilerOptions {
  template?: { compilerOptions?: { nodeTransforms?: NodeTransform[] } }
}

interface VueCompilerApi {
  options: VueCompilerOptions
}

interface CompilerContext {
  currentNode?: unknown
  node?: unknown
  filename?: string
  options?: { filename?: string }
}

function injectClass(node: ElementNode) {
  const attribute = node.props.find(prop => prop.type === NodeTypes.ATTRIBUTE && prop.name === 'class')
  if (attribute?.type === NodeTypes.ATTRIBUTE) {
    if (attribute.value?.content.split(/\s+/).includes(BORDER_PREFLIGHT_CLASS)) {
      return
    }
    attribute.value = {
      type: NodeTypes.TEXT,
      content: `${BORDER_PREFLIGHT_CLASS}${attribute.value?.content ? ` ${attribute.value.content}` : ''}`,
      loc: attribute.value?.loc ?? attribute.loc,
    }
    return
  }
  node.props.unshift({
    type: NodeTypes.ATTRIBUTE,
    name: 'class',
    nameLoc: node.loc,
    value: { type: NodeTypes.TEXT, content: BORDER_PREFLIGHT_CLASS, loc: node.loc },
    loc: node.loc,
  })
}

function withTransforms(options: VueCompilerOptions, nodeTransforms: NodeTransform[]): VueCompilerOptions {
  return {
    ...options,
    template: {
      ...options.template,
      compilerOptions: { ...options.template?.compilerOptions, nodeTransforms },
    },
  }
}

/** 在实际模板编译边界补齐基础类，不依赖来源标签或用户插件的配置顺序。 */
export function createUniAppXCompilerPreflightPlugin(options: {
  isEnabled: () => boolean
  range?: 'all' | undefined
}): Plugin {
  const registrations = new Map<VueCompilerApi, VueCompilerOptions>()
  let config: ResolvedConfig | undefined
  const transform: NodeTransform = (_node, rawContext) => {
    const context = rawContext as unknown as CompilerContext
    const filename = context.filename ?? context.options?.filename
    if (!options.isEnabled() || !filename || !/\.(?:uvue|nvue)(?:\?|$)/.test(filename)) {
      return
    }
    // 列表首位的退出回调在作者/平台标签映射之后、宿主 props 生成之前执行。
    return () => {
      const node = ('currentNode' in context ? context.currentNode : context.node) as ElementNode | undefined
      if (node?.type === NodeTypes.ELEMENT && shouldInjectBorderPreflight(node, options.range)) {
        injectClass(node)
      }
    }
  }

  const install = () => {
    if (!options.isEnabled()) {
      return
    }
    for (const plugin of config?.plugins ?? []) {
      if (plugin.name !== 'vite:vue' || !plugin.api?.options) {
        continue
      }
      const api = plugin.api as VueCompilerApi
      const original = api.options
      const transforms = original.template?.compilerOptions?.nodeTransforms ?? []
      if (transforms.includes(transform)) {
        continue
      }
      const installed = withTransforms(original, [transform, ...transforms])
      registrations.set(api, original)
      api.options = installed
    }
  }
  const dispose = () => {
    for (const [api, original] of registrations) {
      const current = api.options
      const transforms = current.template?.compilerOptions?.nodeTransforms
      if (!transforms?.includes(transform)) {
        continue
      }
      // 编译器也会原地补充 options；始终从当前配置移除本实例，不还原旧快照。
      const remaining = transforms.filter(item => item !== transform)
      const previous = original.template?.compilerOptions?.nodeTransforms
      const same = previous?.length === remaining.length && previous.every((item, index) => item === remaining[index])
      const next = withTransforms(current, same ? previous : remaining)
      const template = next.template!
      if (previous === undefined && remaining.length === 0) {
        delete template.compilerOptions!.nodeTransforms
      }
      if (!original.template?.compilerOptions && Object.keys(template.compilerOptions!).length === 0) {
        delete template.compilerOptions
      }
      if (!original.template && Object.keys(template).length === 0) {
        delete next.template
      }
      api.options = next
    }
    registrations.clear()
  }
  return {
    name: 'weapp-tailwindcss:uni-app-x:compiler-preflight',
    enforce: 'pre',
    configResolved: { order: 'post', handler(resolved) {
      config = resolved
      install()
    } },
    buildStart: install,
    closeBundle() {
      dispose()
      if (!this.meta?.watchMode && !config?.build?.watch) {
        config = undefined
      }
    },
    closeWatcher() {
      dispose()
      config = undefined
    },
  }
}
