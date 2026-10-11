import type { Plugin, ResolvedConfig } from 'vite'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { disposeCompilerOwner } from '@/compiler'
import { getCompilerContext } from '@/context'
import { createViteRuntimeClassSet } from '@/bundlers/vite/runtime-class-set'
import { createRuntimeClassSetInvalidationPlugin } from '@/bundlers/vite/runtime-class-set/invalidation-plugin'
import { createSourceCandidateCollector } from '@/bundlers/vite/source-candidates'
import { createFrameworkModuleCandidateRegistrar } from '@/bundlers/vite/shared/framework-module-candidates'
import { createUniAppXPlugins } from '@/uni-app-x/vite'
import { replaceWxml } from '@/wxml'

const roots: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

function handler(plugin: Plugin, name: 'transform' | 'buildStart' | 'handleHotUpdate') {
  const hook = plugin[name] as any
  return typeof hook === 'function' ? hook : hook?.handler
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-1245-'))
  roots.push(root)
  await fs.symlink(path.resolve(__dirname, '../../../../node_modules'), path.join(root, 'node_modules'), 'junction')
  await fs.mkdir(path.join(root, 'pages'))
  const entry = path.join(root, 'main.css')
  await fs.writeFile(entry, '@import "tailwindcss" source(none);\n@source "./pages/*.uvue";')
  return { root, entry, file: path.join(root, 'pages', 'index.uvue') }
}

function sfc(candidate: string) {
  return `<template><view :class="active" t-class="${candidate}" /></template>
<script setup lang="ts">const active = '${candidate}'; const label = 'unknown-[123]'</script>
<style scoped>.author { color: red; }</style>`
}

