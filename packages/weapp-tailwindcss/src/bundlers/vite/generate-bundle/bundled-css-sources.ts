import type { OutputBundle } from 'rollup'
import type { RememberedCssSource } from './types'
import { isSourceStyleRequest } from '../../../generation/style-requests'
import { normalizeCssSourceIdentity } from '../css-memory'

/** 模块图只证明该来源已提交，不授予其对合并 CSS 资产的替换或删除权限。 */
export function selectUnbundledCssReplaySources(
  sources: Iterable<[string, RememberedCssSource]> | undefined,
  bundle: Readonly<OutputBundle>,
  onBundledSource: (sourceFile: string) => void,
) {
  const rememberedSources = [...sources ?? []]
  if (!rememberedSources.some(([, source]) => source.delivery === 'vite-module')) {
    return rememberedSources
  }
  const bundledSources = new Set<string>()
  for (const output of Object.values(bundle)) {
    if (output.type !== 'chunk') {
      continue
    }
    for (const id of [...output.moduleIds ?? [], ...Object.keys(output.modules ?? {})]) {
      if (isSourceStyleRequest(id)) {
        bundledSources.add(normalizeCssSourceIdentity(id))
      }
    }
  }
  return rememberedSources.filter(([, source]) => {
    if (source.delivery !== 'vite-module' || !bundledSources.has(normalizeCssSourceIdentity(source.sourceFile))) {
      return true
    }
    onBundledSource(source.sourceFile)
    return false
  })
}
