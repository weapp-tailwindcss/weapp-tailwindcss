import type { ICustomAttributesEntities } from '@/types'
import type { IArbitraryValues } from '@/types/shared'
import { extractSourceCandidates } from '@weapp-tailwindcss/engine'
import { Parser } from 'htmlparser2'
import { traverse } from '@/babel'
import { babelParse } from '@/js/babel'
import { createAttributeMatcher } from '@/wxml/custom-attributes'

const SCRIPT_SOURCE_CANDIDATE_EXTENSIONS = new Set([
  'js',
  'jsx',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'mts',
  'cts',
])

const TEMPLATE_SOURCE_CANDIDATE_EXTENSIONS = new Set([
  'html',
  'wxml',
  'axml',
  'jxml',
  'ksml',
  'ttml',
  'qml',
  'qxml',
  'tyml',
  'xhsml',
  'swan',
  'vue',
  'uvue',
  'nvue',
  'mpx',
])

export interface SourceCandidateExtractionOptions {
  bareArbitraryValues?: IArbitraryValues['bareArbitraryValues'] | undefined
  customAttributesEntities?: ICustomAttributesEntities | undefined
  disabledDefaultTemplateHandler?: boolean | undefined
  extractor?: ((source: string, extension: string) => Promise<Iterable<string>> | Iterable<string>) | undefined
}

export async function extractCandidatesFromSource(
  source: string,
  extension: string,
  options: SourceCandidateExtractionOptions = {},
) {
  const candidates = options.extractor
    ? new Set(await options.extractor(source, extension))
    : new Set(await extractSourceCandidates(source, extension, {
        ...(options.bareArbitraryValues === undefined ? {} : { bareArbitraryValues: options.bareArbitraryValues }),
      }))
  const scriptCandidates = await extractScriptStringCandidates(source, extension, options)
  for (const candidate of scriptCandidates) {
    candidates.add(candidate)
  }
  const templateAttributeCandidates = await extractTemplateAttributeCandidates(source, extension, options)
  for (const candidate of templateAttributeCandidates) {
    candidates.add(candidate)
  }
  return candidates
}

function isDefaultTemplateAttribute(name: string) {
  if (name === 'class' || name === 'hover-class' || name === 'virtualhostclass') {
    return true
  }
  const lowerName = name.toLowerCase()
  return lowerName === 'class' || lowerName === 'hover-class' || lowerName === 'virtualhostclass'
}

async function extractCandidateTokensFromTemplateAttributeValue(
  value: string,
  options: SourceCandidateExtractionOptions,
) {
  return options.extractor
    ? await options.extractor(value, 'html')
    : await extractSourceCandidates(value, 'html', {
        ...(options.bareArbitraryValues === undefined ? {} : { bareArbitraryValues: options.bareArbitraryValues }),
      })
}

export async function extractTemplateAttributeCandidates(
  source: string,
  extension: string,
  options: SourceCandidateExtractionOptions,
) {
  if (!TEMPLATE_SOURCE_CANDIDATE_EXTENSIONS.has(extension)) {
    return []
  }

  if (!options.customAttributesEntities?.length) {
    return []
  }

  const candidates = new Set<string>()
  const matchCustomAttribute = createAttributeMatcher(options.customAttributesEntities)
  const defaultTemplateHandlerEnabled = !options.disabledDefaultTemplateHandler
  let tag = ''
  const tasks: Array<Promise<void>> = []

  const parser = new Parser(
    {
      onopentagname(name) {
        tag = name
      },
      onattribute(name, value) {
        if (!value) {
          return
        }
        const shouldHandleDefault = defaultTemplateHandlerEnabled && isDefaultTemplateAttribute(name)
        const shouldHandleCustom = matchCustomAttribute?.(tag, name) ?? false
        if (!shouldHandleDefault && !shouldHandleCustom) {
          return
        }

        tasks.push((async () => {
          for (const candidate of await extractCandidateTokensFromTemplateAttributeValue(value, options)) {
            candidates.add(candidate)
          }
        })())
      },
      onclosetag() {
        tag = ''
      },
    },
    {
      xmlMode: true,
    },
  )

  parser.write(source)
  parser.end()
  await Promise.all(tasks)

  return candidates
}

export async function extractScriptStringCandidates(
  source: string,
  extension: string,
  options: SourceCandidateExtractionOptions,
) {
  if (!SCRIPT_SOURCE_CANDIDATE_EXTENSIONS.has(extension)) {
    return []
  }

  const values = new Set<string>()
  try {
    const ast = babelParse(source, {
      cache: true,
      cacheKey: `source-candidates:${extension}`,
      plugins: ['jsx', 'typescript'],
      sourceType: 'unambiguous',
    })

    traverse(ast, {
      noScope: true,
      StringLiteral(path: any) {
        values.add(path.node.value)
      },
      TemplateElement(path: any) {
        values.add(path.node.value.raw)
      },
    } as any)
  }
  catch {
    return []
  }

  const candidates = new Set<string>()
  for (const value of values) {
    const extractedCandidates = options.extractor
      ? await options.extractor(value, 'html')
      : await extractSourceCandidates(value, 'html', {
          ...(options.bareArbitraryValues === undefined ? {} : { bareArbitraryValues: options.bareArbitraryValues }),
        })
    for (const candidate of extractedCandidates) {
      candidates.add(candidate)
    }
  }
  return candidates
}
