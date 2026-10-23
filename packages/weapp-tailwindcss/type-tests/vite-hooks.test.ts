import type { Plugin, ResolvedConfig } from 'vite'
import type { ViteFrameworkStyleAssetContext } from '../src/bundlers/vite/shared/framework-asset-strategy'
import type { ViteFrameworkExtraPluginContext } from '../src/bundlers/vite/shared/framework-services'
import { getViteHookHandler } from '../src/bundlers/vite/plugin-hook'
import { wrapViteCssPostOutput } from '../src/bundlers/vite/watch-css-output'
import { createBuiltinViteStyleInjectorPlugins } from '../src/style-injector/internal'

type BuildStart = Extract<Plugin['buildStart'], (...args: never[]) => unknown>
type GenerateBundle = Extract<Plugin['generateBundle'], (...args: never[]) => unknown>

declare function expectType<T>(value: T): void
declare const config: ResolvedConfig
declare const context: ThisParameterType<BuildStart>
declare const buildOptions: Parameters<BuildStart>[0]
declare const output: Parameters<GenerateBundle>

// 同时检查函数与对象形式，参数和上下文必须来自宿主 Vite 的 hook。
const delegate: Plugin = {
  name: 'type-contract:delegate',
  buildStart(options) {
    expectType<ThisParameterType<BuildStart>>(this)
    expectType<Parameters<BuildStart>[0]>(options)
  },
  generateBundle: {
    order: 'post',
    handler(...args) {
      expectType<ThisParameterType<GenerateBundle>>(this)
      expectType<Parameters<GenerateBundle>>(args)
    },
  },
}

wrapViteCssPostOutput(config)
for (const plugin of createBuiltinViteStyleInjectorPlugins(true, () => Object.assign(() => [delegate], { slots: [{ name: delegate.name, hooks: { buildStart: true as const, generateBundle: { order: 'post' as const } } }] }))) {
  getViteHookHandler(plugin.buildStart)?.call(context, buildOptions)
  getViteHookHandler(plugin.generateBundle)?.call(context, ...output)
}

// 框架扩展不能写入共享配置，也不能索取构建器持有的样式配置缓存。
declare const extension: ViteFrameworkExtraPluginContext
declare const styleAssets: ViteFrameworkStyleAssetContext
if (extension.cssPreflight) {
  // @ts-expect-error 框架配置必须只读。
  extension.cssPreflight['margin'] = '1'
}
// @ts-expect-error 属性登记数组必须只读。
extension.customAttributesEntities.push(['view', 'class'])
// @ts-expect-error 属性登记元组必须只读。
extension.customAttributesEntities[0]![0] = 'text'
const attributeNames = extension.customAttributesEntities[0]![1]
if (typeof attributeNames !== 'string' && !(attributeNames instanceof RegExp)) {
  // @ts-expect-error 嵌套属性数组必须只读。
  attributeNames.push('style')
}
// @ts-expect-error 样式资产上下文只暴露匹配操作，不暴露缓存配置。
styleAssets.getCssHandlerOptions('entry.css')
expectType<boolean>(styleAssets.matchesMainCss('entry.css'))
