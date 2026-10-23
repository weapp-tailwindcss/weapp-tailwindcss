import type { OutputBundle } from 'rollup'
import { Buffer } from 'node:buffer'
import { createReplayCssAsset } from '../generate-bundle/rollup-assets'

/** 框架只能读取产物内容与必要来源信息，不能取得构建器持有的可变对象。 */
export type FrameworkAssetView = Readonly<{
  type: 'asset'
  fileName: string
  source: string
}> | Readonly<{
  type: 'chunk'
  fileName: string
  code: string
  map: Readonly<{ sourcesContent: readonly (string | null)[] }> | null
  viteMetadata: Readonly<{ importedCss: readonly string[] }>
}>

export type FrameworkAssets = Readonly<Record<string, FrameworkAssetView>>

export interface FrameworkAssetAccess {
  read: () => FrameworkAssets
  replaceText: (file: string, source: string) => void
  emit: (file: string, source: string) => void
  remove: (file: string) => void
}

/** 产物修改只在当前 bundler 生命周期内提交，快照不暴露原始 bundle 引用。 */
export function createFrameworkAssetAccess(bundle: OutputBundle): FrameworkAssetAccess {
  return Object.freeze({
    read() {
      return Object.freeze(Object.fromEntries(Object.entries(bundle).map(([file, output]) => [file, Object.freeze(output.type === 'asset'
        ? { type: 'asset' as const, fileName: output.fileName, source: typeof output.source === 'string' ? output.source : Buffer.from(output.source).toString('utf8') }
        : {
            type: 'chunk' as const,
            fileName: output.fileName,
            get code() { return output.code },
            map: output.map ? Object.freeze({ sourcesContent: Object.freeze([...(output.map.sourcesContent ?? [])]) }) : null,
            viteMetadata: Object.freeze({ importedCss: Object.freeze([...((output as typeof output & { viteMetadata?: { importedCss?: Set<string> } }).viteMetadata?.importedCss ?? [])]) }),
          })])))
    },
    replaceText(file: string, source: string) {
      const output = bundle[file]
      if (!output) {
        throw new Error(`框架产物不存在：${file}`)
      }
      if (output.type === 'asset') {
        output.source = source
      }
      else {
        output.code = source
      }
    },
    emit(file: string, source: string) {
      if (Object.hasOwn(bundle, file)) {
        throw new Error(`框架不能覆盖已存在的产物：${file}`)
      }
      bundle[file] = createReplayCssAsset(file, source)
    },
    remove(file: string) {
      delete bundle[file]
    },
  })
}
