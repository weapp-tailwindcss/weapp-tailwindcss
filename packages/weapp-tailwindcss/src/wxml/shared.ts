import type { ITemplateHandlerOptions } from '../types'
import { escape, MappingChars2String } from '@weapp-tailwindcss/escape'
import { omitUndefined } from '../utils/object'

// 匹配换行符（用于去除无用换行和空格）
const NEWLINE_RE = /[\n\r]+/g

export function replaceWxml(
  original: string,
  options: ITemplateHandlerOptions = {
    keepEOL: false,
    escapeMap: MappingChars2String,
  },
) {
  const { keepEOL, escapeMap, ignoreHead } = options
  let res = original
  if (!keepEOL) {
    res = res
      // 去除无用换行符和空格
      // 不能全去掉，头条小程序变量绑定，实现方式依赖空格，你说坑不坑？
      .replaceAll(NEWLINE_RE, '')
  }

  res = escape(res, omitUndefined({
    map: escapeMap,
    ignoreHead,
  }))

  return res
}
