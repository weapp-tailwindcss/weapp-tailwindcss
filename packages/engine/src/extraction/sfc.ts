import type { ExtractCandidateOptions, ExtractSourceCandidateWithContext, SourceSegment } from './types.ts'
import { Parser } from 'htmlparser2'
import { extractCssApplyCandidates } from './css.ts'
import { createJsStringSourceSegments } from './js-string-ranges.ts'
import { extractBatchedSourceSegmentCandidates } from './segments.ts'
import { isClassLikeCandidate, isWhitespace } from './source-filters.ts'

const HTML_ATTRIBUTE_NAME_CANDIDATE_RE = /^(?:class|className|hover-class|hoverClass)$/
const HTML_BOUND_ATTRIBUTE_PREFIX_RE = /^(?::|v-bind:|bind:)/
const VUE_HTML_TEMPLATE_LANG_RE = /^(?:html)?$/i
const SFC_SCRIPT_BLOCK_RE = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
const SFC_STYLE_BLOCK_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
const SFC_TEMPLATE_BLOCK_RE = /<template\b([^>]*)>([\s\S]*?)<\/template>/gi
const SFC_LANG_ATTRIBUTE_RE = /\blang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i

function normalizeVueBoundAttributeName(name: string) {
  return name.replace(HTML_BOUND_ATTRIBUTE_PREFIX_RE, '')
}

function isVueClassAttributeNameCandidate(name: string) {
  return HTML_ATTRIBUTE_NAME_CANDIDATE_RE.test(normalizeVueBoundAttributeName(name))
}

function isVueBoundAttributeName(name: string) {
  return HTML_BOUND_ATTRIBUTE_PREFIX_RE.test(name)
}

function normalizeVueTemplateLang(lang: string | undefined) {
  return lang?.trim().toLowerCase() ?? ''
}

function getSfcBlockLang(attributes: string) {
  const match = SFC_LANG_ATTRIBUTE_RE.exec(attributes)
  return normalizeVueTemplateLang(match?.[1] ?? match?.[2] ?? match?.[3])
}

function isVueHtmlTemplateLang(lang: string) {
  return VUE_HTML_TEMPLATE_LANG_RE.test(lang)
}

export function findAttributeValueStart(attributeSource: string, value: string) {
  const equalIndex = attributeSource.indexOf('=')
  if (equalIndex === -1) {
    return -1
  }

  let valueStart = equalIndex + 1
  while (isWhitespace(attributeSource[valueStart])) {
    valueStart++
  }

  const quote = attributeSource[valueStart]
  if (quote === '"' || quote === '\'') {
    valueStart++
  }

  const valueIndex = attributeSource.indexOf(value, valueStart)
  return valueIndex === -1 ? valueStart : valueIndex
}

export async function extractJsStringSourceCandidates(
  content: string,
  offset: number,
  extractRawCandidatesWithPositions: (
    content: string,
    extension: string,
    options?: ExtractCandidateOptions,
  ) => Promise<Array<{ rawCandidate: string, start: number, end: number }>>,
  options?: ExtractCandidateOptions,
) {
  const segments = createJsStringSourceSegments(content, offset)
  return extractBatchedSourceSegmentCandidates(segments, 'html', extractRawCandidatesWithPositions, options)
}

export async function extractMixedSourceScriptCandidates(
  content: string,
  extractRawCandidatesWithPositions: (
    content: string,
    extension: string,
    options?: ExtractCandidateOptions,
  ) => Promise<Array<{ rawCandidate: string, start: number, end: number }>>,
  options?: ExtractCandidateOptions,
) {
  const candidates: ExtractSourceCandidateWithContext[] = []
  SFC_SCRIPT_BLOCK_RE.lastIndex = 0
  let match = SFC_SCRIPT_BLOCK_RE.exec(content)
  while (match !== null) {
    const scriptContent = match[1] ?? ''
    const scriptStart = match.index + match[0].indexOf(scriptContent)
    candidates.push(...await extractJsStringSourceCandidates(scriptContent, scriptStart, extractRawCandidatesWithPositions, options))
    match = SFC_SCRIPT_BLOCK_RE.exec(content)
  }
  return candidates
}

async function extractMixedSourceStyleCandidates(
  content: string,
  extractRawCandidatesWithPositions: (
    content: string,
    extension: string,
    options?: ExtractCandidateOptions,
  ) => Promise<Array<{ rawCandidate: string, start: number, end: number }>>,
  options?: ExtractCandidateOptions,
) {
  const candidates: ExtractSourceCandidateWithContext[] = []
  SFC_STYLE_BLOCK_RE.lastIndex = 0
  let match = SFC_STYLE_BLOCK_RE.exec(content)
  while (match !== null) {
    const styleContent = match[1] ?? ''
    const styleStart = match.index + match[0].indexOf(styleContent)
    const styleCandidates = await extractCssApplyCandidates(styleContent, 'css', extractRawCandidatesWithPositions, options)
    candidates.push(...styleCandidates.map(candidate => ({
      content: candidate.content,
      extension: candidate.extension,
      localStart: candidate.localStart,
      rawCandidate: candidate.rawCandidate,
      start: candidate.start + styleStart,
      end: candidate.end + styleStart,
    })))
    match = SFC_STYLE_BLOCK_RE.exec(content)
  }
  return candidates
}

