import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

export interface WorkspacePackage {
  name: string
  root: string
  files: string[]
  options: ts.CompilerOptions
  dependencies: string[]
  exports: unknown
}

export function inside(root: string, file: string) {
  const relative = path.relative(root, file)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

export function sourceFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return []
  }
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && entry.name === 'node_modules') {
      return []
    }
    const file = path.join(root, entry.name)
    return entry.isDirectory() ? sourceFiles(file) : /\.[cm]?[jt]sx?$/.test(file) ? [file] : []
  })
}

export function readWorkspace(root: string): WorkspacePackage[] {
  return ['packages', 'packages-runtime'].flatMap((folder) => {
    const base = path.join(root, folder)
    if (!fs.existsSync(base)) {
      return []
    }
    return fs.readdirSync(base, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap((entry) => {
      const directory = path.join(base, entry.name)
      const manifest = path.join(directory, 'package.json')
      if (!fs.existsSync(manifest)) {
        return []
      }
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'))
      const configPath = ts.findConfigFile(directory, ts.sys.fileExists)
      const config = configPath ? ts.readConfigFile(configPath, ts.sys.readFile) : undefined
      const options = configPath && config ? ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath)).options : {}
      return [{ name: pkg.name, root: directory, files: sourceFiles(path.join(directory, 'src')), options, dependencies: Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies }), exports: pkg.exports }]
    })
  })
}

function targets(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }
  return value && typeof value === 'object' ? Object.values(value).flatMap(targets) : []
}

/** 将发布入口映射回源码，不依赖旧 dist 或 node_modules 的 workspace 链接。 */
export function resolveWorkspaceEntry(pkg: WorkspacePackage, specifier: string) {
  const subpath = specifier === pkg.name ? '.' : `.${specifier.slice(pkg.name.length)}`
  const exports = pkg.exports as Record<string, unknown> | undefined
  let entries = targets(subpath === '.' && (typeof pkg.exports === 'string' || (exports && !Object.keys(exports).some(key => key.startsWith('.')))) ? pkg.exports : exports?.[subpath])
  if (!entries.length && exports) {
    for (const [key, value] of Object.entries(exports)) {
      if (!key.includes('*')) {
        continue
      }
      const [prefix, suffix = ''] = key.split('*')
      if (subpath.startsWith(prefix!) && subpath.endsWith(suffix)) {
        const match = subpath.slice(prefix!.length, suffix ? -suffix.length : undefined)
        entries = targets(value).map(target => target.replace('*', match))
        break
      }
    }
  }
  const candidates = entries.flatMap((entry) => {
    const absolute = path.resolve(pkg.root, entry)
    const relative = path.relative(path.join(pkg.root, 'dist'), absolute)
    const source = inside(path.join(pkg.root, 'dist'), absolute) ? path.join(pkg.root, 'src', relative) : absolute
    const base = source.replace(/(?:\.d)?\.[cm]?[jt]sx?$/, '')
    return [source, ...['.ts', '.mts', '.cts', '.tsx', '.js', '.mjs', '.cjs', '.jsx'].map(extension => `${base}${extension}`), path.join(base, 'index.ts')]
  })
  return candidates.find(file => pkg.files.includes(file))
}
