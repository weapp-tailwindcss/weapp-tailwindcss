import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

async function main() {
  // 每个基线使用自己的源码与依赖；通过参数选择只读基线 checkout。
  const sourceRoot = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../../..', import.meta.url)))
  const load = (file: string) => import(pathToFileURL(path.join(sourceRoot, 'packages/weapp-tailwindcss/src', file)).href)
  const { getCompilerContext } = await load('context/index.ts')
  const { createViteRuntimeClassSet } = await load('bundlers/vite/runtime-class-set.ts')
  const { createUniAppXPlugins } = await load('uni-app-x/vite.ts')
  const { createFrameworkModuleCandidateRegistrar } = await load('bundlers/vite/shared/framework-module-candidates.ts')
  const { createSourceCandidateCollector } = await load('bundlers/vite/source-candidates.ts')
  const { disposeCompilerOwner } = await load('compiler/index.ts')

  for (const size of [12, 54, 108, 216]) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-1245-bench-'))
    try {
      await fs.symlink(path.join(sourceRoot, 'node_modules'), path.join(root, 'node_modules'), 'junction')
      await fs.mkdir(path.join(root, 'pages'))
      const css = path.join(root, 'main.css')
      await fs.writeFile(css, '@import "tailwindcss" source(none);\n@source "./pages/*.uvue";')
      const files = Array.from({ length: size }, (_, index) => ({
        id: path.join(root, 'pages', `page-${index}.uvue`),
        code: `<template><view class="flex p-4 text-red-500 w-[${index + 1}px]" /></template>`,
      }))
      await Promise.all(files.map(item => fs.writeFile(item.id, item.code)))
      const samples = []
      for (let run = 0; run < 4; run++) {
        const ctx = getCompilerContext({ appType: 'uni-app-x', tailwindcssBasedir: root, cssEntries: [css], cssSourceTrace: false })
        let refreshes = 0
        let extracts = 0
        const refresh = async (options: unknown) => {
          refreshes++
          const runtime = await ctx.refreshTailwindcssRuntime(options)
          const original = runtime.extract.bind(runtime)
          runtime.extract = (...args: unknown[]) => {
            extracts++
            return original(...args)
          }
          return runtime
        }
        const manager = createViteRuntimeClassSet({ opts: ctx, initialTailwindRuntime: ctx.tailwindRuntime, refreshTailwindcssRuntime: refresh, uniAppXEnabled: true, customAttributesEntities: [], disabledDefaultTemplateHandler: false, debug: () => {} })
        const collector = createSourceCandidateCollector({})
        const register = createFrameworkModuleCandidateRegistrar({ cacheCurrent: () => {}, debug: () => {}, getCssHandlerOptions: () => ({}), getGeneratorPlatform: () => 'mp-weixin', invalidateRecordedGeneratorCandidates: () => {}, opts: ctx, runtimeState: manager.runtimeState, sourceCandidateCollector: collector, styleHandler: ctx.styleHandler })
        const plugins = createUniAppXPlugins({ appType: 'uni-app-x', customAttributesEntities: [], disabledDefaultTemplateHandler: false, mainCssChunkMatcher: () => false, runtimeState: manager.runtimeState, styleHandler: ctx.styleHandler, jsHandler: ctx.jsHandler, ensureRuntimeClassSet: manager.ensureRuntimeClassSet, registerModuleGraphCandidates: register, getResolvedConfig: () => ({ command: 'build', root, build: {} }), uniAppX: { enabled: true, componentLocalStyles: false } })
        const plugin = plugins.find((item: any) => item.name === 'weapp-tailwindcss:uni-app-x:nvue')
        const hook = (value: any) => typeof value === 'function' ? value : value.handler
        const hash = createHash('sha256')
        const start = performance.now()
        await hook(plugin.buildStart).call({})
        for (const [index, item] of files.entries()) {
          const result = await hook(plugin.transform).call({}, item.code, item.id)
          assert(result.code.includes(`w-_b${index + 1}px_B`))
          hash.update(result.code)
        }
        const milliseconds = performance.now() - start
        const outputHash = hash.digest('hex')
        samples.push({ run, milliseconds, refreshes, extracts, outputHash, peakRssKiB: process.resourceUsage().maxRSS })
        manager.runtimeState.dispose()
        await disposeCompilerOwner(manager.runtimeState)
      }
      const measured = samples.slice(1)
      const medianMs = measured.map(sample => sample.milliseconds).sort((a, b) => a - b)[1]
      assert(samples.every(sample => sample.outputHash === samples[0]!.outputHash))
      process.stdout.write(`${JSON.stringify({ size, warmups: 1, runs: 3, medianMs, samples })}\n`)
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
