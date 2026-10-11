import type { RawSourceMap } from '@ampproject/remapping'
import type { postcss } from '@weapp-tailwindcss/postcss/transform'
import type { ExistingRawSourceMap, SourceDescription } from 'rollup'
import { cleanUrl, formatPostcssSourceMap, normalizePath } from '@/bundlers/vite/utils'
import { reportStyleWarnings } from './style-request'

/** 将样式处理结果和源码映射统一转换为 Vite 模块结果。 */
export async function createUniAppXStyleResult(id: string, result: postcss.Result) {
  reportStyleWarnings(result)
  const rawPostcssMap = result.map.toJSON()
  const map = await formatPostcssSourceMap(
    rawPostcssMap as Omit<RawSourceMap, 'version'> as ExistingRawSourceMap,
    normalizePath(cleanUrl(id)),
  )
  return {
    code: result.css,
    map: JSON.stringify(map),
  } satisfies Pick<SourceDescription, 'code' | 'map'>
}
