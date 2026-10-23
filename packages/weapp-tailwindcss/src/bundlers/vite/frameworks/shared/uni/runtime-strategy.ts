import type { ViteFrameworkRuntimeStrategy } from '../../../shared/framework-runtime-strategy'
import { cleanUrl } from '../../../utils'

/** uni 系列构建图的公共 HMR 能力；具体框架决定是否安装。 */
export const uniViteRuntimeStrategy: ViteFrameworkRuntimeStrategy = {
  isTemplateHotSource: id => /\.(?:uvue|nvue)$/i.test(cleanUrl(id)),
  isTemplateHotSourceModule: id => /\.(?:uvue|nvue)(?:\?import)?$/i.test(id),
  requiresCssHotReload: facts => facts?.pluginNames.some(name => name.includes('uni')) ?? false,
}
