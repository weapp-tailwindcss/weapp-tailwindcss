import type { WebCssCompatUserOptions } from '@weapp-tailwindcss/postcss/transform'
import type { sources } from 'webpack'
import { bundlerGeneratedCssMarkerRanges, collectWebCssGradientEdits } from '@weapp-tailwindcss/postcss/transform'

/** 保留框架正文与映射；精确删除本插件元数据，并在完整资产上补齐有消费图证明的渐变兼容。 */
export function preserveProcessedWebpackCssSource(source: sources.Source, { ReplaceSource }: Pick<typeof sources, 'ReplaceSource'>, webCompat?: WebCssCompatUserOptions) {
  const css = source.source().toString()
  const ranges = bundlerGeneratedCssMarkerRanges(css)
  const edits = collectWebCssGradientEdits(css, webCompat)
  if (ranges.length === 0 && edits.length === 0) {
    return source
  }
  const result = new ReplaceSource(source)
  for (const range of ranges) {
    result.replace(range.start, range.end - 1, '')
  }
  for (const edit of edits) {
    result.replace(edit.start, edit.end - 1, edit.text)
  }
  return result
}
