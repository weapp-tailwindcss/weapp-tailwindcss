import {
  buildBaselineArbitraryClassTokens,
  buildComplexCorpusClassTokens,
  buildHexArbitraryClassTokens,
  isIssue33RoundEnabled,
  ISSUE33_ADD_CLASS_TOKENS,
  ISSUE33_MODIFY_CLASS_TOKENS,
} from '../mutations/tokens'

const NON_DIGIT_RE = /\D/g
/** 默认小程序兼容管线移除 @supports 与 hover 规则；保留输入并显式验证负向结果。 */
export const MINI_PROGRAM_REMOVED_CSS_UTILITIES = [
  { utility: '[@supports(display:grid)]:grid', condition: 'supports' },
  { utility: 'supports-[backdrop-filter:blur(2px)]:backdrop-blur-[2px]', condition: 'supports' },
  { utility: '[@media(any-hover:hover){&:hover}]:opacity-100', condition: 'hover' },
  { utility: 'supports-[display:grid]:grid', condition: 'supports' },
] as const
const TAILWIND_V4_JS_CONTENT_UNSUPPORTED_TOKENS = new Set<string>(MINI_PROGRAM_REMOVED_CSS_UTILITIES.map(item => item.utility))

export function buildHexScriptRoundConfigs() {
  const rounds = [
    {
      name: 'baseline-arbitrary' as const,
      buildClassTokens(seed: string) {
        const numericSeed = seed.replace(NON_DIGIT_RE, '').padEnd(6, '0')
        const hex = numericSeed.slice(0, 6)
        const textPx = Number(numericSeed.slice(0, 2)) + 20
        const heightPx = Number(numericSeed.slice(2, 4)) + 12
        return [
          ...buildBaselineArbitraryClassTokens(seed),
          `bg-[#${hex}]`,
          `text-[${textPx}px]`,
          `h-[${heightPx}px]`,
        ]
      },
    },
    {
      name: 'complex-corpus' as const,
      buildClassTokens(seed: string) {
        const numericSeed = seed.replace(NON_DIGIT_RE, '').padEnd(6, '0')
        const hex = numericSeed.slice(0, 6)
        const textPx = Number(numericSeed.slice(0, 2)) + 34
        const heightPx = Number(numericSeed.slice(2, 4)) + 22
        return [
          ...buildComplexCorpusClassTokens(seed),
          `bg-[#${hex}]`,
          `text-[${textPx}px]`,
          `h-[${heightPx}px]`,
        ]
      },
    },
    {
      name: 'hex-arbitrary' as const,
      buildClassTokens(seed: string) {
        const numericSeed = seed.replace(NON_DIGIT_RE, '').padEnd(8, '0')
        const hex = `${numericSeed.slice(0, 2)}00${numericSeed.slice(2, 4)}`
        const textPx = Number(numericSeed.slice(0, 2)) + 46
        const heightPx = Number(numericSeed.slice(2, 4)) + 28
        return [
          ...buildHexArbitraryClassTokens(seed),
          `bg-[#${hex}]`,
          `text-[${textPx}px]`,
          `h-[${heightPx}px]`,
        ]
      },
    },
  ]

  if (!isIssue33RoundEnabled()) {
    return rounds
  }

  return [
    ...rounds,
    {
      name: 'issue33-arbitrary' as const,
      buildClassTokens() {
        return [...ISSUE33_ADD_CLASS_TOKENS]
      },
    },
  ]
}

export function buildBaselineHexScriptRoundConfigs() {
  return buildHexScriptRoundConfigs().slice(0, 1)
}

export function buildTailwindV4JsContentRoundConfigs() {
  return buildHexScriptRoundConfigs().map(roundConfig => ({
    ...roundConfig,
    buildClassTokens(seed: string) {
      return roundConfig
        .buildClassTokens(seed)
        .filter(token => !TAILWIND_V4_JS_CONTENT_UNSUPPORTED_TOKENS.has(token))
    },
  }))
}

export function buildIssue33ScriptRoundConfigs() {
  return [
    {
      name: 'issue33-arbitrary' as const,
      buildClassTokens() {
        return [...ISSUE33_ADD_CLASS_TOKENS]
      },
    },
  ]
}

export function buildIssue33HighRiskRoundConfigs() {
  return [
    {
      name: 'issue33-arbitrary' as const,
      buildClassTokens() {
        return [...ISSUE33_ADD_CLASS_TOKENS]
      },
      buildModifyClassTokens() {
        return [...ISSUE33_MODIFY_CLASS_TOKENS]
      },
    },
  ]
}
