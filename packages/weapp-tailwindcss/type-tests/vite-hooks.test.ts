import type { Plugin, ResolvedConfig } from 'vite'
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
for (const plugin of createBuiltinViteStyleInjectorPlugins(true, () => () => [delegate])) {
  getViteHookHandler(plugin.buildStart)?.call(context, buildOptions)
  getViteHookHandler(plugin.generateBundle)?.call(context, ...output)
}
