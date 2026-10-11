import type { AppType, UserDefinedOptions } from '@/types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getCompilerContext } from '@/context'
import { collectRuntimeClassSet, createTailwindRuntimeReadyPromise } from '@/tailwindcss/runtime'

interface DemoCase {
  title: string
  project: string
  entry: string
  marker: string
  closingTag: string
  appType?: AppType
  makeSnippet: (marker: string) => string
}

const demoRoot = path.resolve(__dirname, '../../../../demo')

const cases: DemoCase[] = [
  {
    title: 'gulp-tailwindcss-v4',
    project: 'gulp-tailwindcss-v4',
    entry: 'src/pages/index/index.wxml',
    marker: 'text-[#aa1116]',
    closingTag: '</view>',
    appType: 'native',
    makeSnippet: marker => `  <view class="${marker}">hmr-test</view>\n`,
  },
  {
    title: 'gulp-tailwindcss-v4',
    project: 'gulp-tailwindcss-v4',
    entry: 'src/pages/index/index.wxml',
    marker: 'text-[#aa1117]',
    closingTag: '</view>',
    appType: 'native',
    makeSnippet: marker => `  <view class="${marker}">hmr-test</view>\n`,
  },
  {
    title: 'mpx-tailwindcss-v4',
    project: 'mpx-tailwindcss-v4',
    entry: 'src/pages/index.mpx',
    marker: 'text-[#aa1112]',
    closingTag: '</template>',
    appType: 'mpx',
    makeSnippet: marker => `  <view class="${marker}">hmr-test</view>\n`,
  },
  {
    title: 'mpx-tailwindcss-v4',
    project: 'mpx-tailwindcss-v4',
    entry: 'src/pages/index.mpx',
    marker: 'text-[#aa1113]',
    closingTag: '</template>',
    appType: 'mpx',
    makeSnippet: marker => `  <view class="${marker}">hmr-test</view>\n`,
  },
  {
    title: 'taro-webpack-react-tailwindcss-v4',
    project: 'taro-webpack-react-tailwindcss-v4',
    entry: 'src/pages/index/index.tsx',
    marker: 'text-[#aa1107]',
    closingTag: '</>',
    appType: 'taro',
    makeSnippet: marker => `      <View className='${marker}'>hmr-test</View>\n`,
  },
  {
    title: 'taro-webpack-react-tailwindcss-v4',
    project: 'taro-webpack-react-tailwindcss-v4',
    entry: 'src/pages/index/index.tsx',
    marker: 'text-[#aa1111]',
    closingTag: '</>',
    appType: 'taro',
    makeSnippet: marker => `      <View className='${marker}'>hmr-test</View>\n`,
  },
  {
    title: 'taro-vite-react-tailwindcss-v4',
    project: 'taro-vite-react-tailwindcss-v4',
    entry: 'src/pages/index/index.tsx',
    marker: 'text-[#aa1108]',
    closingTag: '</View>',
    appType: 'taro',
    makeSnippet: marker => `      <View className='${marker}'>hmr-test</View>\n`,
  },
  {
    title: 'taro-vite-react-tailwindcss-v4',
    project: 'taro-vite-react-tailwindcss-v4',
    entry: 'src/pages/index/index.tsx',
    marker: 'text-[#aa1109]',
    closingTag: '</View>',
    appType: 'taro',
    makeSnippet: marker => `      <View className='${marker}'>hmr-test</View>\n`,
  },
  {
    title: 'uni-app-vite-tailwindcss-v4',
    project: 'uni-app-vite-tailwindcss-v4',
    entry: 'src/pages/index/index.vue',
    marker: 'text-[#0f835c]',
    closingTag: '</template>',
    appType: 'uni-app-vite',
    makeSnippet: marker => `  <view class="${marker}">hmr-test</view>\n`,
  },
  {
    title: 'uni-app-vite-tailwindcss-v4',
    project: 'uni-app-vite-tailwindcss-v4',
    entry: 'src/pages/index/index.vue',
    marker: 'text-[#aa1102]',
    closingTag: '</template>',
    appType: 'uni-app-vite',
    makeSnippet: marker => `  <view class="${marker}">hmr-test</view>\n`,
  },
  {
    title: 'weapp-vite-tailwindcss-v4',
    project: 'weapp-vite-tailwindcss-v4',
    entry: 'miniprogram/pages/index/index.wxml',
    marker: 'text-[#aa1115]',
    closingTag: '</view>',
    appType: 'native',
    makeSnippet: marker => `  <view class="${marker}">hmr-test</view>\n`,
  },
  {
    title: 'weapp-vite-tailwindcss-v4',
    project: 'weapp-vite-tailwindcss-v4',
    entry: 'pages/index/index.wxml',
    marker: 'text-[#aa1118]',
    closingTag: '</scroll-view>',
    appType: 'native',
    makeSnippet: marker => `    <view class="${marker}">hmr-test</view>\n`,
  },
]

function insertBeforeClosingTag(source: string, closingTag: string, snippet: string) {
  const index = source.lastIndexOf(closingTag)
  if (index === -1) {
    throw new Error(`closing tag "${closingTag}" not found`)
  }
  const head = source.slice(0, index)
  const tail = source.slice(index)
  const needsNewline = head.length > 0 && !head.endsWith('\n')
  return `${head}${needsNewline ? '\n' : ''}${snippet}${tail}`
}

async function runHotUpdateCase(testCase: DemoCase) {
  const projectRoot = path.resolve(demoRoot, testCase.project)
  const entryPath = path.resolve(projectRoot, testCase.entry)
  const original = await fs.readFile(entryPath, 'utf8')
  if (original.includes(testCase.marker)) {
    throw new Error(`expected ${testCase.marker} to be absent before the test`)
  }

  const options: UserDefinedOptions = {
    tailwindcssBasedir: projectRoot,
    ...(testCase.appType ? { appType: testCase.appType } : {}),
  }

  const ctx = getCompilerContext(options)

  await createTailwindRuntimeReadyPromise(ctx.tailwindRuntime)
  const baseline = await collectRuntimeClassSet(ctx.tailwindRuntime, { force: true, skipRefresh: true })
  expect(baseline.has(testCase.marker)).toBe(false)

  const mutated = insertBeforeClosingTag(
    original,
    testCase.closingTag,
    testCase.makeSnippet(testCase.marker),
  )
  await fs.writeFile(entryPath, mutated, 'utf8')

  try {
    await ctx.refreshTailwindcssRuntime({ clearCache: true })
    await createTailwindRuntimeReadyPromise(ctx.tailwindRuntime)
    const refreshed = await collectRuntimeClassSet(ctx.tailwindRuntime, { force: true, skipRefresh: true })
    expect(refreshed.has(testCase.marker)).toBe(true)
  }
  finally {
    await fs.writeFile(entryPath, original, 'utf8')
    await ctx.refreshTailwindcssRuntime({ clearCache: true })
    await createTailwindRuntimeReadyPromise(ctx.tailwindRuntime)
    const restored = await collectRuntimeClassSet(ctx.tailwindRuntime, { force: true, skipRefresh: true })
    expect(restored.has(testCase.marker)).toBe(false)
  }
}

describe.skip('demo hot update integration', () => {
  for (const testCase of cases) {
    it(testCase.title, async () => {
      await runHotUpdateCase(testCase)
    })
  }
})
