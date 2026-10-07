import type { IJsHandlerOptions } from '../../types'

export function getParserLang(options: IJsHandlerOptions) {
  const plugins = options.babelParserOptions?.plugins
  const typescript = plugins?.includes('typescript') === true
  const jsx = plugins?.includes('jsx') === true
  return typescript ? jsx ? 'tsx' : 'ts' : jsx ? 'jsx' : 'js'
}

export function getParserSourceType(options: IJsHandlerOptions): 'module' | 'script' | 'unambiguous' {
  const sourceType = options.babelParserOptions?.sourceType
  return sourceType === 'module' || sourceType === 'unambiguous' ? sourceType : 'script'
}

/** 有特殊 Babel 解析选项时由兼容路径拥有其语义。 */
export function supportsOxcParserOptions(options: IJsHandlerOptions) {
  const parser = options.babelParserOptions
  if (!parser) {
    return true
  }
  if (Object.keys(parser).some(key => ![
    'sourceType',
    'sourceFilename',
    'plugins',
    'createParenthesizedExpressions',
    'cache',
    'cacheKey',
    'cacheMaxEntries',
    'cacheMaxSourceLength',
  ].includes(key))) {
    return false
  }
  return (parser.sourceType === undefined || ['module', 'script', 'unambiguous'].includes(parser.sourceType))
    && (!parser.plugins || parser.plugins.every(plugin => plugin === 'typescript' || plugin === 'jsx'))
}
