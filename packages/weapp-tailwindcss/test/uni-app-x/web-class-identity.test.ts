import { describe, expect, it, vi } from 'vitest'
import { getCompilerContext } from '@/context'
import { transformUVue } from '@/uni-app-x'
import { replaceWxml } from '@/wxml'

describe('uni-app x Web class identity', () => {
  const variant = 'dark:bg-[#3498db]'
  const utility = 'bg-[#eccc68]'
  const unknown = 'dark:bg-[#abcdef]'
  const source = `<template>
  <view class="${utility} ${variant} ${unknown}" :class="active ? '${variant}' : '${unknown}'" />
  <view :class="boundClasses" />
</template>
<script setup lang="ts">
const active = true
const boundClasses = '${utility} ${variant}'
const message = '${unknown}'
</script>`

  it.each([false, true])('preserves Web identities with local styles enabled=%s', (enablePageLocalStyle) => {
    const { jsHandler } = getCompilerContext({ uniAppX: true })
    const runtimeSet = new Set([variant, utility])
    const result = transformUVue(source, '/project/pages/theme.uvue', jsHandler, runtimeSet, {
      enablePageLocalStyle,
      onWebLocalStyleRules: vi.fn(),
    })!

    expect(result.code).toContain(` ${variant} ${unknown}"`)
    expect(result.code).toContain(`active ? '${variant}' : '${unknown}'`)
    expect(result.code).toMatch(new RegExp(`const boundClasses = '[^']+ ${variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`))
    expect(result.code).toContain(`const message = '${unknown}'`)
    expect(result.code).not.toContain(replaceWxml(variant))
    expect(result.code).not.toContain(replaceWxml(unknown))
    expect(runtimeSet).toEqual(new Set([variant, utility]))
    if (enablePageLocalStyle) {
      expect(result.code).toContain('@apply bg-[#eccc68];')
      expect(result.code).toMatch(/const boundClasses = 'wtu-/)
      expect(result.code).not.toContain('@apply dark:')
    }
  })

  it('retains the mini-program variant identity and exact candidate boundary', () => {
    const { jsHandler } = getCompilerContext({ uniAppX: true })
    const result = transformUVue(source, '/project/pages/theme.uvue', jsHandler, new Set([variant, utility]), {
      enablePageLocalStyle: true,
      localStyleVariants: true,
    })!

    expect(result.code).toContain(replaceWxml(variant))
    expect(result.code).toContain(`@apply ${variant};`)
    expect(result.code).toContain(`const message = '${unknown}'`)
    expect(result.code).not.toContain(`@apply ${unknown};`)
  })

  it('still applies configured module replacements on Web', () => {
    const { jsHandler } = getCompilerContext({ uniAppX: true, replaceRuntimePackages: true })
    const code = `<script lang="ts">import { twMerge } from 'tailwind-merge'; const className = '${variant}'</script>`
    const result = transformUVue(code, '/project/pages/theme.uvue', jsHandler, new Set([variant]), {
      onWebLocalStyleRules: vi.fn(),
    })!

    expect(result.code).toContain("from '@weapp-tailwindcss/merge'")
    expect(result.code).toContain(`const className = '${variant}'`)
  })
})
