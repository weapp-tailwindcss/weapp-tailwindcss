import type { ICustomAttributesEntities, JsHandler } from '@/types'
import { createGetCase, fixturesRootPath } from '#test/util'
import process from 'node:process'
import { beforeEach, afterEach } from 'vitest'
import { vi } from 'vitest'
import { createStyleHandler } from '@weapp-tailwindcss/postcss'
import { getCompilerContext } from '@/context'
import { transformUVue } from '@/uni-app-x'
import {
  shouldEnableComponentLocalStyle,
  shouldEnablePageLocalStyle,
} from '@/uni-app-x/local-style-matcher'
import { replaceWxml } from '@/wxml'

const getCase = createGetCase(fixturesRootPath)

function extractInjectedStyle(code: string) {
  const matches = [...code.matchAll(/<style scoped>\n([\s\S]*?)\n<\/style>/g)]
  const last = matches.at(-1)
  return last?.[1] ?? ''
}

function extractAliasByUtility(styleBlock: string) {
  const entries = [...styleBlock.matchAll(/\.([A-Za-z0-9-]+)(?:, :deep\(\.[A-Za-z0-9-]+\))? \{\n  @apply ([^;]+);/g)]
  return new Map(entries.map((match) => {
    const utility = match[2].endsWith("#{'!'}")
      ? `${match[2].slice(0, -"#{'!'}".length)}!`
      : match[2]
    return [utility, match[1]]
  }))
}

describe('uni-app-x', () => {
  const originalUtsPlatform = process.env.UNI_UTS_PLATFORM

  beforeEach(() => {
    process.env.UNI_UTS_PLATFORM = originalUtsPlatform
  })

  afterEach(() => {
    process.env.UNI_UTS_PLATFORM = originalUtsPlatform
  })

  it('index.uvue', async () => {
    const { jsHandler } = getCompilerContext()
    const vueRawCode = await getCase('uni-app-x/index.uvue')
    const classNameSet = new Set<string>()
    classNameSet.add('text-[#258f27]')
    classNameSet.add('text-[100px]')
    classNameSet.add('py-[22.32px]')

    expect(transformUVue(vueRawCode, 'index.uvue', jsHandler, classNameSet)).toMatchSnapshot()
  })

  it('app.uvue', async () => {
    const { jsHandler } = getCompilerContext()
    const vueRawCode = await getCase('uni-app-x/App.uvue')
    const classNameSet = new Set<string>()
    classNameSet.add('text-[#258f27]')
    classNameSet.add('text-[100px]')
    classNameSet.add('py-[22.32px]')

    expect(transformUVue(vueRawCode, 'App.uvue', jsHandler, classNameSet)).toMatchSnapshot()
  })

  it('setup-lang-uts.uvue', async () => {
    const { jsHandler } = getCompilerContext()
    const vueRawCode = await getCase('uni-app-x/setup-lang-uts.uvue')
    const classNameSet = new Set<string>()
    classNameSet.add('text-[#258f27]')
    classNameSet.add('text-[100px]')
    classNameSet.add('py-[22.32px]')
    classNameSet.add('bg-[#000]')
    classNameSet.add('bg-[#111]')
    classNameSet.add('bg-[#222]')

    expect(transformUVue(vueRawCode, 'setup-lang-uts.uvue', jsHandler, classNameSet)).toMatchSnapshot()
  })

  it('transforms static and dynamic class bindings', () => {
    const runtimeSet = new Set<string>()
    const jsHandler: JsHandler = vi.fn((source: string) => ({ code: `handled(${source})` }))
    const code = `
<template>
  <view class="text-[#123]" :class="dynamicCls">
    <text>{{ label }}</text>
  </view>
</template>
<script lang="ts">
const label = 'hi'
</script>
`
    const result = transformUVue(code, 'sample.uvue', jsHandler, runtimeSet)
    expect(result?.code).toContain(`class="${replaceWxml('text-[#123]')}"`)
    expect(result?.code).toContain('handled(dynamicCls)')
    expect(result?.code).toContain('handled(\nconst label = \'hi\'\n)')
    expect(jsHandler).toHaveBeenCalled()
  })

  it('ignores empty external WXS script blocks', () => {
    const jsHandler: JsHandler = vi.fn(source => ({ code: source }))
    const code = `<script module="touch" lang="wxs" src="../../libs/use/useTouch/touch.wxs"></script>
<script module="wxs" lang="wxs" src="./WX.wxs"></script>`

    const result = transformUVue(code, 'external-wxs.uvue', jsHandler, new Set())
    expect(result?.code).toBe(code)
    expect(jsHandler).not.toHaveBeenCalled()
  })

  it('transforms object literal class bindings with whitespace', () => {
    const { jsHandler } = getCompilerContext()
    const runtimeSet = new Set<string>([
      'border-[#ff0000]',
      'bg-blue-600/50',
    ])
    const code = `
<template>
  <view :class="{ 'border-[#ff0000] bg-blue-600/50': isActive }">hello</view>
</template>
`
    const result = transformUVue(code, 'literal.uvue', jsHandler, runtimeSet)
    expect(result?.code).toContain(replaceWxml('border-[#ff0000] bg-blue-600/50'))
  })

  it('transforms array and ternary based vue bindings', () => {
    const { jsHandler } = getCompilerContext()
    const runtimeSet = new Set<string>([
      'bg-[#123456]',
      'bg-[#654321]',
      'text-[#ff0000]',
      'font-bold',
      'border-[#111111]',
      'border-solid',
      'bg-[#999999]',
      'text-[#b01515]',
    ])
    const code = `
<template>
  <view :class="[
      flag ? 'bg-[#123456]' : 'bg-[#654321]',
      extra,
      { 'text-[#ff0000] font-bold': toggled },
      condition && 'border-[#111111] border-solid'
    ]">
    complex
  </view>
  <text class="" :class="condition ? 'bg-[#999999] text-[#b01515]' : ''">fallback</text>
  <text :class="">empty</text>
</template>
<script setup lang="ts">
const flag = true
const extra = 'font-bold'
const toggled = true
const condition = true
</script>
`
    const result = transformUVue(code, 'complex.uvue', jsHandler, runtimeSet)
    expect(result?.code).toContain(`'${replaceWxml('bg-[#123456]')}'`)
    expect(result?.code).toContain(`'${replaceWxml('bg-[#654321]')}'`)
    expect(result?.code).toContain(`'${replaceWxml('text-[#ff0000] font-bold')}'`)
    expect(result?.code).toContain(`'${replaceWxml('border-[#111111] border-solid')}'`)
    expect(result?.code).toContain(replaceWxml('bg-[#999999]'))
    expect(result?.code).toContain(replaceWxml('text-[#b01515]'))
  })

  it('respects customAttributes for static and dynamic bindings', () => {
    const { jsHandler } = getCompilerContext()
    const runtimeSet = new Set<string>([
      'bg-[#121212]',
      'bg-[#343434]',
      'text-[#565656]',
    ])
    const customAttributesEntities: ICustomAttributesEntities = [
      ['*', ['foo-class']],
      ['view', ['bar-class']],
    ]
    const code = `
<template>
  <view foo-class="bg-[#121212]" :foo-class="condition ? 'bg-[#343434]' : ''">
    <view :bar-class="'text-[#565656]'">inner</view>
  </view>
</template>
<script setup lang="ts">
const condition = true
</script>
`
    const result = transformUVue(code, 'custom.uvue', jsHandler, runtimeSet, {
      customAttributesEntities,
    })
    expect(result?.code).toContain(`foo-class="${replaceWxml('bg-[#121212]')}"`)
    expect(result?.code).toContain(replaceWxml('bg-[#343434]'))
    expect(result?.code).toContain(replaceWxml('text-[#565656]'))
  })

  it('localizes slot content and explicitly configured component class props', () => {
    const { jsHandler } = getCompilerContext({ uniAppX: true })
    const runtimeSet = new Set<string>([
      'bg-primary',
      'w-[100rpx]!',
      'h-[100rpx]',
      'rounded-[10rpx]',
      'px-[30rpx]',
    ])
    const code = `
<template>
  <a-navbar
    leftClass="bg-primary w-[100rpx]!"
    :rightClass="active ? 'bg-primary px-[30rpx]' : ''"
    label="w-[100rpx]!"
  >
    <template #left>
      <view>222</view>
    </template>
  </a-navbar>
  <image src="/static/logo.png" class="w-[100rpx]! h-[100rpx] rounded-[10rpx]" />
</template>
`
    const result = transformUVue(
      code,
      '/src/pages/navbar/index.uvue',
      jsHandler,
      runtimeSet,
      {
        customAttributesEntities: [
          ['a-navbar', ['leftClass', 'rightClass']],
        ],
        enablePageLocalStyle: true,
        webCustomAttributeDeep: true,
      },
    )

    const styleBlock = extractInjectedStyle(result!.code)
    const aliasByUtility = extractAliasByUtility(styleBlock)
    for (const utility of runtimeSet) {
      expect(aliasByUtility.get(utility), utility).toBeTruthy()
    }
    expect(styleBlock).toContain("@apply w-[100rpx]#{'!'};")
    expect(styleBlock).not.toContain('@apply w-[100rpx]!;')
    expect(styleBlock).toContain('@apply h-[100rpx];')
    expect(result?.code).toContain(`leftClass="${aliasByUtility.get('bg-primary')} ${aliasByUtility.get('w-[100rpx]!')}"`)
    expect(result?.code).toContain(aliasByUtility.get('px-[30rpx]')!)
    expect(result?.code).toContain(`class="${aliasByUtility.get('w-[100rpx]!')} ${aliasByUtility.get('h-[100rpx]')} ${aliasByUtility.get('rounded-[10rpx]')}"`)
    expect(result?.code).toContain('<template #left>')
    expect(result?.code).toContain('label="w-[100rpx]!"')
    expect(styleBlock).not.toContain('@apply issue-navbar;')
    expect(styleBlock).toContain(`.${aliasByUtility.get('bg-primary')}, :deep(.${aliasByUtility.get('bg-primary')})`)
    expect(styleBlock).not.toContain(`:deep(.${aliasByUtility.get('h-[100rpx]')})`)
  })

  it('serializes leading important utilities for Sass', () => {
    const { jsHandler } = getCompilerContext({ uniAppX: true })
    const runtimeSet = new Set(['!w-[100rpx]'])
    const result = transformUVue(
      '<template><view class="!w-[100rpx]">leading important</view></template>',
      '/src/pages/index/index.uvue',
      jsHandler,
      runtimeSet,
      { enablePageLocalStyle: true },
    )
    const styleBlock = extractInjectedStyle(result!.code)
    expect(styleBlock).toContain("@apply w-[100rpx]#{'!'};")
    expect(styleBlock).not.toContain('@apply !w-[100rpx];')
    expect(result?.code).not.toContain('class="!w-[100rpx]"')
  })

  it('uses a Sass-safe marker for native important local styles', () => {
    const { jsHandler } = getCompilerContext({ uniAppX: true })
    const result = transformUVue(
      '<template><view class="!mt-6 mt-6!">native important</view></template>\n<style lang="scss" scoped>.author { @apply !mt-6 mt-6!; }</style>',
      '/src/pages/index/index.uvue',
      jsHandler,
      new Set(['!mt-6', 'mt-6!']),
      { enablePageLocalStyle: true, native: true },
    )

    expect(result?.code).not.toContain('class="!mt-6 mt-6!"')
    expect(result?.code).toContain('@apply mt-6__weapp_tw_important__ mt-6__weapp_tw_important__;')
  })

  it('normalizes important utilities across a complete uvue fixture', async () => {
    const { jsHandler } = getCompilerContext({ uniAppX: true })
    const source = await getCase('uni-app-x/issue-1113.uvue')
    const result = transformUVue(
      source,
      '/src/pages/issue-1113/index.uvue',
      jsHandler,
      new Set(['!mt-6', 'mt-6!']),
      { enablePageLocalStyle: true, native: true },
    )

    expect(result?.code).not.toContain('class="!mt-6 mt-6!"')
    expect(result?.code).toContain('@apply mt-6__weapp_tw_important__ mt-6__weapp_tw_important__;')
  })

  it('serializes important utilities with CSS-safe syntax for Web local styles', async () => {
    const { jsHandler } = getCompilerContext({ uniAppX: true })
    const onWebLocalStyleRules = vi.fn()
    const runtimeSet = new Set(['!mt-6', 'mt-6!'])
    const result = transformUVue(
      '<template><view class="!mt-6 mt-6!">Web important</view></template>\n<style scoped>.author { color: red; }</style>',
      '/src/pages/index/index.uvue',
      jsHandler,
      runtimeSet,
      {
        enablePageLocalStyle: true,
        onWebLocalStyleRules,
      },
    )

    const styleRules = onWebLocalStyleRules.mock.calls[0]?.[0] as string | undefined
    expect(result?.code).not.toContain('class="!mt-6 mt-6!"')
    expect(styleRules).toContain('@apply mt-6!;')
    expect(styleRules).not.toContain("#{'!'}")

    const styleHandler = createStyleHandler({
      appType: 'uni-app-x',
      uniAppX: true,
      majorVersion: 4,
    })
    await expect(styleHandler(styleRules!, {
      appType: 'uni-app-x',
      uniAppX: true,
    })).resolves.toBeDefined()
  })

  it('uses a Sass-safe marker for Web-generated local style blocks', () => {
    const { jsHandler } = getCompilerContext({ uniAppX: true })
    const result = transformUVue(
      '<template><view class="!mt-6">Web generated style</view></template>',
      '/src/pages/index/index.uvue',
      jsHandler,
      new Set(['!mt-6']),
      { enablePageLocalStyle: true, onWebLocalStyleRules: vi.fn() },
    )

    expect(result?.code).toContain('@apply mt-6__weapp_tw_important__;')
    expect(result?.code).not.toContain('@apply mt-6!;')
  })

  it('recomputes dynamic custom-attribute important utilities across HMR rounds', () => {
    const { jsHandler } = getCompilerContext({ uniAppX: true })
    const rulesByRound: string[] = []
    const runtimeSet = new Set(['p-0!', 'p-10!', 'p-4!'])

    for (const utility of ['p-0!', 'p-10!', 'p-4!', 'p-0!']) {
      const onWebLocalStyleRules = vi.fn((rules: string) => rulesByRound.push(rules))
      const result = transformUVue(
        `<template><view :pt="{ root: '${utility}' }">dynamic</view></template><style scoped>.author { color: red; }</style>`,
        '/src/pages/index/index.uvue',
        jsHandler,
        runtimeSet,
        {
          customAttributesEntities: [['view', ['pt']]],
          enablePageLocalStyle: true,
          onWebLocalStyleRules,
        },
      )

      expect(result?.code).toContain('wtu-')
      expect(onWebLocalStyleRules).toHaveBeenCalledTimes(1)
    }

    expect(rulesByRound).toHaveLength(4)
    expect(rulesByRound[0]).toContain('@apply p-0!;')
    expect(rulesByRound[1]).toContain('@apply p-10!;')
    expect(rulesByRound[1]).not.toContain('@apply p-0!;')
    expect(rulesByRound[2]).toContain('@apply p-4!;')
    expect(rulesByRound[3]).toContain('@apply p-0!;')

    const clearRules = vi.fn()
    transformUVue(
      `<template><view :pt="{ root: 'p-0!' }">cleared</view></template><style scoped>.author { color: red; }</style>`,
      '/src/pages/index/index.uvue',
      jsHandler,
      new Set(),
      {
        customAttributesEntities: [['view', ['pt']]],
        enablePageLocalStyle: true,
        onWebLocalStyleRules: clearRules,
      },
    )
    expect(clearRules).toHaveBeenCalledWith('')
  })

  it('honors disabledDefaultTemplateHandler with custom class rules', () => {
    const { jsHandler } = getCompilerContext()
    const runtimeSet = new Set<string>([
      'bg-[#abcdef]',
      'bg-[#fedcba]',
    ])
    const customAttributesEntities: ICustomAttributesEntities = [
      ['*', ['class']],
    ]
    const code = `
<template>
  <view class="bg-[#abcdef]" :class="'bg-[#fedcba]'">content</view>
</template>
`
    const result = transformUVue(code, 'disabled-default.uvue', jsHandler, runtimeSet, {
      customAttributesEntities,
      disabledDefaultTemplateHandler: true,
    })
    expect(result?.code).toContain(replaceWxml('bg-[#abcdef]'))
    expect(result?.code).toContain(replaceWxml('bg-[#fedcba]'))
  })

  it('ignores non-uvue files', () => {
    const jsHandler: JsHandler = vi.fn((source: string) => ({ code: source }))
    const result = transformUVue('<template><view/></template>', 'App.vue', jsHandler, new Set())
    expect(result).toBeUndefined()
    expect(jsHandler).not.toHaveBeenCalled()
  })

  it('normalizes local style matcher ids and preserves default directories', () => {
    expect(shouldEnableComponentLocalStyle('/project/src/components/card.uvue?vue&type=template')).toBe(true)
    expect(shouldEnableComponentLocalStyle('C:\\project\\src\\components\\card.nvue#source')).toBe(true)
    expect(shouldEnablePageLocalStyle('C:\\project\\src\\pages\\index.uvue?vue&type=template')).toBe(true)
    expect(shouldEnableComponentLocalStyle('/project/src/layouts/default.uvue')).toBe(false)

    const matcher = vi.fn((id: string) => id.endsWith('/layouts/default.uvue'))
    expect(shouldEnableComponentLocalStyle('C:\\project\\src\\layouts\\default.uvue?vue&type=template', matcher)).toBe(true)
    expect(matcher).toHaveBeenCalledWith('C:/project/src/layouts/default.uvue')
  })

  it('enables local styles for custom component directories only when matched', () => {
    const { jsHandler } = getCompilerContext({ uniAppX: true })
    const code = '<template><view class="px-4" /></template>'
    const componentMatcher = (id: string) => id.endsWith('/layouts/default.uvue')
    const matched = transformUVue(
      code,
      '/project/src/layouts/default.uvue?vue&type=template',
      jsHandler,
      new Set(['px-4']),
      {
        componentMatcher,
        enableComponentLocalStyle: true,
      },
    )
    const unmatched = transformUVue(
      code,
      '/project/src/views/default.uvue',
      jsHandler,
      new Set(['px-4']),
      {
        componentMatcher,
        enableComponentLocalStyle: true,
      },
    )

    expect(matched?.code).toContain('class="wtu-')
    expect(matched?.code).toContain('@apply px-4;')
    expect(unmatched?.code).toContain('class="px-4"')
    expect(unmatched?.code).not.toContain('@apply px-4;')
  })

  it('does not expand static space-y utility in uvue template', () => {
    const { jsHandler } = getCompilerContext()
    const code = `
<template>
  <view class="space-y-4 px-4">
    <view />
    <view class="text-[#123456]" />
    <text :class="dynamicCls">hello</text>
    text
  </view>
</template>
`
    const result = transformUVue(code, '/src/pages/index.uvue', jsHandler, new Set([
      'space-y-4',
      'px-4',
      'text-[#123456]',
    ]))

    expect(result?.code).toContain('class="space-y-4 px-4"')
    expect(result?.code).toContain(`class="text-_b_h123456_B"`)
    expect(result?.code).toContain(':class="dynamicCls"')
    expect(result?.code).not.toContain('wts-')
    expect(result?.code).not.toContain('@apply mt-4;')
  })

  it('does not expand static space-x utility in uvue template', () => {
    const { jsHandler } = getCompilerContext()
    const code = `
<template>
  <view class="space-x-[12px]">
    <view />
    <view />
  </view>
</template>
`
    const result = transformUVue(code, '/src/pages/space-x.uvue', jsHandler, new Set(['space-x-[12px]']))
    expect(result?.code).toContain('class="space-x-_b12px_B"')
    expect(result?.code).not.toContain('wts-')
    expect(result?.code).not.toContain('@apply ml-[12px];')
  })

  it('does not expand reversed space utilities in uvue template', () => {
    const { jsHandler } = getCompilerContext()
    const code = `
<template>
  <view class="space-y-4 space-y-reverse space-x-2 space-x-reverse px-4">
    <view />
    <view />
  </view>
</template>
`
    const result = transformUVue(code, '/src/pages/space-reverse.uvue', jsHandler, new Set([
      'space-y-4',
      'space-y-reverse',
      'space-x-2',
      'space-x-reverse',
      'px-4',
    ]))

    expect(result?.code).toContain('class="space-y-4 space-y-reverse space-x-2 space-x-reverse px-4"')
    expect(result?.code).not.toContain('wts-')
    expect(result?.code).not.toContain('@apply mb-4;')
    expect(result?.code).not.toContain('@apply mr-2;')
  })

  it('does not expand dynamic parent space utilities in uvue template', () => {
    const { jsHandler } = getCompilerContext()
    const runtimeSet = new Set<string>([
      'space-y-4',
      'px-4',
      'text-[#123456]',
    ])
    const code = `
<template>
  <view :class="['space-y-4', 'px-4']">
    <view />
    <text class="text-[#123456]">hello</text>
  </view>
</template>
`
    const result = transformUVue(code, '/src/pages/dynamic-space-parent.uvue', jsHandler, runtimeSet)

    expect(result?.code).not.toContain('@apply mt-4;')
    expect(result?.code).not.toContain('wts-')
    expect(result?.code).toContain('space-y-4')
    expect(result?.code).toContain('px-4')
    expect(result?.code).toContain(replaceWxml('text-[#123456]'))
  })

  it.each(['app-android', 'app-ios', 'web'])(
    'supports issue 822 component local styles on %s',
    async (platform) => {
      process.env.UNI_UTS_PLATFORM = platform
      const { jsHandler } = getCompilerContext({
        uniAppX: true,
      })
      const runtimeSet = new Set<string>([
        'border',
        'border-solid',
        'border-[#999]',
        'p-4',
        'w-full',
        'h-[200px]',
        'bg-[#87add3]',
        'text-[#111]',
        'p-[20.32px]',
        'border-[#111111]',
        'bg-[#123456]',
        'mb-[12.32px]',
        'bg-[#d7700a]',
        'text-[93.54rpx]',
        'bg-[#d2e252]',
        'text-[#ff0000]',
        'bg-[#f205f6]',
        'text-[#70ed0a]',
      ])
      const source = await getCase('uni-app-x/issue-822/components/ScopedChild.uvue')
      const result = transformUVue(
        source,
        '/src/components/ScopedChild.uvue',
        jsHandler,
        runtimeSet,
        { enableComponentLocalStyle: true },
      )

      expect(result?.code).toContain('<style scoped>')
      const styleBlock = extractInjectedStyle(result!.code)
      const aliasByUtility = extractAliasByUtility(styleBlock)
      expect(aliasByUtility.get('bg-[#87add3]')).toBeTruthy()
      expect(aliasByUtility.get('text-[93.54rpx]')).toBeTruthy()
      expect(aliasByUtility.get('bg-[#123456]')).toBeTruthy()
      expect(result?.code).toContain(`class="${aliasByUtility.get('border')} ${aliasByUtility.get('border-solid')} ${aliasByUtility.get('border-[#999]')} ${aliasByUtility.get('p-4')}"`)
      expect(result?.code).toContain(aliasByUtility.get('text-[#111]')!)
      expect(result?.code).toContain(aliasByUtility.get('bg-[#123456]')!)
      expect(result?.code).toContain(aliasByUtility.get('text-[93.54rpx]')!)
      expect(result?.code).not.toContain(replaceWxml('bg-[#123456]'))

      expect(styleBlock).toContain(`.${aliasByUtility.get('bg-[#87add3]')} {`)
      expect(styleBlock).toContain('@apply bg-[#87add3];')
      expect(styleBlock).toContain('@apply text-[93.54rpx];')
      expect(styleBlock).toContain('@apply bg-[#123456];')
    },
  )

  it('injects page local styles when enabled for app-harmony pages', () => {
    process.env.UNI_UTS_PLATFORM = 'app-harmony'
    const { jsHandler } = getCompilerContext({
      uniAppX: true,
    })
    const runtimeSet = new Set<string>([
      'bg-[#123456]',
      'text-[#ff0000]',
      'p-4',
    ])
    const code = `
<template>
  <view class="bg-[#123456] p-4" :class="active ? 'text-[#ff0000]' : ''">hello</view>
</template>
<script lang="ts">
const active = true
</script>
`
    const result = transformUVue(
      code,
      '/src/pages/index/index.uvue',
      jsHandler,
      runtimeSet,
      { enablePageLocalStyle: true },
    )

    expect(result?.code).toContain('<style scoped>')
    const styleBlock = extractInjectedStyle(result!.code)
    const aliasByUtility = extractAliasByUtility(styleBlock)
    expect(aliasByUtility.get('bg-[#123456]')).toBeTruthy()
    expect(aliasByUtility.get('p-4')).toBeTruthy()
    expect(aliasByUtility.get('text-[#ff0000]')).toBeTruthy()
    expect(result?.code).toContain(`class="${aliasByUtility.get('bg-[#123456]')} ${aliasByUtility.get('p-4')}"`)
    expect(result?.code).toContain(aliasByUtility.get('text-[#ff0000]')!)
    expect(result?.code).not.toContain(replaceWxml('bg-[#123456]'))
    expect(styleBlock).toContain('@apply bg-[#123456];')
    expect(styleBlock).toContain('@apply text-[#ff0000];')
  })

  it('merges page local styles into the existing scoped style payload', () => {
    process.env.UNI_UTS_PLATFORM = 'app-android'
    const { jsHandler } = getCompilerContext({ uniAppX: true })
    const code = [
      '<template><view class="bg-[#123456]">hello</view></template>',
      '<style lang="scss" scoped>',
      '.author { @apply flex; }',
      '</style>',
    ].join('\n')

    const result = transformUVue(
      code,
      '/src/pages/index/index.uvue',
      jsHandler,
      new Set(['bg-[#123456]']),
      { enablePageLocalStyle: true },
    )

    expect(result?.code.match(/<style\b/g)).toHaveLength(1)
    expect(result?.code).toContain('.author { @apply flex; }')
    expect(result?.code).toMatch(/\.wtu-[\w-]+ \{\n  @apply bg-\[#123456\];\n\}/)
  })

  it('lowers web local utility specificity so variants can override the base utility', () => {
    const { jsHandler } = getCompilerContext({ uniAppX: true })
    const onWebLocalStyleRules = vi.fn()
    const result = transformUVue(
      '<template><view class="bg-[#eccc68] dark:bg-[#3498db]" /></template>\n<style scoped>.author { color: red; }</style>',
      '/src/pages/index/index.uvue',
      jsHandler,
      new Set(['bg-[#eccc68]', 'dark:bg-[#3498db]']),
      {
        enablePageLocalStyle: true,
        onWebLocalStyleRules,
      },
    )

    expect(result?.code).toContain('class="wtu-')
    expect(result?.code).toContain('dark:bg-[#3498db]')
    expect(onWebLocalStyleRules).toHaveBeenCalledWith(expect.stringMatching(/:global\(\.wtu-[\w-]+\)/))
  })

  it('uses the same web-safe selector when a page has no scoped author style', () => {
    const { jsHandler } = getCompilerContext({ uniAppX: true })
    const result = transformUVue(
      '<template><view class="bg-[#eccc68]" /></template>',
      '/src/pages/index/index.uvue',
      jsHandler,
      new Set(['bg-[#eccc68]']),
      {
        enablePageLocalStyle: true,
        onWebLocalStyleRules: vi.fn(),
      },
    )

    expect(result?.code).toMatch(/<style scoped>\n\/\*! weapp-tailwindcss local-utility \*\/\n:global\(\.wtu-[\w-]+\)/)
  })

  it.each(['<style scoped>.author{color:red}</style>', ''])('includes mini-program variants in the same local cascade as base utilities', (style) => {
    const jsHandler: JsHandler = (code: string) => ({ code })
    const result = transformUVue(
      `<template><view class="bg-[#eccc68] dark:bg-[#3498db]" /></template>
${style}`,
      '/project/pages/theme.uvue',
      jsHandler,
      new Set(['bg-[#eccc68]', 'dark:bg-[#3498db]']),
      { enablePageLocalStyle: true, localStyleVariants: true },
    )
    expect(result?.code).toContain('@apply bg-[#eccc68]')
    expect(result?.code).toContain('dark_cbg-_b_h3498db_B')
    expect(result?.code).toContain('@apply dark:bg-[#3498db]')
  })

  it('keeps variant utilities on the global platform pipeline for app-harmony pages', () => {
    process.env.UNI_UTS_PLATFORM = 'app-harmony'
    const { jsHandler } = getCompilerContext({
      uniAppX: true,
    })
    const runtimeSet = new Set<string>([
      'wx:bg-blue-500',
      'not-wx:bg-red-500',
      'bg-[url(http://example.com/a:b)]',
    ])
    const code = `
<template>
  <view class="wx:bg-blue-500 not-wx:bg-red-500 bg-[url(http://example.com/a:b)]">hello</view>
</template>
`
    const result = transformUVue(
      code,
      '/src/pages/index/index.uvue',
      jsHandler,
      runtimeSet,
      { enablePageLocalStyle: true },
    )

    const styleBlock = extractInjectedStyle(result!.code)
    expect(result?.code).toContain(replaceWxml('wx:bg-blue-500'))
    expect(result?.code).toContain(replaceWxml('not-wx:bg-red-500'))
    expect(styleBlock).not.toContain('@apply wx:bg-blue-500;')
    expect(styleBlock).not.toContain('@apply not-wx:bg-red-500;')
    expect(styleBlock).toContain('@apply bg-[url(http://example.com/a:b)];')
  })

  it('keeps custom scoped classes out of component local @apply output on app-android', async () => {
    process.env.UNI_UTS_PLATFORM = 'app-android'
    const { jsHandler } = getCompilerContext({
      uniAppX: true,
    })
    const runtimeSet = new Set<string>([
      'border',
      'border-solid',
      'border-[#999]',
      'p-4',
      'w-full',
      'h-[200px]',
      'bg-[#87add3]',
      'text-[#111]',
      'bg-[#123456]',
      'mb-[12.32px]',
      'bg-[#d7700a]',
    ])
    const source = await getCase('uni-app-x/issue-822/components/ScopedChildMixed.uvue')
    const result = transformUVue(
      source,
      '/src/components/ScopedChildMixed.uvue',
      jsHandler,
      runtimeSet,
      { enableComponentLocalStyle: true },
    )

    expect(result?.code).toContain('<style scoped>')
    expect(result?.code).toContain('class="manual-child"')
    const styleBlock = extractInjectedStyle(result!.code)
    const aliasByUtility = extractAliasByUtility(styleBlock)
    expect(aliasByUtility.get('bg-[#87add3]')).toBeTruthy()
    expect(aliasByUtility.get('bg-[#123456]')).toBeTruthy()
    expect(result?.code).toContain(aliasByUtility.get('text-[#111]')!)
    expect(result?.code).toContain(aliasByUtility.get('bg-[#123456]')!)
    expect(result?.code).toContain('.manual-child {')
    expect(result?.code).toContain('width: 123px;')
    expect(styleBlock).not.toContain('@apply manual-child;')
    expect(result?.code).not.toContain('@apply manual-child;')
    expect(styleBlock).toContain('@apply bg-[#87add3];')
    expect(styleBlock).toContain('@apply bg-[#123456];')
  })
})
