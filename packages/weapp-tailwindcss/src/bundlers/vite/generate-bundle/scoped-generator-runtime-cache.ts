type RuntimeResolver = (
  outputFile: string,
  options: { isMainChunk?: boolean | undefined },
  runtime: Set<string>,
  rawSource?: string,
  sourceFile?: string,
  scopeToSource?: boolean,
) => Promise<Set<string>>

/** 缓存仅属于单轮 generateBundle，不跨候选或配置更新复用。 */
export function memoizeScopedGeneratorRuntime(resolve: RuntimeResolver): RuntimeResolver {
  const byRuntime = new WeakMap<Set<string>, Map<string, Promise<Set<string>>>>()
  return (outputFile, options, runtime, rawSource, sourceFile, scopeToSource) => {
    if (rawSource === undefined || sourceFile === undefined) {
      return resolve(outputFile, options, runtime, rawSource, sourceFile, scopeToSource)
    }
    let cache = byRuntime.get(runtime)
    if (!cache) {
      cache = new Map()
      byRuntime.set(runtime, cache)
    }
    const key = `${outputFile}\0${sourceFile}\0${options.isMainChunk === true ? 'main' : 'scoped'}\0${scopeToSource === true ? 'source' : 'runtime'}\0${rawSource}`
    const cached = cache.get(key)
    if (cached) {
      return cached
    }
    const pending = resolve(outputFile, options, runtime, rawSource, sourceFile, scopeToSource)
    cache.set(key, pending)
    return pending
  }
}
