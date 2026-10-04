import type { NormalizedOutputOptions, ObjectHook, PluginContext } from 'rollup'
import type { Plugin, ResolvedConfig } from 'vite'

const wrappedPlugins = new WeakSet<Plugin>()

function unwrap<T>(hook: ObjectHook<T> | undefined): T | undefined {
  return hook && typeof hook === 'object' && 'handler' in hook ? hook.handler : hook as T | undefined
}

function replace<T>(hook: ObjectHook<T> | undefined, handler: T): ObjectHook<T> {
  return hook && typeof hook === 'object' && 'handler' in hook ? { ...hook, handler } : handler
}

function outputKey(options: Pick<NormalizedOutputOptions, 'dir' | 'file' | 'format'>) {
  // 仅序列化 Rollup 提供的输出身份；不由路径推导源文件或平台后缀。
  return JSON.stringify([options.dir, options.file, options.format])
}

/**
 * 补齐 uni-app CSS post 在空结果时省略的写入。
 * 只清空该插件先前成功写出的命名资产，失败构建不能推进已提交的归属。
 */
export function wrapViteCssPostOutput(config: ResolvedConfig) {
  const plugin = config.plugins.find(candidate => candidate.name === 'vite:css-post')
  if (!plugin || wrappedPlugins.has(plugin)) {
    return false
  }
  const generate = unwrap(plugin.generateBundle)
  if (!generate) {
    return false
  }
  const committed = new Map<string, Set<string>>()
  const pending = new Map<string, Set<string>>()
  plugin.generateBundle = replace(plugin.generateBundle, async function (options, bundle, isWrite) {
    const key = outputKey(options)
    pending.delete(key)
    const emitted = new Set<string>()
    const context = new Proxy(this, {
      get(target, property, receiver) {
        if (property === 'emitFile') {
          return ((file) => {
            const reference = target.emitFile(file)
            if (file.type === 'asset' && typeof file.fileName === 'string') {
              emitted.add(file.fileName)
            }
            return reference
          }) as PluginContext['emitFile']
        }
        return Reflect.get(target, property, receiver)
      },
    })
    await generate.call(context, options, bundle, isWrite)
    if (!isWrite) {
      return
    }
    const currentAssets = new Set(Object.values(bundle).filter(output => output.type === 'asset').map(output => output.fileName))
    for (const fileName of committed.get(key) ?? []) {
      if (!emitted.has(fileName) && !currentAssets.has(fileName)) {
        this.emitFile({ type: 'asset', fileName, source: '' })
      }
    }
    pending.set(key, emitted)
  })
  const write = unwrap(plugin.writeBundle)
  plugin.writeBundle = replace(plugin.writeBundle, async function (options, bundle) {
    await write?.call(this, options, bundle)
    const key = outputKey(options)
    const emitted = pending.get(key)
    if (emitted) {
      committed.set(key, emitted)
      pending.delete(key)
    }
  })
  const close = unwrap(plugin.closeWatcher)
  plugin.closeWatcher = replace(plugin.closeWatcher, async function () {
    try {
      await close?.call(this)
    }
    finally {
      committed.clear()
      pending.clear()
    }
  })
  wrappedPlugins.add(plugin)
  return true
}
