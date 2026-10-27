import { createGenericViteStyleInjector } from './vite/generic'
import { createTaroViteStyleInjector } from './vite/taro'
import { createUniAppViteStyleInjector } from './vite/uni-app'
import { createGenericWebpackStyleInjector } from './webpack/generic'
import { createMpxWebpackStyleInjector } from './webpack/mpx'
import { createTaroWebpackStyleInjector } from './webpack/taro'
import { createUniAppWebpackStyleInjector } from './webpack/uni-app'

// 保留旧内部入口；构建器与框架实现必须消费各自的独立模块。
export const viteStyleInjectorDelegates = {
  generic: createGenericViteStyleInjector,
  taro: createTaroViteStyleInjector,
  uniApp: createUniAppViteStyleInjector,
}
export const webpackStyleInjectorDelegates = {
  generic: createGenericWebpackStyleInjector,
  mpx: createMpxWebpackStyleInjector,
  taro: createTaroWebpackStyleInjector,
  uniApp: createUniAppWebpackStyleInjector,
}
export type { WeappTailwindcssStyleInjectorOptions, WeappTailwindcssStyleInjectorUserOptions } from './options'
export type { ViteStyleInjectorDelegateFactory, WebpackStyleInjectorDelegateFactory } from './types'
export { createBuiltinViteStyleInjectorPlugins } from './vite/runtime'
export { createBuiltinWebpackStyleInjectorPlugin } from './webpack/runtime'
