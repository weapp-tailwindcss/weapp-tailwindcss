import type { BundlerGeneratedCssMarkerBlock } from '../../shared/generated-css-marker'
import type { RememberedCssSource } from './types'
import { createHash } from 'node:crypto'
import { normalizeCssSourceIdentity } from '../css-memory'
import { parseVueRequest } from '../query'

export function compiledCssSourceScopeId(file: string) {
  return `vite-module:${normalizeCssSourceIdentity(file)}`
}

/** 来源身份仅证明归属；输入与依赖指纹才证明这份载荷已经完成本轮生成。 */
export function createCompiledCssSourceHash(source: string, dependencyRevision: string | number, file: string) {
  const { query } = parseVueRequest(file)
  return createHash('sha256').update(JSON.stringify([normalizeCssSourceIdentity(file), query.lang ?? 'css', query.scoped === true, source.trim(), dependencyRevision])).digest('hex')
}

export function isCurrentCompiledCssSource(source: Pick<RememberedCssSource, 'rawSource' | 'sourceFile'>, markers: readonly BundlerGeneratedCssMarkerBlock[], dependencyRevision: string | number | undefined) {
  if (dependencyRevision === undefined) {
    return false
  }
  const identity = normalizeCssSourceIdentity(source.sourceFile)
  const fingerprint = createCompiledCssSourceHash(source.rawSource, dependencyRevision, source.sourceFile)
  const matchingMarkers = markers.filter(marker => marker.bundler === 'vite'
    && marker.file != null
    && normalizeCssSourceIdentity(marker.file) === identity)
  return matchingMarkers.length > 0 && matchingMarkers.every(marker => marker.sourceHash === fingerprint)
}

/** 资产与当前输入必须双向完整对应，删除的样式块不能借其他当前块继续存活。 */
export function areCurrentCompiledCssSources(sources: readonly Pick<RememberedCssSource, 'rawSource' | 'sourceFile'>[], markers: readonly BundlerGeneratedCssMarkerBlock[], getSourceVersion: (file: string) => string | undefined) {
  const identities = new Set(sources.map(source => normalizeCssSourceIdentity(source.sourceFile)))
  return sources.length > 0
    && markers.every(marker => marker.bundler === 'vite' && marker.file != null && identities.has(normalizeCssSourceIdentity(marker.file)))
    && sources.every(source => isCurrentCompiledCssSource(source, markers, getSourceVersion(source.sourceFile)))
}
