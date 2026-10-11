const SOURCE_STYLE_EXT_RE = /\.(?:css|scss|sass|less|styl|stylus|pcss|postcss)$/i
const SOURCE_PREPROCESSOR_EXT_RE = /\.(?:scss|sass|less|styl|stylus)$/i
const SFC_SOURCE_EXT_RE = /\.(?:vue|uvue|nvue|svelte|mpx)$/i
const INLINE_PREPROCESSOR_LANG_RE = /(?:^|[.?&])lang\.(?:scss|sass|less|styl|stylus)(?:[.&]|$)/i
const STYLE_QUERY_RE = /(?:^|&)type=styles?(?:&|$)/
const VUE_STYLE_QUERY_RE = /(?:^|&)type=style(?:&|$)/
const STYLE_LANG_QUERY_RE = /(?:^|&)lang(?:[.=](?:css|scss|sass|less|styl|stylus|pcss|postcss))?(?:&|$)/
const PREPROCESSOR_LANG_QUERY_RE = /(?:^|&)lang[.=](?:scss|sass|less|styl|stylus)(?:&|$)/i

function stripHash(request: string) {
  const hashIndex = request.indexOf('#')
  return hashIndex === -1 ? request : request.slice(0, hashIndex)
}

export function stripRequestQuery(request: string) {
  const normalized = stripHash(request)
  const queryIndex = normalized.indexOf('?')
  return queryIndex === -1 ? normalized : normalized.slice(0, queryIndex)
}

export function isSourceStyleRequest(request: string | undefined) {
  if (typeof request !== 'string' || request.length === 0) {
    return false
  }
  const normalized = stripHash(request)
  if (INLINE_PREPROCESSOR_LANG_RE.test(normalized)) {
    return true
  }
  const queryIndex = normalized.indexOf('?')
  const pathname = queryIndex === -1 ? normalized : normalized.slice(0, queryIndex)
  if (SOURCE_STYLE_EXT_RE.test(pathname)) {
    return true
  }
  if (queryIndex === -1) {
    return false
  }
  const query = normalized.slice(queryIndex + 1)
  return STYLE_QUERY_RE.test(query) || STYLE_LANG_QUERY_RE.test(query)
}

export function isSfcStyleSourceRequest(request: string | undefined) {
  if (typeof request !== 'string' || request.length === 0) {
    return false
  }
  return SFC_SOURCE_EXT_RE.test(stripRequestQuery(request))
}

export function isSourcePreprocessorRequest(request: string | undefined, lang?: string) {
  if (typeof lang === 'string' && SOURCE_PREPROCESSOR_EXT_RE.test(`.${lang}`)) {
    return true
  }
  if (typeof request !== 'string' || request.length === 0) {
    return false
  }
  const normalized = stripHash(request)
  if (INLINE_PREPROCESSOR_LANG_RE.test(normalized)) {
    return true
  }
  const queryIndex = normalized.indexOf('?')
  const pathname = queryIndex === -1 ? normalized : normalized.slice(0, queryIndex)
  if (SOURCE_PREPROCESSOR_EXT_RE.test(pathname)) {
    return true
  }
  return queryIndex !== -1 && PREPROCESSOR_LANG_QUERY_RE.test(normalized.slice(queryIndex + 1))
}

export function isVueScopedStyleRequest(request: string | undefined) {
  if (typeof request !== 'string' || request.length === 0) {
    return false
  }
  const normalized = stripHash(request)
  const queryIndex = normalized.indexOf('?')
  if (queryIndex === -1) {
    return false
  }
  const query = normalized.slice(queryIndex + 1)
  return VUE_STYLE_QUERY_RE.test(query)
    && /(?:^|&)scoped(?:=[^&]*)?(?:&|$)/.test(query)
}
