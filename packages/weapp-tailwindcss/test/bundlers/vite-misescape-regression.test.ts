import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { describe, expect, it } from 'vitest'
import { collectUnescapedDynamicCandidates } from '@/bundlers/vite/generate-bundle/candidates'
import { createJsHandler } from '@/js'
import { createTemplateHandler } from '@/wxml'
import { replaceWxml } from '@/wxml/shared'

const misescapeCases = [
  {
    label: 'tailwindcss v4 red background',
    majorVersion: 4,
    runtimeClass: 'bg-[red]',
  },
  {
    label: 'tailwindcss v4',
    majorVersion: 4,
    runtimeClass: 'text-[55rpx]',
  },
] as const

const dangerousNonClassSamples = [
  'Hello world!',
  'at App.vue:4 index.ts:120:3',
  'keep-[business]',
  'calc(100% - 16px)',
  'https://example.com/a[b]?q=Hello world!',
  'size > 4 ? keep-[business] : App.vue:4',
  'before:content-["not-generated"]',
  'JSON.stringify({ class: "keep-[business]" })',
] as const

const jsOnlyDangerousNonClassSamples = [
  'message.includes("Hello world!") && trace === "App.vue:4"',
] as const

const escapedDangerousFragments = [
  'Hello world_e',
  'App_dvue_c4',
  'index_dts_c120_c3',
  'keep-_bbusiness_B',
  'before_ccontent-_b_qnot-generated_q_B',
  'calc_o100_v',
  'a_b',
] as const

function expectNoMisescapedSamples(result: string, samples: readonly string[] = dangerousNonClassSamples) {
  for (const sample of samples) {
    expect(result).toContain(sample)
  }
  for (const fragment of escapedDangerousFragments) {
    expect(result).not.toContain(fragment)
  }
}

