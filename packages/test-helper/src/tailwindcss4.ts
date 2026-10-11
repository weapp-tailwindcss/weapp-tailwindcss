import { mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import defu from 'defu'
import postcss from 'postcss'
import { postcssRemoveComment } from './removeComment'

export interface IGenerateCssOptions {
  twConfig?: Record<string, unknown>
  css?: string
  postcssPlugins?: postcss.AcceptedPlugin[]
  isContentGlob?: boolean
}

export async function generateCss(input: string | string[], options?: IGenerateCssOptions) {
  const { css, postcssPlugins, isContentGlob, twConfig } = defu(options, {
    css: '@import "tailwindcss";',
    postcssPlugins: [],
    twConfig: undefined,
    isContentGlob: false,
  })
  const sourceOptions: SourceInputOptions = { isContentGlob }
  if (twConfig !== undefined) {
    sourceOptions.twConfig = twConfig
  }
  const source = await resolveSourceInput(input, sourceOptions)
  const normalizedCss = normalizeLegacyTailwindDirectives(css)
  const rewrittenCss = rewriteTailwindcssImportStatements(
    injectSourceDirectives(normalizedCss, source),
  )
  const tailwindcss = (await import('@tailwindcss/postcss')).default
  return await postcss([
    tailwindcss({
      base: source.base,
    }),
    postcssRemoveComment,
    ...postcssPlugins,
  ])
    .process(rewrittenCss, {
      from: 'style.css',
    })
}

interface SourceInputOptions {
  isContentGlob?: boolean
  twConfig?: Record<string, unknown>
}

interface ResolvedSourceInput {
  base: string
  sources: string[]
  config?: string
}

async function resolveSourceInput(
  input: string | string[],
  options: SourceInputOptions,
): Promise<ResolvedSourceInput> {
  const values = Array.isArray(input) ? input : [input]
  if (options.isContentGlob) {
    const base = await mkdtemp(path.join(tmpdir(), 'weapp-tw-test-helper-'))
    const config = await writeConfig(options.twConfig, base)
    return config
      ? {
          base,
          sources: values,
          config,
        }
      : {
          base,
          sources: values,
        }
  }

  if (typeof input === 'string' && isLikelyBasePath(input) && !options.twConfig) {
    return {
      base: input,
      sources: [],
    }
  }

  const base = await mkdtemp(path.join(tmpdir(), 'weapp-tw-test-helper-'))
  const sourceFile = path.join(base, 'source.html')
  await writeFile(sourceFile, normalizeInlineContent(values), 'utf8')
  const config = await writeConfig(options.twConfig, base)
  return config
    ? {
        base,
        sources: ['./source.html'],
        config,
      }
    : {
        base,
        sources: ['./source.html'],
      }
}

async function writeConfig(config: Record<string, unknown> | undefined, base = process.cwd()) {
  if (!config) {
    return undefined
  }
  const configFile = path.join(base, 'tailwind.config.js')
  const registryKey = `weapp-tw-test-helper-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const globalRegistry = globalThis as typeof globalThis & {
    __WEAPP_TW_TEST_HELPER_CONFIGS__?: Map<string, Record<string, unknown>>
  }
  globalRegistry.__WEAPP_TW_TEST_HELPER_CONFIGS__ ??= new Map()
  globalRegistry.__WEAPP_TW_TEST_HELPER_CONFIGS__.set(registryKey, config)
  await writeFile(
    configFile,
    `export default globalThis.__WEAPP_TW_TEST_HELPER_CONFIGS__.get(${JSON.stringify(registryKey)})`,
    'utf8',
  )
  return configFile
}

function isLikelyBasePath(input: string) {
  return path.isAbsolute(input)
    && !input.includes('*')
    && !input.includes('<')
    && !input.includes(' ')
    && !input.includes('\n')
    && !input.includes(':')
}

function normalizeInlineContent(values: string[]) {
  const content = values.join('\n')
  if (content.includes('<')) {
    return content
  }
  return `<div class="${values.join(' ')}"></div>`
}

function injectSourceDirectives(css: string, source: ResolvedSourceInput) {
  const directives: string[] = []
  if (source.config) {
    directives.push(`@config "${source.config.replaceAll('\\', '/')}";`)
  }
  for (const entry of source.sources) {
    directives.push(`@source "${entry.replaceAll('\\', '/')}";`)
  }
  if (!directives.length) {
    return css
  }
  return `${directives.join('\n')}\n${css}`
}

function normalizeLegacyTailwindDirectives(css: string) {
  let normalized = css
    .replace(/@tailwind\s+base\s*;/g, '@import "tailwindcss/preflight.css" layer(base);')
    .replace(/@tailwind\s+components\s*;/g, '')
    .replace(/@tailwind\s+utilities\s*;/g, '@import "tailwindcss/utilities.css" layer(utilities);')

  if (
    normalized.includes('@apply')
    && !/@reference\s+(?:url\(\s*)?["']tailwindcss(?:\/[^"']*)?["']/.test(normalized)
  ) {
    normalized = `@reference "tailwindcss";\n${normalized}`
  }

  return normalized
}

const require = createRequire(import.meta.url)
const tailwindcssImportRE = /^tailwindcss(?:\/.*)?$/
const tailwindcssCssImportStatementRE = /(@import\s+(?:url\(\s*)?)(["'])(tailwindcss(?:\/[^"']*)?\$?)(\2\s*\)?)/gi

function resolveTailwindcssImport(id: string) {
  const normalized = id === 'tailwindcss$' ? 'tailwindcss' : id
  if (!tailwindcssImportRE.test(normalized)) {
    return null
  }

  if (normalized === 'tailwindcss') {
    return require.resolve('weapp-tailwindcss/index.css')
  }
  if (normalized.startsWith('tailwindcss/')) {
    const subpath = normalized.slice('tailwindcss/'.length)
    try {
      return require.resolve(`weapp-tailwindcss/${subpath}`)
    }
    catch {
      return null
    }
  }
  return null
}

function rewriteTailwindcssImportStatements(source: string) {
  let hasReplacements = false
  const rewritten = source.replace(
    tailwindcssCssImportStatementRE,
    (full, prefix: string, quote: string, specifier: string, suffix: string) => {
      const replacement = resolveTailwindcssImport(specifier)
      if (!replacement) {
        return full
      }
      hasReplacements = true
      return `${prefix}${quote}${replacement}${suffix}`
    },
  )
  return hasReplacements ? rewritten : source
}
