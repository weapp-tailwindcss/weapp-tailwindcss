import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

export function loadDependencies() {
  // CI 可将两个纯 JS 依赖安装到隔离目录，避免为了路由安装整个 workspace。
  const require = createRequire(process.env.CI_SCOPE_DEPENDENCY_ROOT
    ? path.join(path.resolve(process.env.CI_SCOPE_DEPENDENCY_ROOT), 'package.json')
    : import.meta.url)
  return { yaml: require('yaml'), semver: require('semver') }
}