describe('vite misescape regressions', () => {
  it('keeps source-scan-only candidates out of JS transforms', () => {
    const runtimeClass = 'text-[#438821]'
    const sourceOnlyCandidates = new Set([
      runtimeClass,
      'Hello',
      'world!',
      'keep-[business]',
      'before:content-["not-generated"]',
      'https://example.com/a[b]?q=Hello',
    ])
    const jsRuntime = new Set([runtimeClass])
    const jsHandler = createJsHandler({
      babelParserOptions: {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      },
      escapeMap: MappingChars2String,
      needEscaped: true,
      tailwindcssMajorVersion: 4,
    })
    const code = `
const complexExpression = 'size > 4 ? keep-[business] : App.vue:4'
const bracketLikeText = 'before content ["not-generated"]'
const urlLikeText = 'https://example.com/a[b]?q=Hello world!'
const view = <View className="${runtimeClass}">Hello world!</View>
`

    const result = jsHandler(code, jsRuntime).code

    expect(sourceOnlyCandidates.size).toBeGreaterThan(jsRuntime.size)
    expect(result).toContain(replaceWxml(runtimeClass, { escapeMap: MappingChars2String }))
    expect(result).toContain('Hello world!')
    expect(result).toContain('keep-[business]')
    expect(result).toContain('before content ["not-generated"]')
    expect(result).toContain('https://example.com/a[b]?q=Hello world!')
    expect(result).not.toContain('Hello world_e')
    expect(result).not.toContain('keep-_bbusiness_B')
    expect(result).not.toContain('before_ccontent-_b_qnot-generated_q_B')
  })

  it('keeps unvalidated source candidates out of Vite JS transform runtime', () => {
    const runtimeClass = 'text-[55rpx]'
    const sourceCandidates = new Set([
      runtimeClass,
      'bg-purple-300',
      'Hello',
      'world!',
      'keep-[business]',
      'https://example.com/a[b]?q=Hello',
    ])
    const runtime = new Set([runtimeClass])
    const validatedSourceRuntime = new Set(['bg-purple-300'])
    const transformRuntime = new Set(runtime)
    for (const candidate of validatedSourceRuntime) {
      transformRuntime.add(candidate)
    }
    const jsHandler = createJsHandler({
      babelParserOptions: {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      },
      escapeMap: MappingChars2String,
      needEscaped: true,
      tailwindcssMajorVersion: 4,
    })
    const code = `
const complexExpression = 'size > 4 ? keep-[business] : App.vue:4'
const urlLikeText = 'https://example.com/a[b]?q=Hello world!'
const view = <View className="${runtimeClass} bg-purple-300">Hello world!</View>
`

    const result = jsHandler(code, transformRuntime).code

    expect(sourceCandidates.size).toBeGreaterThan(transformRuntime.size)
    expect(result).toContain(replaceWxml(runtimeClass, { escapeMap: MappingChars2String }))
    expect(result).toContain(replaceWxml('bg-purple-300', { escapeMap: MappingChars2String }))
    expect(result).toContain('Hello world!')
    expect(result).toContain('keep-[business]')
    expect(result).toContain('https://example.com/a[b]?q=Hello world!')
    expect(result).not.toContain('Hello world_e')
    expect(result).not.toContain('keep-_bbusiness_B')
  })

  it.each(misescapeCases)('keeps non-class JS and JSX text untouched in $label', ({ majorVersion, runtimeClass }) => {
    const jsHandler = createJsHandler({
      babelParserOptions: {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      },
      escapeMap: MappingChars2String,
      needEscaped: true,
      tailwindcssMajorVersion: majorVersion,
    })
    const classNameSet = new Set([runtimeClass])
    const code = `
const literal = "Hello world!"
const trace = "at App.vue:4 index.ts:120:3"
const expression = "size > 4 ? Hello world! : keep-[business]"
const ternaryTrace = "size > 4 ? keep-[business] : App.vue:4"
const url = "https://example.com/a[b]?q=Hello world!"
const formula = "calc(100% - 16px)"
const missingClass = 'before:content-["not-generated"]'
const jsonLike = 'JSON.stringify({ class: "keep-[business]" })'
const complex = 'message.includes("Hello world!") && trace === "App.vue:4"'
const view = (
  <View className="${runtimeClass}" data-trace="at App.vue:4 index.ts:120:3">
    <Text>{message ? "Hello world!" : "keep-[business]"}</Text>
    <Text>{size > 4 ? "calc(100% - 16px)" : 'before:content-["not-generated"]'}</Text>
  </View>
)
`

    const result = jsHandler(code, classNameSet).code

    expect(result).toContain(`className="${replaceWxml(runtimeClass, { escapeMap: MappingChars2String })}"`)
    expectNoMisescapedSamples(result, [
      ...dangerousNonClassSamples,
      ...jsOnlyDangerousNonClassSamples,
    ])
  })

  it('supports single and double quoted content utilities by default', () => {
    const singleQuoted = 'before:content-[\'11111\']'
    const doubleQuoted = 'before:content-["11111"]'
    const jsHandler = createJsHandler({
      babelParserOptions: {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      },
      escapeMap: MappingChars2String,
      needEscaped: true,
      tailwindcssMajorVersion: 3,
    })

    const singleResult = jsHandler(
      `<View className="${singleQuoted}">Hello world!</View>`,
      new Set([singleQuoted]),
    ).code
    const doubleResult = jsHandler(
      `<View className='${doubleQuoted}'>Hello world!</View>`,
      new Set([doubleQuoted]),
    ).code

    expect(singleResult).toContain(replaceWxml(singleQuoted, { escapeMap: MappingChars2String }))
    expect(doubleResult).toContain(replaceWxml(doubleQuoted, { escapeMap: MappingChars2String }))
    expect(doubleResult).toContain('Hello world!')
  })

  it.each(misescapeCases)('keeps non-class WXML text and expressions untouched in $label', async ({ majorVersion, runtimeClass }) => {
    const jsHandler = createJsHandler({
      escapeMap: MappingChars2String,
      needEscaped: true,
      tailwindcssMajorVersion: majorVersion,
    })
    const templateHandler = createTemplateHandler({
      escapeMap: MappingChars2String,
      jsHandler,
    })
    const wxml = `
<view class="${runtimeClass}">Hello world!</view>
<view class="{{ active ? '${runtimeClass}' : 'text-red-500' }}">{{ message === 'Hello world!' ? 'keep-[business]' : 'at App.vue:4' }}</view>
<view class="text-red-500 {{ active ? '${runtimeClass}' : 'text-blue-500' }} {{ disabled ? 'opacity-50' : '${runtimeClass}' }}">
  {{ ['Hello world!', 'keep-[business]', 'at App.vue:4'].join('|') }}
</view>
<view class="{{ active ? '${runtimeClass}' : (message.includes('Hello world!') ? 'text-red-500' : 'text-blue-500') }}">
  {{ ({ trace: 'at App.vue:4 index.ts:120:3', raw: 'before:content-["not-generated"]' }).trace }}
</view>
<view class="{{ active ? '${runtimeClass}' : (message === 'Hello world!' ? 'text-red-500' : 'text-blue-500') }}"></view>
<view class="{{ ['text-red-500', active ? '${runtimeClass}' : 'text-blue-500'].join(' ') }}">
  {{ message === 'Hello world!' && url === 'https://example.com/a[b]?q=Hello world!' ? 'calc(100% - 16px)' : 'size > 4 ? keep-[business] : App.vue:4' }}
</view>
<view data-label="Hello world!" aria-label="keep-[business]"></view>
<view data-json='JSON.stringify({ class: "keep-[business]" })' data-content='before:content-["not-generated"]'></view>
`

    const pollutedRuntimeSet = new Set([
      runtimeClass,
      'Hello',
      'world!',
      'keep-[business]',
      'App.vue:4',
      'before:content-["not-generated"]',
    ])
    const result = await templateHandler(wxml, { runtimeSet: pollutedRuntimeSet })

    expect(result).toContain(`class="${replaceWxml(runtimeClass, { escapeMap: MappingChars2String })}"`)
    expect(result).toContain(`active ? '${replaceWxml(runtimeClass, { escapeMap: MappingChars2String })}'`)
    expect(result).toContain('>Hello world!</view>')
    expect(result).toContain("message === 'Hello world!'")
    expect(result).toContain("'text-red-500'")
    expect(result).toContain('data-label="Hello world!"')
    expect(result).toContain('aria-label="keep-[business]"')
    expectNoMisescapedSamples(result)
  })

  it.each(misescapeCases)('only retries extracted WXML dynamic candidates in $label', ({ runtimeClass }) => {
    const source = `
<view class="{{ active ? '${runtimeClass}' : 'keep-[business]' }}">{{ message === 'Hello world!' ? 'keep-[business]' : 'at App.vue:4' }}</view>
<view class="{{ ['${runtimeClass}', 'before:content-[\\"not-generated\\"]'].join(' ') }}" data-label="before:content-[\\"not-generated\\"]"></view>
<view class="{{ active ? '${runtimeClass}' : 'https://example.com/a[b]?q=Hello world!' }}"></view>
`

    expect(collectUnescapedDynamicCandidates(source, new Set([runtimeClass]))).toEqual([runtimeClass])
    expect(collectUnescapedDynamicCandidates(source, new Set(['other-[1px]']))).toEqual([])
    expect(collectUnescapedDynamicCandidates(source, new Set<string>())).toEqual([
      runtimeClass,
      'keep-[business]',
      'before:content-[\\"not-generated\\"]',
    ])
  })
})
