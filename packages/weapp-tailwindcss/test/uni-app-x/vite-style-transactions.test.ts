import type { Plugin, ResolvedConfig } from 'vite'
import { resolveUniUtsPlatform } from '@weapp-tailwindcss/env'
import { beforeEach, expect, it, vi } from 'vitest'
import { pluginSlots } from '@/bundlers/vite/frameworks/uni-app-x/plugin-descriptors'
import { createDeferredVitePlugins } from '@/bundlers/vite/shared/plugin-slots'
import { createUniAppXPlugins } from '@/uni-app-x/vite'

const transformUVue = vi.hoisted(() => vi.fn())
vi.mock('@/uni-app-x/transform', () => ({ transformUVue }))
beforeEach(() => transformUVue.mockImplementation(code => ({ code, map: null })))

function hook(plugin: Plugin, name: 'load' | 'transform' | 'generateBundle' | 'watchChange' | 'buildStart') {
  const value = plugin[name] as any
  return typeof value === 'object' ? value.handler : value
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const id = '/project/Probe.uvue'
const oldSource = '<template><view class="removed keep" /></template><style>.removed { @apply w-[173px]; } .keep { @apply h-[32px]; }</style>'
const currentSource = '<template><view class="removed keep" /></template><style>.keep { @apply h-[32px]; }</style>'
function generateStyles(_id: string, source: string) {
  return [
    source.includes('.removed') ? '.removed { width: 173px; }' : '',
    source.includes('.keep') ? '.keep { height: 32px; }' : '',
  ].join('\n')
}
function fixture(extra: Partial<Parameters<typeof createUniAppXPlugins>[0]> = {}) {
  const generateCss = vi.fn(generateStyles)
  const plugins = createUniAppXPlugins({
    appType: 'uni-app-x',
    customAttributesEntities: [],
    disabledDefaultTemplateHandler: false,
    mainCssChunkMatcher: () => false,
    runtimeState: { readyPromise: Promise.resolve() },
    styleHandler: async css => ({ css, map: { toJSON: () => ({ version: 3, sources: [], names: [], mappings: '' }) } }) as any,
    jsHandler: vi.fn() as any,
    ensureRuntimeClassSet: async () => new Set<string>(),
    generateCss,
    uniUtsPlatform: resolveUniUtsPlatform('app-harmony'),
    getResolvedConfig: () => ({ root: '/project', command: 'build', build: { watch: true, outDir: 'dist/app-harmony' } } as ResolvedConfig),
    uniAppX: { enabled: true, componentLocalStyles: false },
    ...extra,
  })
  const sfc = plugins.find(p => p.name === 'weapp-tailwindcss:uni-app-x:nvue')!
  const css = plugins.find(p => p.name === 'weapp-tailwindcss:uni-app-x:css:pre')!
  const bundle = plugins.find(p => p.name === 'weapp-tailwindcss:uni-app-x:style-placeholder')!
  return {
    generateCss,
    sfc,
    css,
    transform: (source: string, sourceId = id) => hook(sfc, 'transform').call({}, source, sourceId),
    load: () => hook(css, 'load').call({}, `${id}?vue&type=style&index=0&lang.css`),
    async output(source: string, moduleIds?: string[]) {
      const chunk = { type: 'chunk', fileName: 'screen.js', code: 'const _style_0 = {};\nfunction render(){return createElementVNode("view", { class: "removed keep" })}\nconst screen = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "Probe.uvue"]]);', map: { sourcesContent: [source] } }
      const files = { 'screen.js': chunk }
      await hook(bundle, 'generateBundle').call(moduleIds ? { getModuleIds: () => moduleIds.values() } : {}, {}, files, false)
      return chunk.code
    },
  }
}

it('routes source deletion through the declared Vite lifecycle', async () => {
  const f = fixture()
  await f.transform(oldSource)
  const deferred = createDeferredVitePlugins(pluginSlots.filter(slot => slot.name === f.sfc.name), () => [f.sfc])[0]!
  const configResolved = deferred.configResolved as (config: ResolvedConfig) => Promise<void>
  await configResolved.call({}, { root: '/project', command: 'build', build: { watch: true } } as ResolvedConfig)
  await hook(deferred, 'watchChange').call({}, id, { event: 'delete' })
  expect(await f.output(oldSource, [id])).not.toContain('173px')
})

it('follows a newer transaction when the previously awaited SFC rejects', async () => {
  const first = deferred<Set<string>>()
  const second = deferred<Set<string>>()
  let calls = 0
  const f = fixture({ registerModuleGraphCandidates: () => (++calls === 1 ? first.promise : second.promise) })
  const old = f.transform(oldSource)
  const oldError = expect(old).rejects.toThrow('old failed')
  await vi.waitFor(() => expect(calls).toBe(1))
  const loaded = f.load()
  const current = f.transform(currentSource)
  await vi.waitFor(() => expect(calls).toBe(2))
  first.reject(new Error('old failed'))
  second.resolve(new Set())
  await oldError
  await current
  await expect(loaded).resolves.toEqual({ code: '.keep { height: 32px; }', map: null })
})

it('keeps the settled current failure visible to later style requests', async () => {
  const f = fixture({ registerModuleGraphCandidates: async () => {
    throw new Error('current failed')
  } })
  await expect(f.transform(currentSource)).rejects.toThrow('current failed')
  await expect(f.load()).rejects.toThrow('current failed')
})

it('does not revive deleted Harmony rules in a later bundle of the same plugin', async () => {
  const f = fixture()
  await f.transform(oldSource)
  expect(await f.output(oldSource)).toContain('"removed":{"":{"width":173}}')
  await f.transform(currentSource)
  const code = await f.output(currentSource)
  expect(code).toContain('"keep":{"":{"height":32}}')
  expect(code).not.toContain('"removed":{"":{"width":173}}')
})

it('keeps another source through replacements and cached watch builds', async () => {
  const f = fixture()
  await f.transform(oldSource, '/project/Other.uvue')
  await f.transform(oldSource)
  await f.transform(currentSource)
  await hook(f.sfc, 'buildStart').call({})
  expect(await f.output(currentSource, [id, '/project/Other.uvue'])).toContain('"removed":{"":{"width":173}}')
  const code = await f.output(currentSource, [id])
  expect(code).not.toContain('"removed":{"":{"width":173}}')
})

it('forgets a deleted file without discarding unrelated current sources', async () => {
  const f = fixture()
  await f.transform(oldSource)
  await f.transform(currentSource, '/project/Other.uvue')
  await hook(f.sfc, 'watchChange')?.call({}, id, { event: 'delete' })
  const code = await f.output(currentSource)
  expect(code).toContain('"keep":{"":{"height":32}}')
  expect(code).not.toContain('"removed":{"":{"width":173}}')
})

it('does not publish failed Harmony transforms into bundle fallback styles', async () => {
  const f = fixture({ registerModuleGraphCandidates: async (_id, source) => {
    if (source === oldSource) {
      throw new Error('failed')
    }
    return new Set()
  } })
  await f.transform(currentSource)
  await expect(f.transform(oldSource)).rejects.toThrow('failed')
  const code = await f.output(currentSource)
  expect(code).toContain('"keep":{"":{"height":32}}')
  expect(code).not.toContain('"removed":{"":{"width":173}}')
})

it('does not let old derived style requests republish an authoritative rule', async () => {
  const f = fixture()
  await f.transform(oldSource)
  await f.transform(currentSource)
  await hook(f.css, 'transform').call({}, '.removed { @apply w-[173px]; }', `${id}?vue&type=style&index=0&lang.css`)
  expect(await f.output(currentSource)).not.toContain('"removed":{"":{"width":173}}')
})

it('publishes only the latest successful Harmony source after asynchronous expansion', async () => {
  const blocked = deferred<string>()
  const started = deferred<void>()
  const f = fixture({ generateCss: async (request, source) => {
    if (source.includes('.removed') && request.endsWith('.css') && !request.endsWith('uni-app-x-harmony-apply.css')) {
      started.resolve()
      return blocked.promise
    }
    return generateStyles(request, source)
  } })
  const old = f.transform(oldSource)
  await started.promise
  await f.transform(currentSource)
  blocked.resolve('.removed { width: 173px; } .keep { height: 32px; }')
  await old
  expect(await f.output(currentSource)).not.toContain('"removed":{"":{"width":173}}')
})

it('keeps Harmony source histories isolated between plugin instances', async () => {
  const first = fixture()
  await first.transform(oldSource)
  const second = fixture()
  await second.transform(currentSource)
  expect(await second.output(currentSource)).not.toContain('"removed":{"":{"width":173}}')
})

it('follows the current failed revision even after an older transform succeeds', async () => {
  const gate = deferred<Set<string>>()
  const f = fixture({ registerModuleGraphCandidates: (_id, source) => source === oldSource ? gate.promise : Promise.reject(new Error('new failed')) })
  const old = f.transform(oldSource)
  await expect(f.transform(currentSource)).rejects.toThrow('new failed')
  gate.resolve(new Set())
  await old
  await expect(f.load()).rejects.toThrow('new failed')
})

it('recovers style reads and Harmony sources after a failed current revision', async () => {
  let fail = true
  const f = fixture({ registerModuleGraphCandidates: async () => {
    if (fail) {
      throw new Error('failed')
    }
    return new Set()
  } })
  await expect(f.transform(oldSource)).rejects.toThrow('failed')
  fail = false
  await f.transform(currentSource)
  expect(await f.load()).toEqual({ code: '.keep { height: 32px; }', map: null })
  expect(await f.output(currentSource)).not.toContain('"removed":{"":{"width":173}}')
})

it.each(['/project/Probe.uvue', 'C:\\project\\Probe.uvue', '\\\\server\\share\\Probe.uvue', 'relative/Probe.uvue'])(
  'replaces Harmony references and rules by their source identity: %s',
  async (sourceId) => {
    const f = fixture()
    await f.transform(oldSource, sourceId)
    await f.transform(currentSource, sourceId)
    expect(await f.output(currentSource, [sourceId])).not.toContain('"removed":{"":{"width":173}}')
  },
)

it('moves style readers to the newest revision before the obsolete slow transform settles', async () => {
  const gate = deferred<Set<string>>()
  let started = false
  const f = fixture({ registerModuleGraphCandidates: (_id, source) => {
    if (source === oldSource) {
      started = true
      return gate.promise
    }
    return Promise.resolve(new Set())
  } })
  const old = f.transform(oldSource)
  await vi.waitFor(() => expect(started).toBe(true))
  const loaded = f.load()
  await f.transform(currentSource)
  expect(await loaded).toEqual({ code: '.keep { height: 32px; }', map: null })
  gate.resolve(new Set())
  await old
})

it('replaces old references together with the source used by the final bundle generator', async () => {
  const f = fixture()
  await f.transform(oldSource.replace('<style>', '<style>@reference "./old-theme.css";'))
  const current = currentSource.replace('<style>', '<style>@reference "./current-theme.css";')
  await f.transform(current)
  await f.output(current)
  const generated = f.generateCss.mock.calls.findLast(([request]) => request.endsWith('uni-app-x-harmony-apply.css'))![1]
  expect(generated).toContain('/project/current-theme.css')
  expect(generated).not.toContain('/project/old-theme.css')
  expect(generated).not.toContain('.removed')
})

it('keeps an empty authoritative snapshot from reviving old chunk map styles', async () => {
  const f = fixture()
  await f.transform(oldSource)
  await f.transform('<template><view class="removed keep" /></template>')
  expect(await f.output(oldSource)).not.toContain('"removed":{"":{"width":173}}')
})

it('invalidates pending reads on deletion and accepts a later restored revision', async () => {
  const gate = deferred<Set<string>>()
  const started = deferred<void>()
  const f = fixture({ registerModuleGraphCandidates: (_id, source) => {
    if (source === oldSource) {
      started.resolve()
      return gate.promise
    }
    return Promise.resolve(new Set())
  } })
  const old = f.transform(oldSource)
  await started.promise
  const loaded = f.load()
  await hook(f.sfc, 'watchChange').call({}, id, { event: 'delete' })
  await expect(loaded).resolves.toBeUndefined()
  gate.resolve(new Set())
  await old
  await f.transform(currentSource)
  await expect(f.load()).resolves.toEqual({ code: '.keep { height: 32px; }', map: null })
  expect(await f.output(currentSource)).not.toContain('"removed":{"":{"width":173}}')
})
