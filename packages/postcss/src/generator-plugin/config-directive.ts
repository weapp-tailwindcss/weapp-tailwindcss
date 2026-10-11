export function normalizeConfigDirective(css: string, config: string | undefined) {
  if (!config || !/@config\s+/.test(css)) {
    return css
  }
  return css.replace(
    /@config\s+(["'])(.+?)\1\s*;?/,
    `@config "${quoteCssString(toCssPath(config))}";`,
  )
}

/** 保留预处理器文本兼容；请求解析与文件定位由调用方提供。 */
export function rewriteCssConfigRequests(source: string, resolve: (request: string) => string | undefined) {
  return source.replace(/@config\s+(["'])(.+?)\1\s*;?/g, (full, quote: string, request: string) => {
    const resolved = resolve(request)
    return resolved === undefined ? full : `@config ${quote}${resolved}${quote};`
  })
}

/** 保留 Vite 预处理前的行级清理语义，允许尚未编译的 Sass 等源码。 */
export function stripTailwindConfigDirectives(code: string) {
  return code.replace(/^\s*@config\s+(?:"[^"]+"|'[^']+')[^;\n]*;\s*$/gm, '')
}

function quoteCssString(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function toCssPath(value: string) {
  return value.replaceAll('\\', '/')
}

export function prependConfigDirective(css: string, config: string | undefined) {
  if (!config || /@config\s+/.test(css)) {
    return css
  }
  return `@config "${quoteCssString(toCssPath(config))}";\n${css}`
}
