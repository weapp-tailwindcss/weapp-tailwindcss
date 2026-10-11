import type { ExtractSourceCandidate, ExtractSourceCandidateWithContext, JsStringStaticRange } from './types.ts'
import { createJsStringStaticRanges, isCandidateInsideJsStringStaticRanges } from './js-string-ranges.ts'

const HTML_ATTRIBUTE_NAME_CANDIDATE_RE = /^(?:class|className|hover-class|hoverClass)$/
const CSS_DIRECTIVE_CANDIDATE_RE = /^@(?:apply|tailwind|source|config|plugin|theme|utility|custom-variant|variant)$/
const CSS_APPLY_IMPORTANT = '!important'
const CLASS_LIKE_CANDIDATE_RE = /[:![\]#/%._\-\d]/

export const JS_LIKE_SOURCE_EXTENSION_RE = /^[cm]?[jt]sx?$/
export const MIXED_TEMPLATE_SOURCE_EXTENSION_RE = /^(?:vue|uvue|nvue|svelte|mpx)$/
export const VUE_LIKE_SOURCE_EXTENSION_RE = /^(?:vue|uvue|nvue)$/
export const CSS_LIKE_SOURCE_EXTENSION_RE = /^(?:css|wxss|acss|jxss|ttss|qss|tyss|scss|sass|less|styl|stylus)$/

export function isWhitespace(value: string | undefined) {
  return value === ' ' || value === '\n' || value === '\r' || value === '\t' || value === '\f'
}

function isHtmlAttributeNameCandidate(content: string, candidate: ExtractSourceCandidate) {
  if (!HTML_ATTRIBUTE_NAME_CANDIDATE_RE.test(candidate.rawCandidate)) {
    return false
  }
  let index = candidate.end
  while (isWhitespace(content[index])) {
    index++
  }
  return content[index] === '='
}

function isInsideHtmlTagText(content: string, candidate: ExtractSourceCandidate) {
  const open = content.lastIndexOf('<', candidate.start)
  const close = content.lastIndexOf('>', candidate.start)
  if (open > close) {
    return false
  }
  const nextOpen = content.indexOf('<', candidate.end)
  return nextOpen !== -1 && (nextOpen < content.indexOf('>', candidate.end) || !content.includes('>', candidate.end))
}

function isCssDirectiveCandidate(candidate: string) {
  return candidate === CSS_APPLY_IMPORTANT || CSS_DIRECTIVE_CANDIDATE_RE.test(candidate)
}

export function isClassLikeCandidate(candidate: string) {
  return CLASS_LIKE_CANDIDATE_RE.test(candidate)
}

function isCandidateInCssApplyParams(content: string, candidate: ExtractSourceCandidate) {
  const apply = content.lastIndexOf('@apply', candidate.start)
  if (apply === -1) {
    return false
  }
  const boundary = content.slice(apply + '@apply'.length, candidate.start)
  return !/[;{}]/.test(boundary)
}

export function shouldKeepSourceCandidate(
  content: string,
  extension: string,
  candidate: ExtractSourceCandidate,
  jsStringStaticRanges?: JsStringStaticRange[],
  skipHtmlContextChecks = false,
) {
  if (!candidate.rawCandidate || isCssDirectiveCandidate(candidate.rawCandidate)) {
    return false
  }
  if (CSS_LIKE_SOURCE_EXTENSION_RE.test(extension) && !isCandidateInCssApplyParams(content, candidate)) {
    return false
  }
  if (!skipHtmlContextChecks) {
    if (isHtmlAttributeNameCandidate(content, candidate)) {
      return false
    }
    if (isInsideHtmlTagText(content, candidate)) {
      return false
    }
  }
  if (
    JS_LIKE_SOURCE_EXTENSION_RE.test(extension)
    && !isCandidateInsideJsStringStaticRanges(jsStringStaticRanges ?? createJsStringStaticRanges(content), candidate.start)
  ) {
    return false
  }
  return true
}

export function createLocalCandidate(candidate: ExtractSourceCandidateWithContext): ExtractSourceCandidate {
  return {
    rawCandidate: candidate.rawCandidate,
    start: candidate.localStart,
    end: candidate.localStart + candidate.rawCandidate.length,
  }
}

export function dedupeCandidatesWithPositions(candidates: ExtractSourceCandidate[]) {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = `${candidate.start}:${candidate.end}:${candidate.rawCandidate}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}
