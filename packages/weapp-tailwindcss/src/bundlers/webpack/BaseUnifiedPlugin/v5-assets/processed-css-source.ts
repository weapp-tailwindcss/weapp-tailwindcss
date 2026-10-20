import type { sources } from 'webpack'
import { bundlerGeneratedCssMarkerRanges } from '@weapp-tailwindcss/postcss/transform'

/** 框架 loader 拥有正文与映射；仅精确删除本插件的元数据，不重建整段 CSS。 */
export function preserveProcessedWebpackCssSource(source: sources.Source, { ReplaceSource }: Pick<typeof sources, 'ReplaceSource'>) {
  const ranges = bundlerGeneratedCssMarkerRanges(source.source().toString())
  if (ranges.length === 0) {
    return source
  }
  const result = new ReplaceSource(source)
  for (const range of ranges) {
    result.replace(range.start, range.end - 1, '')
  }
  return result
}
