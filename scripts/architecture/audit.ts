import type { Graph } from './graph'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { auditClientBoundaries } from './client-boundaries'
import { auditCssCompat } from './css-compat'
import { findCycles, findPath } from './graph'
import { readImports } from './imports'
import { inside, readWorkspace, resolveWorkspaceEntry } from './workspace'

export function auditArchitecture(root: string) {
  const packages = readWorkspace(root)
  const names = new Map(packages.map(pkg => [pkg.name, pkg]))
  const files = new Set(packages.flatMap(pkg => pkg.files))
  const values: Graph = new Map()
  const all: Graph = new Map()
  const packageGraph: Graph = new Map(packages.map(pkg => [pkg.name, new Set(pkg.dependencies.filter(name => names.has(name)))]))
  const errors: string[] = []
  for (const pkg of packages) {
    for (const file of pkg.files) {
      const valueEdges = new Set<string>()
      const allEdges = new Set<string>()
      values.set(file, valueEdges)
      all.set(file, allEdges)
      for (const edge of readImports(file, fs.readFileSync(file, 'utf8'))) {
        const dependency = packages.find(item => edge.specifier === item.name || edge.specifier.startsWith(`${item.name}/`))
        const resolved = ts.resolveModuleName(edge.specifier, file, pkg.options, ts.sys).resolvedModule
        const candidate = dependency ? resolveWorkspaceEntry(dependency, edge.specifier) : resolved?.resolvedFileName
        const target = candidate ? path.resolve(candidate) : undefined
        if (!edge.typeOnly && !dependency && !edge.specifier.startsWith('.') && !edge.specifier.startsWith('@/') && (!target || resolved?.isExternalLibraryImport)) {
          valueEdges.add(`external:${edge.specifier}`)
        }
        if (dependency && dependency !== pkg && !edge.typeOnly && !/\.d\.[cm]?ts$/.test(file)) {
          packageGraph.get(pkg.name)!.add(dependency.name)
        }
        if (target && files.has(target)) {
          allEdges.add(target)
          const owner = packages.find(item => inside(item.root, target))
          if (owner && owner !== pkg && !edge.typeOnly && !/\.d\.[cm]?ts$/.test(file)) {
            packageGraph.get(pkg.name)!.add(owner.name)
          }
          if (!edge.typeOnly && !/\.d\.[cm]?ts$/.test(file)) {
            valueEdges.add(target)
          }
        }
        else if (target && !resolved?.isExternalLibraryImport && !target.split(path.sep).includes('node_modules') && /\.[cm]?[jt]sx?$/.test(target)) {
          errors.push(`本地依赖超出生产源码范围：${path.relative(root, file)} -> ${path.relative(root, target)}`)
        }
        else if (dependency && !edge.specifier.endsWith('/package.json')) {
          // 纯样式资源不参与 JS 模块图；声明入口仍需映射到真实源码。
          if (!/\.(?:css|scss|wxss)$/.test(edge.specifier)) {
            errors.push(`无法解析 workspace 源码：${path.relative(root, file)} -> ${edge.specifier}`)
          }
        }
        else if (!resolved && (edge.specifier.startsWith('.') || edge.specifier.startsWith('@/') || edge.specifier.startsWith('#') || Object.entries(pkg.options.paths ?? {}).some(([alias, targets]) => !targets.every(target => target.includes('node_modules')) && (alias.includes('*') ? edge.specifier.startsWith(alias.split('*')[0]!) && edge.specifier.endsWith(alias.split('*')[1]!) : edge.specifier === alias)))) {
          errors.push(`无法解析本地依赖：${path.relative(root, file)} -> ${edge.specifier}`)
        }
        else if (/^(?:vite|webpack|rollup|rspack|@rspack\/core|vinyl)(?:$|\/)/.test(edge.specifier)) {
          allEdges.add(`external:${edge.specifier}`)
        }
      }
    }
  }
  for (const cycle of findCycles(values)) {
    errors.push(`值依赖循环：${cycle.map(file => path.relative(root, file)).join(' -> ')}`)
  }
  for (const cycle of findCycles(packageGraph)) {
    errors.push(`包依赖循环：${cycle.join(' -> ')}`)
  }
  const mainSource = path.join(root, 'packages', 'weapp-tailwindcss', 'src')
  for (const [name, forbiddenNames] of [
    ['source-scan', ['engine', 'postcss', 'weapp-tailwindcss', 'cli', 'weapp-style-injector']],
    ['engine', ['postcss', 'weapp-tailwindcss', 'cli', 'weapp-style-injector']],
  ] as const) {
    const sourceRoot = path.join(root, 'packages', name, 'src')
    const forbiddenRoots = forbiddenNames.map(name => path.join(root, 'packages', name))
    for (const start of files) {
      if (!inside(sourceRoot, start)) {
        continue
      }
      const chain = findPath(all, start, file => forbiddenRoots.some(root => inside(root, file)))
      if (chain) {
        errors.push(`基础包反向依赖：${chain.map(file => path.relative(root, file)).join(' -> ')}`)
      }
    }
  }
  const coreDirs = ['core', 'compiler', 'context', 'generator', 'generation', 'tailwindcss', 'js', 'wxml', 'cache', 'project-sources']
  const corePackages = ['source-scan', 'engine'].map(name => path.join(root, 'packages', name, 'src'))
  const postcssSource = path.join(root, 'packages', 'postcss', 'src')
  const starts = [...files].filter(file => corePackages.some(directory => inside(directory, file))
    || ['syntax.ts', 'transform.ts'].some(entry => file === path.join(postcssSource, entry)) || file === path.join(mainSource, 'core.ts') || coreDirs.some(directory => inside(path.join(mainSource, directory), file)))
  const forbidden = (file: string) => file.startsWith('external:') || inside(path.join(mainSource, 'bundlers'), file) || file === path.join(postcssSource, 'plugin.ts') || file === path.join(postcssSource, 'generator-plugin', 'index.ts') || inside(path.join(root, 'packages', 'cli', 'src'), file)
  const reported = new Set<string>()
  for (const start of starts) {
    const chain = findPath(all, start, forbidden)
    if (chain) {
      const last = chain.slice(-2).join(' -> ')
      if (!reported.has(last)) {
        reported.add(last)
        errors.push(`核心反向依赖：${chain.map(file => file.startsWith('external:') ? file : path.relative(root, file)).join(' -> ')}`)
      }
    }
  }
  errors.push(...auditClientBoundaries(root, packages, values), ...auditCssCompat(root))
  return { errors, files: files.size, packages: packages.length }
}
