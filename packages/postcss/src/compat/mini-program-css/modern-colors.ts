import postcss from 'postcss'
import { unwrapTailwindSourceMedia } from './directives'
import { removeUnsupportedModernColorDeclarations } from './root-cleanups'

/** 在删除注册与条件证据前处理 mix，避免后续阶段把动态主题重新当成常量。 */
export function normalizeMiniProgramColorMix(css: string) {
  if (!/color-mix\(/i.test(css)) {
    return css
  }
  try {
    const root = postcss.parse(css)
    unwrapTailwindSourceMedia(root)
    removeUnsupportedModernColorDeclarations(root)
    return root.toString()
  }
  catch {
    // 编辑中的不完整样式继续交给正常语法诊断，不猜测其变量资格。
    return css
  }
}
