import path from 'node:path'
import postcss from 'postcss'

/** 固定本地模块身份，依赖跟踪与刷新由生成模块缓存负责。 */
export function prepareGenerationModuleRequests(css: string, base: string) {
  const files: string[] = []
  if (!css.includes('@config') && !css.includes('@plugin')) {
    return { css, files }
  }
  const root = postcss.parse(css)
  root.walkAtRules((rule) => {
    if (rule.name !== 'config' && rule.name !== 'plugin') {
      return
    }
    const match = /^(["'])(.*)\1$/.exec(rule.params.trim())
    if (!match) {
      return
    }
    const request = match[2]!
    const pathApi = /^[a-z]:[\\/]/i.test(base) || base.includes('\\') ? path.win32 : path
    if (!pathApi.isAbsolute(request) && !request.startsWith('.')) {
      return
    }
    const file = pathApi.resolve(base, request)
    files.push(file)
    rule.params = JSON.stringify(file.replaceAll('\\', '/'))
  })
  return { css: root.toString(), files }
}
