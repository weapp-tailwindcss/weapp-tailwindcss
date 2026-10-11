import { cleanUrl, ensurePosix } from '@weapp-tailwindcss/shared'

export type UniAppXLocalStyleMatcher = (id: string) => boolean

const COMPONENT_RE = /(?:^|\/)components(?:\/.+)?\.(?:uvue|nvue)$/
const PAGE_RE = /(?:^|\/)pages(?:\/.+)?\.(?:uvue|nvue)$/

export function normalizeUniAppXLocalStyleId(id: string) {
  return ensurePosix(cleanUrl(id))
}

export function shouldEnableComponentLocalStyle(
  id: string,
  matcher?: UniAppXLocalStyleMatcher,
) {
  const normalizedId = normalizeUniAppXLocalStyleId(id)
  return matcher ? matcher(normalizedId) : COMPONENT_RE.test(normalizedId)
}

export function shouldEnablePageLocalStyle(
  id: string,
  matcher?: UniAppXLocalStyleMatcher,
) {
  const normalizedId = normalizeUniAppXLocalStyleId(id)
  return matcher ? matcher(normalizedId) : PAGE_RE.test(normalizedId)
}
