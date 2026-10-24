import type { OutputBundle, RollupOutput, RollupWatcher } from 'rollup'
import type { InlineConfig, Plugin } from 'vite'
import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { vi } from 'vitest'

export async function createCapabilityProject() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'vite-capability-framework-')))
  try {
    await symlink(path.resolve(__dirname, '../../../../../node_modules'), path.join(root, 'node_modules'), 'junction')
    await writeFile(path.join(root, 'entry.js'), 'import "./entry.css"; export const application = 1')
    await writeFile(path.join(root, 'entry.css'), '@import "tailwindcss" source(none); @source "./view.html";')
    await writeFile(path.join(root, 'view.html'), '<view class="w-[17px]" />')
    return root
  }
  catch (error) {
    await rm(root, { recursive: true, force: true })
    throw error
  }
}

export function capabilityBuildConfig(root: string, plugins: Plugin[], watch = false): InlineConfig {
  return {
    root,
    configFile: false,
    logLevel: 'silent',
    plugins,
    build: {
      write: false,
      minify: false,
      cssMinify: false,
      ...(watch ? { watch: {} } : {}),
      rollupOptions: { input: path.join(root, 'entry.js') },
    },
  }
}

export function outputAssets(result: RollupOutput | RollupOutput[] | RollupWatcher) {
  if (!Array.isArray(result) && !('output' in result)) {
    throw new Error('预期单次构建产物，实际取得 watcher')
  }
  return new Map((Array.isArray(result) ? result : [result])
    .flatMap(output => output.output)
    .flatMap(output => output.type === 'asset' ? [[output.fileName, String(output.source)] as const] : []))
}

export async function waitForCapabilityTask<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  const interrupted = Promise.withResolvers<never>()
  const onAbort = () => interrupted.reject(signal.reason)
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    return await Promise.race([task, interrupted.promise])
  }
  finally {
    signal.removeEventListener('abort', onAbort)
  }
}

export function createCapabilityWatchObserver() {
  let current = new Map<string, string>()
  let completed = 0
  let failure: unknown
  const observeBundle = (bundle: OutputBundle) => {
    current = new Map(Object.values(bundle).flatMap(output =>
      output.type === 'asset' ? [[output.fileName, String(output.source)] as const] : [],
    ))
  }
  const plugin: Plugin = {
    name: 'capability-fixture:observe-output',
    enforce: 'post',
    generateBundle: { order: 'post', handler(_options, bundle) {
      observeBundle(bundle)
    } },
  }
  return {
    plugin,
    assets: () => current,
    attach(watcher: RollupWatcher) {
      watcher.on('event', (event) => {
        if (event.code === 'END') {
          completed++
        }
        else if (event.code === 'ERROR') {
          failure = event.error
        }
      })
    },
    async waitFor(round: number, verify: (assets: Map<string, string>) => void) {
      await vi.waitFor(() => {
        if (failure) {
          throw failure
        }
        if (completed < round) {
          throw new Error(`等待测试框架第 ${round} 轮构建，已完成 ${completed} 轮`)
        }
        verify(current)
      }, { timeout: 20_000, interval: 30 })
    },
  }
}