async function extractVueTemplateAttributeCandidates(
  content: string,
  extractRawCandidatesWithPositions: (
    content: string,
    extension: string,
    options?: ExtractCandidateOptions,
  ) => Promise<Array<{ rawCandidate: string, start: number, end: number }>>,
  options?: ExtractCandidateOptions,
) {
  const htmlSegments: SourceSegment[] = []
  const jsSegments: SourceSegment[] = []
  const parser = new Parser({
    onattribute(name, value) {
      if (!value || !isVueClassAttributeNameCandidate(name)) {
        return
      }

      const attributeStart = parser.startIndex
      const attributeSource = content.slice(attributeStart, parser.endIndex + 1)
      const valueStartInAttribute = findAttributeValueStart(attributeSource, value)
      if (valueStartInAttribute === -1) {
        return
      }

      const extension = isVueBoundAttributeName(name) ? 'js' : 'html'
      const valueStart = attributeStart + valueStartInAttribute
      const segments = extension === 'js' ? jsSegments : htmlSegments
      segments.push({
        content: value,
        start: valueStart,
      })
    },
  }, {
    lowerCaseAttributeNames: false,
  })

  parser.write(content)
  parser.end()
  const jsStringSegments = jsSegments.flatMap(segment => createJsStringSourceSegments(segment.content, segment.start))
  const [htmlCandidates, jsCandidates] = await Promise.all([
    extractBatchedSourceSegmentCandidates(htmlSegments, 'html', extractRawCandidatesWithPositions, options),
    extractBatchedSourceSegmentCandidates(jsStringSegments, 'html', extractRawCandidatesWithPositions, options),
  ])
  return [
    ...htmlCandidates,
    ...jsCandidates,
  ]
}

async function extractVueNonHtmlTemplateCandidates(
  content: string,
  extractRawCandidatesWithPositions: (
    content: string,
    extension: string,
    options?: ExtractCandidateOptions,
  ) => Promise<Array<{ rawCandidate: string, start: number, end: number }>>,
  options?: ExtractCandidateOptions,
) {
  const candidates: ExtractSourceCandidateWithContext[] = []
  SFC_TEMPLATE_BLOCK_RE.lastIndex = 0
  let match = SFC_TEMPLATE_BLOCK_RE.exec(content)
  while (match !== null) {
    const attributes = match[1] ?? ''
    const templateContent = match[2] ?? ''
    const lang = getSfcBlockLang(attributes)
    if (isVueHtmlTemplateLang(lang)) {
      match = SFC_TEMPLATE_BLOCK_RE.exec(content)
      continue
    }

    const templateStart = match.index + match[0].indexOf(templateContent)
    const templateCandidates = await extractRawCandidatesWithPositions(templateContent, lang, options)
    candidates.push(...templateCandidates.map(candidate => ({
      content: templateContent,
      extension: lang,
      localStart: candidate.start,
      rawCandidate: candidate.rawCandidate,
      skipHtmlContextChecks: true,
      start: candidate.start + templateStart,
      end: candidate.end + templateStart,
    })).filter(candidate => isClassLikeCandidate(candidate.rawCandidate)))
    match = SFC_TEMPLATE_BLOCK_RE.exec(content)
  }
  return candidates
}

export async function extractVueLikeSourceCandidates(
  content: string,
  extractRawCandidatesWithPositions: (
    content: string,
    extension: string,
    options?: ExtractCandidateOptions,
  ) => Promise<Array<{ rawCandidate: string, start: number, end: number }>>,
  options?: ExtractCandidateOptions,
) {
  const [templateCandidates, preprocessedTemplateCandidates, scriptCandidates, styleCandidates] = await Promise.all([
    extractVueTemplateAttributeCandidates(content, extractRawCandidatesWithPositions, options),
    extractVueNonHtmlTemplateCandidates(content, extractRawCandidatesWithPositions, options),
    extractMixedSourceScriptCandidates(content, extractRawCandidatesWithPositions, options),
    extractMixedSourceStyleCandidates(content, extractRawCandidatesWithPositions, options),
  ])
  return [
    ...templateCandidates,
    ...preprocessedTemplateCandidates,
    ...scriptCandidates,
    ...styleCandidates,
  ]
}
