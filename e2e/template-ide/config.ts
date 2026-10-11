import { readFile } from 'node:fs/promises'
import path from 'node:path'

interface PageConfig {
  usingComponents?: Record<string, string>
}

function parseConfig(source: string): PageConfig {
  const config = JSON.parse(source)
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('页面配置必须是 JSON 对象。')
  }
  return config
}

/** 页面注册依赖真实 JSON 产物，源码空对象不能替代编译器漏掉的文件。 */
export async function readTemplatePageConfig(outputFile: string): Promise<PageConfig> {
  return parseConfig(await readFile(outputFile, 'utf8'))
}

/** 路由采用小程序逻辑路径；文件位置始终由当前平台的路径 API 解析。 */
export function resolveTemplatePageConfigFile(root: string, route: string, paths: typeof path = path) {
  if (!route || route.includes('\\') || route.includes(':') || route.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`页面路由无效：${route}`)
  }
  return paths.resolve(root, `${route}.json`)
}

/** 仅检查 app.json 注册的页面，避免将组件或 class 报告当作页面配置。 */
export async function readTemplatePageConfigs(root: string) {
  const app = JSON.parse(await readFile(path.resolve(root, 'app.json'), 'utf8')) as {
    pages?: string[]
    subPackages?: Array<{ root: string, pages: string[] }>
    subpackages?: Array<{ root: string, pages: string[] }>
  }
  const routes = [...app.pages ?? []]
  for (const group of [...app.subPackages ?? [], ...app.subpackages ?? []]) {
    const groupRoot = group.root.replace(/\/$/, '')
    resolveTemplatePageConfigFile(root, groupRoot)
    for (const page of group.pages) {
      resolveTemplatePageConfigFile(root, page)
      routes.push(`${groupRoot}/${page}`)
    }
  }
  if (!routes.length) {
    throw new Error('app.json 必须注册至少一个页面。')
  }
  return Promise.all([...new Set(routes)].map(async (route) => {
    const file = resolveTemplatePageConfigFile(root, route)
    return { route, file, config: await readTemplatePageConfig(file) }
  }))
}