describe('issue 1245 real Tailwind runtime', () => {
  it.each([
    ['mp-weixin', false, false],
    ['mp-weixin', true, true],
    ['app-android', false, true],
    ['app-android', true, false],
    ['web', false, false],
    ['web', true, true],
  ] as const)('keeps consecutive edits correct on %s (local=%s trace=%s)', async (platform, local, trace) => {
    vi.stubEnv('UNI_UTS_PLATFORM', platform)
    const { root, entry, file } = await fixture()
    const initial = 'text-[#123456]'
    await fs.writeFile(file, sfc(initial))
    const ctx = getCompilerContext({ appType: 'uni-app-x', tailwindcssBasedir: root, cssEntries: [entry], cssSourceTrace: trace })
    const refresh = vi.fn(ctx.refreshTailwindcssRuntime)
    const manager = createViteRuntimeClassSet({ opts: ctx, initialTailwindRuntime: ctx.tailwindRuntime, refreshTailwindcssRuntime: refresh, uniAppXEnabled: true, customAttributesEntities: [['*', [/^t-class$/]]], disabledDefaultTemplateHandler: false, debug: () => {} })
    const collector = createSourceCandidateCollector({ customAttributesEntities: [['*', [/^t-class$/]]] })
    const register = createFrameworkModuleCandidateRegistrar({ cacheCurrent: () => {}, debug: () => {}, getCssHandlerOptions: () => ({}), getGeneratorPlatform: () => platform === 'web' ? 'h5' : platform, invalidateRecordedGeneratorCandidates: () => {}, opts: ctx, runtimeState: manager.runtimeState, sourceCandidateCollector: collector, styleHandler: ctx.styleHandler })
    const invalidate = createRuntimeClassSetInvalidationPlugin({ invalidate: manager.invalidateRuntimeClassSet, isEnabled: () => true, isRelevant: () => true })
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x', customAttributesEntities: [['*', [/^t-class$/]]], disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: () => false, runtimeState: manager.runtimeState, styleHandler: ctx.styleHandler,
      jsHandler: ctx.jsHandler, ensureRuntimeClassSet: manager.ensureRuntimeClassSet, registerModuleGraphCandidates: register,
      getResolvedConfig: () => ({ command: 'serve', root, build: {} } as ResolvedConfig),
      isWebGeneratorTarget: () => platform === 'web',
      uniAppX: { enabled: true, componentLocalStyles: { enabled: local, onlyWhenStyleIsolationVersion2: false } },
    })
    const nvue = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:nvue')!
    const pre = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:css:pre')!
    try {
      await handler(nvue, 'buildStart').call({})
      const original = await handler(nvue, 'transform').call({}, sfc(initial), file)
      expect(original.code).toContain('unknown-[123]')
      expect(refresh).toHaveBeenCalledTimes(1)
      for (const candidate of ['text-[#234567]', 'text-[#345678]']) {
        const code = sfc(candidate)
        await fs.writeFile(file, code)
        const hot = { file, read: async () => code, server: { ws: { send: vi.fn() } } }
        await handler(invalidate, 'handleHotUpdate').call({}, hot)
        // Web 在 post source-candidates 之前就会转换整个 SFC。
        await handler(pre, 'handleHotUpdate').call({}, hot)
        const result = platform === 'web'
          ? { code: await hot.read() }
          : await handler(nvue, 'transform').call({}, code, file)
        expect(result.code).toContain('unknown-[123]')
        expect(result.code).toContain(local ? 'wtu-' : platform === 'web' ? candidate : replaceWxml(candidate))
        expect(await manager.ensureRuntimeClassSet()).toContain(candidate)
        expect(await manager.ensureRuntimeClassSet()).not.toContain(initial)
      }
      expect(refresh).toHaveBeenCalledTimes(3)
      await fs.rm(file)
      manager.invalidateRuntimeClassSet()
      expect(await manager.ensureRuntimeClassSet()).not.toContain('text-[#345678]')
      await fs.writeFile(file, sfc(initial))
      manager.invalidateRuntimeClassSet()
      expect(await manager.ensureRuntimeClassSet()).toContain(initial)
      expect(refresh).toHaveBeenCalledTimes(5)
    }
    finally {
      manager.runtimeState.dispose()
      await disposeCompilerOwner(manager.runtimeState)
    }
  })

  it('refreshes changed @config dependencies without a per-module rescan', async () => {
    const { root, entry, file } = await fixture()
    const config = path.join(root, 'theme.cjs')
    await fs.writeFile(config, 'module.exports = { theme: { extend: { colors: { configured: "#123456" } } } }')
    await fs.writeFile(entry, '@import "tailwindcss" source(none); @config "./theme.cjs"; @source "./pages/*.uvue";')
    await fs.writeFile(file, '<template><view class="bg-configured bg-replacement" /></template>')
    const ctx = getCompilerContext({ appType: 'uni-app-x', tailwindcssBasedir: root, cssEntries: [entry] })
    const refresh = vi.fn(ctx.refreshTailwindcssRuntime)
    const manager = createViteRuntimeClassSet({ opts: ctx, initialTailwindRuntime: ctx.tailwindRuntime, refreshTailwindcssRuntime: refresh, uniAppXEnabled: true, customAttributesEntities: [], disabledDefaultTemplateHandler: false, debug: () => {} })
    try {
      expect(await manager.ensureRuntimeClassSet()).toContain('bg-configured')
      await fs.writeFile(config, 'module.exports = { theme: { extend: { colors: { replacement: "#234567" } } } }')
      manager.invalidateRuntimeClassSet()
      const changed = await manager.ensureRuntimeClassSet()
      expect(changed).toContain('bg-replacement')
      expect(changed).not.toContain('bg-configured')
      await manager.ensureRuntimeClassSet()
      expect(refresh).toHaveBeenCalledTimes(2)
    }
    finally {
      manager.runtimeState.dispose()
    }
  })

  it('invalidates theme and source boundary changes across two CSS entries', async () => {
    const { root, entry, file } = await fixture()
    const second = path.join(root, 'second.css')
    await fs.writeFile(file, '<template><view class="bg-brand text-accent" /></template>')
    await fs.writeFile(entry, '@import "tailwindcss" source(none); @source "./pages/*.uvue"; @theme { --color-brand: red; }')
    await fs.writeFile(second, '@import "tailwindcss" source(none); @source "./pages/*.uvue"; @theme { --color-accent: blue; }')
    const ctx = getCompilerContext({ appType: 'uni-app-x', tailwindcssBasedir: root, cssEntries: [entry, second] })
    const manager = createViteRuntimeClassSet({ opts: ctx, initialTailwindRuntime: ctx.tailwindRuntime, refreshTailwindcssRuntime: ctx.refreshTailwindcssRuntime, uniAppXEnabled: true, customAttributesEntities: [], disabledDefaultTemplateHandler: false, debug: () => {} })
    const initial = await manager.ensureRuntimeClassSet()
    expect(initial.has('bg-brand')).toBe(true)
    expect(initial.has('text-accent')).toBe(true)
    await fs.writeFile(entry, '@import "tailwindcss" source(none); @source "./pages/*.uvue";')
    manager.invalidateRuntimeClassSet()
    const changed = await manager.ensureRuntimeClassSet()
    expect(changed.has('bg-brand')).toBe(false)
    expect(changed.has('text-accent')).toBe(true)
    await fs.writeFile(entry, '@import "tailwindcss" source(none);')
    await fs.writeFile(second, '@import "tailwindcss" source(none); @theme { --color-accent: blue; }')
    manager.invalidateRuntimeClassSet()
    expect(await manager.ensureRuntimeClassSet()).not.toContain('text-accent')
    manager.runtimeState.dispose()
  })
})
