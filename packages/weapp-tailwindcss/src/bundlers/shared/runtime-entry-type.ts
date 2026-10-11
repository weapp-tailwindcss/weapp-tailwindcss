import type { RuntimeEntryType } from '@/compiler'
import { isSourceStyleRequest } from '../../generation/style-requests'

const CSS_REQUEST_RE = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss)(?:$|\?)/
const HTML_REQUEST_RE = /\.html?(?:$|\?)/

export interface RuntimeEntryMatchers {
  cssMatcher: (file: string) => boolean
  htmlMatcher: (file: string) => boolean
  jsMatcher: (file: string) => boolean
  wxsMatcher: (file: string) => boolean
}

export function classifyRuntimeEntry(
  file: string,
  matchers: RuntimeEntryMatchers,
): RuntimeEntryType {
  if (matchers.htmlMatcher(file) || HTML_REQUEST_RE.test(file)) {
    return 'html'
  }
  if (matchers.cssMatcher(file) || CSS_REQUEST_RE.test(file) || isSourceStyleRequest(file)) {
    return 'css'
  }
  if (matchers.jsMatcher(file) || matchers.wxsMatcher(file)) {
    return 'js'
  }
  return 'other'
}
