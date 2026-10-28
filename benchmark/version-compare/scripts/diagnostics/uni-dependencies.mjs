import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { sha256 } from './evidence.mjs'

const require = createRequire(import.meta.url)
const names = new Set(['@dcloudio/vite-plugin-uni', '@dcloudio/uni-cli-shared', '@dcloudio/uni-mp-compiler', '@dcloudio/uni-mp-vite', '@dcloudio/uni-mp-weixin', 'vite', 'rollup', 'postcss', 'postcss-selector-parser', '@babel/parser', '@babel/types', '@vue/compiler-dom', '@vue/compiler-core', '@vue/compiler-sfc', 'magic-string', 'oxc-parser', 'sass', 'esbuild'])
const queries = [
  ['demo/uni-app-vite-tailwindcss-v4/package.json', ['@dcloudio/vite-plugin-uni', 'vite', 'rollup', 'sass']],
  ['packages/weapp-tailwindcss/package.json', ['@babel/parser', '@babel/types', '@vue/compiler-dom', 'magic-string', 'oxc-parser']],
  ['packages/postcss/package.json', ['postcss', 'postcss-selector-parser']],
  ['packages/engine/package.json', ['postcss']],
]

/** 只旁观 CJS 缓存；resolve 结果绝不等同于已加载，ESM 注册表不可只读枚举。 */
export function createUniDependencyObserver({ root, moduleCache = require.cache }) {
  const metadata = new Map()
  const identities = new Map()
  let bytesRead = 0
  function limit(message) { const error = new Error(message); error.code = 'UNI_DIAGNOSTIC_LIMIT'; throw error }
  function packageFor(file) {
    let directory = path.dirname(file)
    const visited = []
    while (true) {
      if (metadata.has(directory)) {
        const result = metadata.get(directory)
        for (const item of visited) metadata.set(item, result)
        return result
      }
      visited.push(directory)
      const filename = path.join(directory, 'package.json')
      try {
        const size = fs.statSync(filename).size
        if (size > 1024 * 1024 || bytesRead + size > 32 * 1024 * 1024) limit('Uni physical package 元数据读取超过固定上限')
        const source = fs.readFileSync(filename)
        bytesRead += source.length
        const json = JSON.parse(source)
        if (typeof json.name === 'string') {
          const result = { name: json.name, version: json.version ?? 'unknown', packageFile: fs.realpathSync(filename), packageSha256: sha256(source) }
          for (const item of visited) metadata.set(item, result)
          return result
        }
      }
      catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      const parent = path.dirname(directory)
      if (parent === directory) {
        for (const item of visited) metadata.set(item, undefined)
        return undefined
      }
      directory = parent
    }
  }
  function fileIdentity(filename) {
    const physicalFile = fs.realpathSync(filename)
    if (!identities.has(physicalFile)) {
      if (identities.size >= 1024) limit('Uni physical 模块身份超过 1024 文件上限')
      const stat = fs.statSync(physicalFile)
      if (stat.size > 16 * 1024 * 1024 || bytesRead + stat.size > 32 * 1024 * 1024) limit('Uni physical 模块读取超过固定上限')
      const bytes = fs.readFileSync(physicalFile)
      bytesRead += bytes.length
      identities.set(physicalFile, { physicalFile, bytes: bytes.length, fileSha256AtObservation: sha256(bytes), ...packageFor(physicalFile) })
    }
    return identities.get(physicalFile)
  }
  return {
    snapshot() {
      const loaded = []
      const resolved = []
      const missingEvidence = []
      const modules = Object.values(moduleCache)
      if (modules.length > 8192) throw new Error('Uni CJS 缓存枚举超过固定上限')
      for (const item of modules) {
        if (item?.loaded !== true || typeof item.filename !== 'string') continue
        const owner = packageFor(item.filename)
        if (owner && names.has(owner.name)) loaded.push({ evidence: 'loaded-cjs-cache', ...fileIdentity(item.filename) })
      }
      const loadedFiles = new Set(loaded.map(item => item.physicalFile))
      const requested = [...queries.map(([relative, specs]) => [path.resolve(root, relative), specs])]
      for (const [importer, specs] of requested) {
        for (const specifier of specs) {
          try {
            const entry = createRequire(importer).resolve(specifier)
            const identity = fileIdentity(entry)
            const loadedByCjsCache = loadedFiles.has(identity.physicalFile)
            resolved.push({ evidence: 'resolved-only', importer, specifier, ...identity, loadedByCjsCache, loaded: loadedByCjsCache ? 'proven-cjs-cache' : 'unknown' })
            if (!loadedByCjsCache) missingEvidence.push({ specifier, importer, reason: '未在已完成的 CJS Module 缓存中证明该入口已加载；可能为 ESM、被 bundle 内联或尚未使用' })
            if (specifier === 'vite') requested.push([entry, ['rollup', 'postcss', 'esbuild']])
          }
          catch (error) {
            if (error?.code === 'UNI_DIAGNOSTIC_LIMIT') throw error
            missingEvidence.push({ specifier, importer, reason: '该 importer 的依赖入口解析或身份读取失败', errorCode: typeof error?.code === 'string' ? error.code : 'unknown' })
          }
        }
      }
      return { loaded, resolved, missingEvidence, bytesRead, coverage: { packageNames: [...names], unknown: ['ESM 注册表', 'bundle 内联模块', '未登记的原生后端 owner；wrapper 已加载不能证明后端已加载'] }, interpretation: 'loaded-cjs-cache 仅证明当前进程的已完成 CJS Module；文件 SHA 为观测时磁盘字节，不能证明加载时字节、调用次数或 CPU 归属。resolve 单列，ESM 与内联模块未知；不安装 loader hook、不触发依赖加载。' }
    },
  }
}
