export function isWebpackCssLoaderRuntimeSource(source: string) {
  if (source.trimStart().startsWith('// extracted by mini-css-extract-plugin')) {
    return true
  }
  return source.includes('___CSS_LOADER_EXPORT___')
    && source.includes('___CSS_LOADER_API_IMPORT___')
    && (source.includes('module.exports = ___CSS_LOADER_EXPORT___')
      || source.includes('export default ___CSS_LOADER_EXPORT___'))
}
