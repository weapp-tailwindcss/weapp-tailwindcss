import { createRuntimeAffectingSourceSignature } from '@/compiler/runtime-affecting-signature'
import { extractSfcStyleSources, isSfcStyleSourceFile } from '../generate-bundle/sfc-style-source'
import { cleanUrl } from '../utils'

const WEB_HMR_RUNTIME_AFFECTING_DIRECTIVE_RE = /@(?:theme|source|config|plugin|apply)\b/

function createFrameworkHmrRuntimeSignature(file: string, source: string | undefined) {
  if (!source || !WEB_HMR_RUNTIME_AFFECTING_DIRECTIVE_RE.test(source)) {
    return ''
  }
  const cleanFile = cleanUrl(file)
  const sources = isSfcStyleSourceFile(cleanFile)
    ? extractSfcStyleSources(source, file).filter(styleSource => WEB_HMR_RUNTIME_AFFECTING_DIRECTIVE_RE.test(styleSource))
    : [source]
  return sources
    .map(styleSource => createRuntimeAffectingSourceSignature(styleSource, 'css'))
    .join('\0')
}

export function hasFrameworkHmrRuntimeSourceChange(
  file: string,
  previousSource: string | undefined,
  nextSource: string | undefined,
) {
  return createFrameworkHmrRuntimeSignature(file, previousSource)
    !== createFrameworkHmrRuntimeSignature(file, nextSource)
}
