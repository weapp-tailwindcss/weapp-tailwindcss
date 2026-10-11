import type { OutputBundle } from 'rollup'
import path from 'node:path'
import { parseCssImportSpecifier, postcss, quoteCssImportSpecifier } from '@weapp-tailwindcss/postcss/transform'
import { normalizeOutputPathKey } from '@/bundlers/shared/module-graph'

export function linkEntryChunkStyles(bundle: OutputBundle, options: {
  matchesCss: (file: string) => boolean
  resolveOutputFile: (sourceFile: string) => string | undefined
  onUpdate?: ((file: string, oldVal: string, newVal: string) => void) | undefined
}) {
  const assets = new Map(Object.entries(bundle).flatMap(([key, output]) => output.type === 'asset'
    ? [[normalizeOutputPathKey(output.fileName || key), output] as const]
    : []))
  const imports = new Map<string, Set<string>>()
  for (const [file, asset] of assets) {
    if (!options.matchesCss(file)) {
      continue
    }
    const targets = new Set<string>()
    postcss.parse(asset.source.toString()).walkAtRules('import', (rule) => {
      const request = parseCssImportSpecifier(rule.params)?.specifier
      if (request && !/^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(request)) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), request))
        if (assets.has(target)) {
          targets.add(target)
        }
      }
    })
    imports.set(file, targets)
  }
  const reaches = (from: string, target: string, visited = new Set<string>()): boolean => {
    if (from === target) {
      return true
    }
    if (visited.has(from)) {
      return false
    }
    visited.add(from)
    return [...(imports.get(from) ?? [])].some(next => reaches(next, target, visited))
  }
  for (const chunk of Object.values(bundle)) {
    if (chunk.type !== 'chunk' || !chunk.isEntry) {
      continue
    }
    const entry = path.posix.parse(normalizeOutputPathKey(chunk.fileName))
    const roots = [...assets].filter(([file]) => {
      const style = path.posix.parse(file)
      return options.matchesCss(file) && style.dir === entry.dir && style.name === entry.name
    })
    if (roots.length !== 1) {
      continue
    }
    const [file, asset] = roots[0]!
    const original = asset.source.toString()
    const requests: string[] = []
    for (const id of Object.keys(chunk.modules ?? {})) {
      const output = options.resolveOutputFile(id)
      const target = output && normalizeOutputPathKey(output)
      if (!target || !imports.has(target) || reaches(file, target) || reaches(target, file)) {
        continue
      }
      // 同时更新依赖图，让本轮新增的边也参与去重和环检测。
      imports.get(file)!.add(target)
      const relative = path.posix.relative(path.posix.dirname(file), target)
      requests.push(`@import ${quoteCssImportSpecifier(relative.startsWith('.') ? relative : `./${relative}`)};\n`)
    }
    if (requests.length > 0) {
      const next = requests.join('') + original
      asset.source = next
      options.onUpdate?.(file, original, next)
    }
  }
}
