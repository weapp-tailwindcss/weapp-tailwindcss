import type { CssTokenSourceMap, WebCssCompatUserOptions, WebCssPropertyFallbackEdit } from '@weapp-tailwindcss/postcss/transform'
import type { sources } from 'webpack'
import { bundlerGeneratedCssMarkerRanges, collectCssTokenSourceTraceEdits, collectWebCssGradientEdits } from '@weapp-tailwindcss/postcss/transform'

type EditableSources = Pick<typeof sources, 'ReplaceSource' | 'RawSource' | 'SourceMapSource'>

function createReplaceSource(source: sources.Source, css: string, constructors: EditableSources) {
  if (typeof source.source() === 'string') {
    return new constructors.ReplaceSource(source)
  }
  // ReplaceSource 的位置以 UTF-16 字符为单位，Buffer 先转为保留原映射的字符串 Source。
  const map = source.map()
  const textSource = map
    ? new constructors.SourceMapSource(css, 'weapp-tailwindcss.css', map)
    : new constructors.RawSource(css)
  return new constructors.ReplaceSource(textSource)
}

/** 在框架资产上只编辑追踪注释，不替换声明、规则或其原始映射。 */
export function annotateProcessedWebpackCssSource(source: sources.Source, constructors: EditableSources, tokenSources?: CssTokenSourceMap) {
  const css = source.source().toString()
  const edits = collectCssTokenSourceTraceEdits(css, tokenSources)
  if (edits.length === 0) {
    return source
  }
  const result = createReplaceSource(source, css, constructors)
  for (const edit of edits) {
    if (edit.start === edit.end) {
      result.insert(edit.start, edit.text)
    }
    else {
      result.replace(edit.start, edit.end - 1, edit.text)
    }
  }
  return result
}

/** 保留框架正文与映射；精确删除本插件元数据，并在完整资产上补齐有消费图证明的渐变兼容。 */
export function preserveProcessedWebpackCssSource(source: sources.Source, constructors: EditableSources, webCompat?: WebCssCompatUserOptions, propertyFallbackEdits: readonly WebCssPropertyFallbackEdit[] = []) {
  const css = source.source().toString()
  const ranges = bundlerGeneratedCssMarkerRanges(css)
  const edits = collectWebCssGradientEdits(css, webCompat)
  if (ranges.length === 0 && edits.length === 0 && propertyFallbackEdits.length === 0) {
    return source
  }
  const result = createReplaceSource(source, css, constructors)
  for (const range of ranges) {
    result.replace(range.start, range.end - 1, '')
  }
  for (const edit of edits) {
    result.replace(edit.start, edit.end - 1, edit.text)
  }
  for (const edit of propertyFallbackEdits) {
    result.insert(edit.start, edit.text)
  }
  return result
}
