import type { LoaderAnchorFinders } from '../../shared/loader-anchors'
import { createFinder, createPrioritizedFinder } from '../../shared/loader-anchors'

const MPX_STYLE_COMPILER_LOADER = '@mpxjs/webpack-plugin/lib/style-compiler/index'
const MPX_STRIP_CONDITIONAL_LOADER = '@mpxjs/webpack-plugin/lib/style-compiler/strip-conditional-loader'

export function createMpxLoaderAnchorFinders(): LoaderAnchorFinders {
  // 重写先于样式编译，候选集合处理仍在样式编译之后执行。
  return {
    findRewriteAnchor: createPrioritizedFinder([MPX_STYLE_COMPILER_LOADER, MPX_STRIP_CONDITIONAL_LOADER]),
    findClassSetAnchor: createFinder([MPX_STYLE_COMPILER_LOADER]),
  }
}
