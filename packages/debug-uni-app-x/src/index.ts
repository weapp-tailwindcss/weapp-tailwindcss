import type { Plugin } from 'vite'
import type { DebugManifest, DebugOptions, DebugStage, MatchRule } from './types'
import process from 'node:process'
import defu from 'defu'
import path from 'pathe'
import { DebugMetaWriter } from './meta'
import { toSafeRelativePath } from './path'

export type {
  DebugErrorContext,
  DebugManifest,
  DebugMetaEntry,
  DebugOptions,
  DebugStage,
  DebugWriteType,
  MatchRule,
} from './types'

function toRules(value?: MatchRule | MatchRule[]) {
  if (value === undefined) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

function matchesRule(id: string, rule: MatchRule) {
  if (typeof rule === 'string') {
    return id.includes(rule)
  }
  if (rule instanceof RegExp) {
    return rule.test(id)
  }
  return rule(id)
}

function appendIgnoredPath(ignored: unknown, ignoredPath: string) {
  if (ignored === undefined) {
    return [ignoredPath]
  }
  if (Array.isArray(ignored)) {
    return [...ignored, ignoredPath]
  }
  return [ignored, ignoredPath]
}

/**
 * 输出 `uni-app x` 多阶段构建产物到磁盘，便于排查 transform 与 bundle 过程。
 *
 * 插件会同时生成：
 * - 分阶段目录下的源码快照；
 * - 对应目录的 `_meta.json`；
 * - 根目录聚合索引 `_manifest.json`。
 */
export function debugX(options?: DebugOptions): Plugin[] {
  const {
    cwd = process.cwd(),
    log = process.env.DEBUG_UNI_APP_X_LOG === 'true',
    enabled = process.env.DEBUG_UNI_APP_X !== 'false',
    targetDir = '.debug',
    stages = ['pre', 'normal', 'post'],
    include,
    exclude,
    skipPlatforms = [],
    onError,
  } = options ?? {}

  const currentPlatform = process.env.UNI_UTS_PLATFORM ?? process.env.UNI_PLATFORM
  const isEnabled = enabled && !skipPlatforms.includes(currentPlatform ?? '')
  const enabledStages = new Set(stages)
  const includes = toRules(include)
  const excludes = toRules(exclude)
  const metaWriter = new DebugMetaWriter(cwd, targetDir, onError)
  let watchIgnoredSynced = false

  function n(id: string) {
    return toSafeRelativePath(id, cwd)
  }

  function shouldWrite(id: string, stage: DebugStage) {
    if (!isEnabled || !enabledStages.has(stage)) {
      return false
    }

    if (includes.length > 0 && !includes.some(rule => matchesRule(id, rule))) {
      return false
    }

    if (excludes.some(rule => matchesRule(id, rule))) {
      return false
    }

    return true
  }

  function createPlugin(options?: { enforce?: 'pre' | 'post' }): Plugin {
    const { enforce } = defu(options, {})
    const prefix = enforce === undefined ? 'normal' : enforce

    return {
      name: `weapp-tailwindcss:debug:${prefix}`,
      enforce,
      config(config) {
        if (!isEnabled || watchIgnoredSynced) {
          return
        }
        watchIgnoredSynced = true
        config.server ??= {}
        config.server.watch ??= {}
        config.server.watch.ignored = appendIgnoredPath(
          config.server.watch.ignored,
          path.join(cwd, targetDir, '**'),
        )
      },
      async transform(code, id) {
        if (!shouldWrite(id, prefix)) {
          return
        }

        const relativeFile = n(id)
        await metaWriter.writeDebugFile(
          path.join(cwd, targetDir, prefix, relativeFile),
          code,
          { stage: prefix, type: 'transform', id },
        )
        metaWriter.pushMeta(
          path.join(cwd, targetDir, prefix, '_meta.json'),
          prefix,
          {
            file: relativeFile,
            id,
            stage: prefix,
            type: 'transform',
          },
        )
        await metaWriter.flushMeta(path.join(cwd, targetDir, prefix, '_meta.json'), prefix, prefix)
      },
      async generateBundle(_options, bundle) {
        if (!isEnabled || !enabledStages.has(prefix)) {
          return
        }

        const bundleKeys = Object.keys(bundle).sort()
        if (log) {
          console.log('generateBundle\n', bundleKeys)
        }
        const dir = `bundle-${prefix}`
        const matchedBundleKeys = bundleKeys.filter(file => shouldWrite(file, prefix))
        if (matchedBundleKeys.length === 0) {
          return
        }

        const metaFilePath = path.join(cwd, targetDir, dir, '_meta.json')
        await metaWriter.writeDebugFile(
          path.join(cwd, targetDir, dir, '_keys.txt'),
          matchedBundleKeys.join('\n'),
          { stage: prefix, type: 'bundle', id: '_keys.txt' },
        )
        const tasks: Promise<unknown>[] = []
        for (const file of matchedBundleKeys) {
          const item = bundle[file]
          if (item.type === 'asset') {
            const relativeFile = path.join('asset', n(file))
            tasks.push(
              metaWriter.writeDebugFile(
                path.join(cwd, targetDir, dir, relativeFile),
                item.source,
                { stage: prefix, type: 'bundle', id: file },
              ),
            )
            metaWriter.pushMeta(metaFilePath, dir as keyof DebugManifest, {
              file: relativeFile,
              id: file,
              stage: prefix,
              type: 'bundle',
            })
          }
          else if (item.type === 'chunk') {
            const relativeFile = path.join('chunk', n(file))
            tasks.push(
              metaWriter.writeDebugFile(
                path.join(cwd, targetDir, dir, relativeFile),
                item.code,
                { stage: prefix, type: 'bundle', id: file },
              ),
            )
            metaWriter.pushMeta(metaFilePath, dir as keyof DebugManifest, {
              file: relativeFile,
              id: file,
              stage: prefix,
              type: 'bundle',
            })
          }
        }
        await Promise.all(tasks)
        await metaWriter.flushMeta(metaFilePath, prefix, dir as keyof DebugManifest)
      },
    }
  }

  return [
    createPlugin({ enforce: 'pre' }),
    createPlugin(),
    createPlugin({ enforce: 'post' }),
  ]
}
