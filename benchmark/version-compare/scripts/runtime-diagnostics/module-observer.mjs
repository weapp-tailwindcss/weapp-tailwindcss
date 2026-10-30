import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import * as module from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { readBoundedFile } from './bounded-file.mjs'
import { limits, sha256 } from './worker-evidence.mjs'

export const sourcePackages = Object.freeze(['weapp-vite', '@weapp-vite/tailwindcss', 'weapp-tailwindcss', '@weapp-tailwindcss/engine', '@weapp-tailwindcss/postcss'])
export function scriptFile(url) {
  if (typeof url !== 'string') {
    return undefined
  }
  return url.startsWith('file:') ? fileURLToPath(url) : path.isAbsolute(url) ? url : undefined
}
export function isWithin(root, file) {
  const relative = path.relative(root, file)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/** 按实际文件最近的 package manifest 判定观测范围；同名物理实例分别保留。 */
export function createSourceScope(root) {
  const owners = new Map()
  const manifestBudget = {
    bytes: 0,
    maximumBytes: 64 * 1024 * 1024,
  }
  function owner(file) {
    const visited = []
    let directory = path.dirname(file)
    let result
    while (isWithin(root, directory)) {
      if (owners.has(directory)) {
        result = owners.get(directory)
        break
      }
      visited.push(directory)
      const manifestPath = path.join(directory, 'package.json')
      if (fs.existsSync(manifestPath)) {
        const bytes = readBoundedFile(manifestPath, {
          maximumBytes: 256 * 1024,
          budget: manifestBudget,
        })
        const manifest = JSON.parse(bytes)
        result = {
          packageName: manifest.name,
          packageVersion: manifest.version,
          packageRoot: directory,
          manifestSha256: sha256(bytes),
        }
        break
      }
      const parent = path.dirname(directory)
      if (parent === directory) {
        break
      }
      directory = parent
    }
    for (const directory of visited) {
      owners.set(directory, result)
    }
    return result
  }
  return (url) => {
    let pathname
    try {
      pathname = scriptFile(url)
    }
    catch (error) {
      return {
        url,
        target: false,
        reason: 'invalid-file-url',
        detail: String(error),
      }
    }
    if (!pathname) {
      return {
        url,
        target: false,
        reason: 'non-file-url',
      }
    }
    let realpath
    try {
      realpath = fs.realpathSync(pathname)
    }
    catch (error) {
      return {
        url,
        pathname,
        target: false,
        reason: 'realpath-unavailable，可能为虚拟 sourceURL',
        detail: String(error),
      }
    }
    if (!isWithin(root, realpath)) {
      return {
        url,
        realpath,
        target: false,
        reason: 'outside-prepared-root',
      }
    }
    const metadata = owner(realpath)
    const target = sourcePackages.includes(metadata?.packageName)
    return {
      url,
      realpath,
      comparablePath: path.join('<root>', path.relative(root, realpath)),
      ...metadata,
      target,
      reason: target ? 'declared-target-package' : 'scope-out：保留解析和加载元数据，不采集源码哈希',
    }
  }
}

/** 记录真实 Node 解析与加载；不改返回值，不把 resolve/load 声称为模块执行。 */
export function createModuleObserver({
  writer,
  root,
  phase,
  onFailure,
}) {
  if (typeof module.registerHooks !== 'function') {
    throw new TypeError('当前 Node 不支持同步 module.registerHooks，模块身份缺证')
  }
  let sequence = 0
  let sourceBytes = 0
  let active = true
  const describe = createSourceScope(root)
  const seenSources = new Map()
  const counts = {
    resolve: 0,
    load: 0,
    sourceUnavailable: 0,
    sourceScopeOut: 0,
  }
  function record(type, value) {
    if (!active) {
      return
    }
    try {
      writer.append('modules.ndjson', {
        type,
        sequence: ++sequence,
        phase: phase(),
        atEpochMs: Date.now(),
        atMonotonicMs: performance.now(),
        ...value,
      })
    }
    catch (error) {
      active = false
      onFailure(error)
    }
  }
  const hooks = module.registerHooks({
    resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context)
      if (active) {
        counts.resolve++
        record('node.resolve', {
          specifier,
          parentURL: context.parentURL,
          conditions: [...context.conditions],
          result: {
            url: result.url,
            format: result.format,
            importAttributes: result.importAttributes,
          },
          interpretation: '解析结果，不证明加载或执行',
        })
      }
      return result
    },
    load(url, context, nextLoad) {
      const result = nextLoad(url, context)
      if (active) {
        try {
          const scope = describe(url)
          let sourceIdentity
          let unavailable
          if (scope.target) {
            const value = result.source
            const source = typeof value === 'string' ? Buffer.from(value) : ArrayBuffer.isView(value) ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : value instanceof ArrayBuffer ? Buffer.from(value) : undefined
            if (source) {
              const digest = sha256(source)
              const key = `${url}\0${digest}`
              if (!seenSources.has(key)) {
                if (seenSources.size >= limits.maxSourceFiles || sourceBytes + source.length > limits.maxSourceBytes) {
                  throw new Error('目标模块加载源码身份超过固定文件数或字节上限')
                }
                seenSources.set(key, true)
                sourceBytes += source.length
              }
              sourceIdentity = {
                sha256: digest,
                bytes: source.length,
                scope: 'Node load 返回的实际源码字节',
              }
            }
            else {
              counts.sourceUnavailable++
              unavailable = 'Node load 未提供源码；不以磁盘内容替代已加载字节'
            }
          }
          else {
            counts.sourceScopeOut++
            unavailable = scope.reason
          }
          counts.load++
          record('node.load', {
            ...scope,
            format: result.format,
            source: sourceIdentity,
            sourceUnavailable: unavailable,
            interpretation: '加载钩子已返回，不证明模块执行',
          })
        }
        catch (error) {
          active = false
          onFailure(error)
        }
      }
      return result
    },
  })
  return {
    describe,
    summary: () => ({
      ...counts,
      sourceFiles: seenSources.size,
      sourceBytes,
      records: sequence,
      active,
      sourcePackages,
    }),
    stop() {
      active = false
      hooks.deregister()
    },
    recordParsed(details) {
      record('v8.script-parsed', details)
    },
    recordSource(details) {
      record('v8.script-source', details)
    },
  }
}
