import type { CliOptions, MutationRoundConfig, WatchCase, WatchSession } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDemoBaseCases } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/demo/base'
import { buildDemoExtendedCases } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/demo/extended'
import { runCommentCarrierMutation } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class/comment-carrier'
import {
  mutateScriptByDataAnchorWithCommentCarrier,
  mutateTsxScriptByReturnAnchorWithCommentCarrier,
  mutateVueScriptSetupArrayByAnchorWithCommentCarrier,
} from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'

const payload = {
  marker: 'tw-watch-comment-marker',
  classLiteral: 'text-[#123456] bg-[#0f0f0f]',
  classVariableName: '__twWatchClass',
}

describe('watch-hmr comment-carrier helpers', () => {
  it('injects comment-carried classes into data-anchor scripts while keeping marker output', () => {
    const source = `Page({
  data: {
    count: 1,
  },
})`

    const mutated = mutateScriptByDataAnchorWithCommentCarrier(source, '  data: {', payload)

    expect(mutated).toContain(`/* ${payload.classLiteral} */`)
    expect(mutated).toContain(`__twWatchScriptCommentMarker: '${payload.marker}'`)
    expect(mutated).not.toContain(`'${payload.classLiteral}'`)
  })

  it('injects comment-carried classes into tsx return blocks while keeping marker output', () => {
    const source = `export default function Page() {
  return (
    <>
    </>
  )
}`

    const mutated = mutateTsxScriptByReturnAnchorWithCommentCarrier(source, payload)

    expect(mutated).toContain(`/* ${payload.classLiteral} */`)
    expect(mutated).toContain(`const __twWatchScriptCommentMarker = '${payload.marker}'`)
    expect(mutated).toContain(`<View>${payload.marker}-script-comment</View>`)
    expect(mutated).not.toContain(`className='${payload.classLiteral}'`)
  })

  it('injects comment-carried classes into vue script setup arrays while keeping marker output', () => {
    const source = `<template>
  <view class="content">
    <view>demo</view>
  </view>
</template>

<script setup lang="ts">
const classArray = [
  'text-sm',
]
</script>`

    const mutated = mutateVueScriptSetupArrayByAnchorWithCommentCarrier(
      source,
      'const classArray = [',
      payload,
    )

    expect(mutated).toContain(`/* ${payload.classLiteral} */`)
    expect(mutated).toContain(`const __twWatchScriptCommentMarker = '${payload.marker}'`)
    expect(mutated).toContain('<view hidden>{{ __twWatchScriptCommentMarker }}</view>')
    expect(mutated).not.toContain(`'${payload.classLiteral}'`)
  })

  it('waits for rollback compile settle before returning', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'weapp-tw-comment-carrier-'))
    const sourceFile = path.join(dir, 'index.vue')
    const outputWxml = path.join(dir, 'index.wxml')
    const outputJs = path.join(dir, 'index.js')
    const outputWxss = path.join(dir, 'app.wxss')
    const sourceOriginal = `<template>
  <view class="content">
    <view>demo</view>
  </view>
</template>

<script setup lang="ts">
const classArray = [
  'text-sm',
]
</script>
`

    try {
      await writeFile(sourceFile, sourceOriginal)
      await writeFile(outputWxml, '<view>demo</view>')
      await writeFile(outputJs, 'const demo = true')
      await writeFile(outputWxss, '.text-sm{}')

      const baseline = {
        wxml: (await stat(outputWxml)).mtimeMs,
        js: (await stat(outputJs)).mtimeMs,
      }
      const options: CliOptions = {
        caseName: 'uni-app-vite-tailwindcss-v4',
        timeoutMs: 2_000,
        pollMs: 5,
        skipBuild: true,
        quietSass: true,
        webOnly: false,
        styleOnly: false,
        mainStyleOnly: false,
      }
      const watchCase = {
        name: 'uni-app-vite-tailwindcss-v4',
        label: 'unit/comment-carrier',
        outputWxml,
        outputJs,
      } as WatchCase
      const roundConfig: MutationRoundConfig = {
        name: 'issue33-arbitrary',
        buildClassTokens: seed => [`text-[#${seed.slice(0, 6).padStart(6, '0')}]`],
      }
      let rollbackCompileSuccessAt = 0
      let lastCompileSuccessCalls = 0
      const session = {
        ensureRunning() {
          if (!existsSync(sourceFile)) {
            return
          }
          const source = readFileSync(sourceFile, 'utf8')
          const marker = /__twWatchScriptCommentMarker = '([^']+)'/.exec(source)?.[1]
          if (marker) {
            writeFileSync(outputJs, `const marker = '${marker}'`)
            return
          }
          if (readFileSync(outputJs, 'utf8').includes('tw-watch-')) {
            writeFileSync(outputJs, 'const demo = true')
            rollbackCompileSuccessAt = Date.now()
          }
        },
        lastCompileSuccessAt() {
          lastCompileSuccessCalls += 1
          return rollbackCompileSuccessAt
        },
        pluginProcessSamplesSince: () => [],
      } as unknown as WatchSession

      const result = await runCommentCarrierMutation({
        watchCase,
        options,
        session,
        mutation: {
          sourceFile,
          verifyEscapedIn: ['js'],
          mutate: source => source,
          mutateCommentCarrier(source, mutationPayload) {
            return mutateVueScriptSetupArrayByAnchorWithCommentCarrier(
              source,
              'const classArray = [',
              mutationPayload,
            )
          },
        },
        sourceOriginal,
        sourcePath: sourceFile,
        classVariableName: '__twWatchClass',
        globalStyleOutputs: [outputWxss],
        minRequiredGlobalStyleEscapedClasses: 0,
        roundConfig,
        baselineMtime: baseline,
      })

      expect(result.commentCarrierHmr.marker).toContain('tw-watch-uni-app-vite-tailwindcss-v4-script-issue33-arbitrary')
      expect(lastCompileSuccessCalls).toBeGreaterThan(0)
      expect(readFileSync(sourceFile, 'utf8')).toBe(sourceOriginal)
    }
    finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  it('enables comment-carrier mutation for the weapp-vite demo case', () => {
    const cases = buildDemoBaseCases('/virtual/workspace')
    const weappViteCase = cases.find(item => item.name === 'weapp-vite-tailwindcss-v4')

    expect(weappViteCase?.scriptMutation.mutateCommentCarrier).toBeTypeOf('function')
    expect(weappViteCase?.scriptMutation.commentCarrierMinRequiredGlobalStyleEscapedClasses).toBe(0)
  })

  it('disables comment-carrier mutation for the taro-vite-react-tailwindcss-v4 demo case', () => {
    const cases = buildDemoExtendedCases('/virtual/workspace')
    const taroViteCase = cases.find(item => item.name === 'taro-vite-react-tailwindcss-v4')

    expect(taroViteCase?.scriptMutation.mutateCommentCarrier).toBeUndefined()
  })

  it('disables comment-carrier mutation for the taro-webpack-react-tailwindcss-v4 demo case', () => {
    const cases = buildDemoExtendedCases('/virtual/workspace')
    const taroWebpackCase = cases.find(item => item.name === 'taro-webpack-react-tailwindcss-v4')

    expect(taroWebpackCase?.scriptMutation.mutateCommentCarrier).toBeUndefined()
  })

  it('disables comment-carrier mutation for the taro-webpack-vue3-tailwindcss-v4 demo case', () => {
    const cases = buildDemoExtendedCases('/virtual/workspace')
    const taroWebpackCase = cases.find(item => item.name === 'taro-webpack-vue3-tailwindcss-v4')

    expect(taroWebpackCase?.scriptMutation.mutateCommentCarrier).toBeUndefined()
  })

  it('enables comment-carrier mutation for the mpx demo case', () => {
    const extendedCases = buildDemoExtendedCases('/virtual/workspace')

    expect(extendedCases.find(item => item.name === 'mpx-tailwindcss-v4')?.scriptMutation.mutateCommentCarrier).toBeTypeOf('function')
  })

  it('enables comment-carrier mutation for the v4 demo cases', () => {
    const baseCases = buildDemoBaseCases('/virtual/workspace')
    const extendedCases = buildDemoExtendedCases('/virtual/workspace')

    expect(extendedCases.find(item => item.name === 'mpx-tailwindcss-v4')?.scriptMutation.mutateCommentCarrier).toBeTypeOf('function')
    expect(baseCases.find(item => item.name === 'weapp-vite-tailwindcss-v4')?.scriptMutation.mutateCommentCarrier).toBeTypeOf('function')
  })
})
