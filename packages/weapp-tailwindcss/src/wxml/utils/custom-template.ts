import type { ITemplateHandlerOptions } from '../../types'
import type { AttributeMatcher } from '../custom-attributes'
import { Parser } from 'htmlparser2'
import MagicString from 'magic-string'
import { createAttributeMatcher } from '../custom-attributes'
import { templateReplacer } from './template-fragments'

export async function customTemplateHandler(rawSource: string, options: ITemplateHandlerOptions, cachedMatcher?: AttributeMatcher | undefined) {
  const {
    customAttributesEntities = [],
    disabledDefaultTemplateHandler,
    inlineWxs,
    runtimeSet,
    jsHandler,
  } = options ?? {}
  // 优先使用外部预构建的 matcher，避免每次调用都重建
  const matchCustomAttribute = cachedMatcher ?? createAttributeMatcher(customAttributesEntities)
  const defaultTemplateHandlerEnabled = !disabledDefaultTemplateHandler
  let replaceOptions: ITemplateHandlerOptions | undefined
  let cachedQuote: string | null | undefined
  let s: MagicString | undefined
  let tag = ''
  let wxsArray: {
    startIndex: number
    endIndex: number
    data: string
  }[] | undefined

  function getMagicString() {
    if (!s) {
      s = new MagicString(rawSource)
    }
    return s
  }

  function getReplaceOptions(quote: string | null | undefined) {
    if (!replaceOptions) {
      replaceOptions = {
        ...options,
        quote,
      }
      cachedQuote = quote
      return replaceOptions
    }

    if (cachedQuote !== quote) {
      replaceOptions.quote = quote
      cachedQuote = quote
    }

    return replaceOptions
  }

  function isDefaultTemplateAttribute(name: string) {
    if (name === 'class' || name === 'hover-class' || name === 'virtualhostclass') {
      return true
    }
    const lowerName = name.toLowerCase()
    return lowerName === 'class' || lowerName === 'hover-class' || lowerName === 'virtualhostclass'
  }

  const parser = new Parser(
    {
      onopentagname(name) {
        tag = name
      },

      onattribute(name, value, quote) {
        if (!value) {
          return
        }
        const shouldHandleDefault = defaultTemplateHandlerEnabled && isDefaultTemplateAttribute(name)
        const shouldHandleCustom = matchCustomAttribute?.(tag, name) ?? false
        if (!shouldHandleDefault && !shouldHandleCustom) {
          return
        }
        getMagicString().update(
          parser.startIndex + name.length + 2,
          // !important
          // htmlparser2 9.0.0: parser.endIndex
          // htmlparser2 9.1.0: parser.endIndex - 1
          // https://github.com/sonofmagic/weapp-tailwindcss/issues/269
          parser.endIndex - 1,
          templateReplacer(value, getReplaceOptions(quote)),
        )
      },
      ontext(data) {
        if (inlineWxs && tag === 'wxs') {
          ;(wxsArray ??= []).push({
            data,
            endIndex: parser.endIndex + 1,
            startIndex: parser.startIndex,
          })
        }
      },
      onclosetag() {
        tag = ''
      },
    },
    {
      xmlMode: true,
    },
  )
  parser.write(rawSource)
  parser.end()
  if (jsHandler) {
    for (const { data, endIndex, startIndex } of wxsArray ?? []) {
      const { code } = await jsHandler(data, runtimeSet)
      if (code !== data) {
        getMagicString().update(startIndex, endIndex, code)
      }
    }
  }

  return s?.toString() ?? rawSource
}
