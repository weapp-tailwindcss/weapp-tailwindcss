// 插件入口：对外暴露管线构建结果与核心插件
import type { AcceptedPlugin } from 'postcss'
import type { IStyleHandlerOptions } from '../types'
import { createStylePipeline } from '../pipeline'

export { createStylePipeline } from '../pipeline'
export { postcssWeappTailwindcssPostPlugin } from './post'
export { postcssWeappTailwindcssPrePlugin } from './pre'
export { default as postcssRem2rpx } from 'postcss-rem-to-responsive-pixel'

// 仅 flat 管线具有可组合的真实插件数组。
export function getPlugins(options: IStyleHandlerOptions): AcceptedPlugin[] {
  const pipeline = createStylePipeline(options)
  if (pipeline.kind === 'phased') {
    throw new TypeError('Phased style pipelines require pipeline.process(input, options, after); use createStylePipeline().')
  }
  return pipeline.plugins
}
