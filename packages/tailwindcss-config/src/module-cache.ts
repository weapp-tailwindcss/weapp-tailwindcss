import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

/** 配置及本地辅助模块每次重新执行，已安装依赖继续复用原生缓存。 */
export function clearConfigModuleCache(filename: string) {
  const root = require.cache[filename] ?? require.cache[require.resolve(filename)]
  const visited = new Set<NodeJS.Module>()
  const childrenByParent = new Map<string, NodeJS.Module[]>()
  // Jiti 的原生辅助模块只记录 parent，未必同时加入父模块的 children。
  if (root && 'evalModule' in root.require) {
    for (const module of Object.values(require.cache)) {
      if (module?.parent?.filename) {
        const children = childrenByParent.get(module.parent.filename) ?? []
        children.push(module)
        childrenByParent.set(module.parent.filename, children)
      }
    }
  }
  function visit(module: NodeJS.Module) {
    if (visited.has(module)) {
      return
    }
    visited.add(module)
    if (module !== root) {
      let directory = path.dirname(module.filename)
      while (path.dirname(directory) !== directory) {
        if (path.basename(directory) === 'node_modules') {
          return
        }
        directory = path.dirname(directory)
      }
    }
    for (const child of [...module.children, ...(childrenByParent.get(module.filename) ?? [])]) {
      visit(child)
    }
    if (module.parent) {
      module.parent.children = module.parent.children.filter(child => child !== module)
    }
    delete require.cache[module.filename]
  }
  if (root) {
    visit(root)
  }
}
