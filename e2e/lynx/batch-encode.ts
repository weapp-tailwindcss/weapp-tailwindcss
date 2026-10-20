import type { LynxEncoderDiagnostic, SerializedLynxRule } from './encoding-types'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { transformLynxCssCompat } from '../../packages/postcss/src/compat/lynx-css'
import { transformWebCssCompat } from '../../packages/postcss/src/compat/web-css'
import { compatibilityVersions, exampleDir } from './catalog'
import { decodeLynxBundle } from './decoder'

interface TasmCodec {
  getEncodeMode: (mode?: 'wasm') => (options: unknown) => Promise<{ buffer: Uint8Array, css_diagnostics?: string }>
}

export type { LynxEncoderDiagnostic, SerializedLynxRule } from './encoding-types'

/** 批量静态验收复用真实生产 serializer/encoder，并保留编码后的 CSS 与原始诊断。 */
export async function encodeLynxCss(css: string, options: { applyCompatibility?: boolean, mode?: 'wasm', enableCSSRule?: boolean } = {}) {
  const sourceCss = options.applyCompatibility === false ? css : transformLynxCssCompat(transformWebCssCompat(css, true))
  const exampleRequire = createRequire(path.join(exampleDir, 'package.json'))
  const reactRequire = createRequire(exampleRequire.resolve('@lynx-js/react-rsbuild-plugin/package.json'))
  const templateRequire = createRequire(reactRequire.resolve('@lynx-js/template-webpack-plugin/package.json'))
  // 使用生产 encoder 和独立 WASM decoder，避免不同版本的原生库在同一进程发生 ABI 冲突。
  const encoder = templateRequire('@lynx-js/tasm') as TasmCodec
  const { cssChunksToMap } = await import(pathToFileURL(templateRequire.resolve('@lynx-js/css-serializer')).href)
  const { cssMap, cssSource } = cssChunksToMap([sourceCss], [], true)
  const encoded = await encoder.getEncodeMode(options.mode)({
    compilerOptions: {
      enableFiberArch: true,
      useLepusNG: true,
      enableReuseContext: true,
      bundleModuleMode: 'ReturnByFunction',
      enableCSSSelector: true,
      targetSdkVersion: compatibilityVersions.engineVersion,
    },
    sourceContent: { dsl: 'react_nodiff', appType: 'card', config: { lepusStrict: true, enableCSSRule: options.enableCSSRule !== false } },
    css: { cssMap, cssSource },
    lepusCode: { root: '', lepusChunk: {}, filename: 'main.js' },
    manifest: {},
    customSections: {},
  })
  const decoded = await decodeLynxBundle(encoded.buffer)
  return {
    sourceCss,
    css: decoded.css.text ?? '',
    // serializer 输入只用于定位诊断和 fallback，编码后的语义只能读取上方 css。
    rules: Object.values(cssMap).flat() as SerializedLynxRule[],
    diagnostics: JSON.parse(encoded.css_diagnostics ?? '[]') as LynxEncoderDiagnostic[],
    encodedByteLength: encoded.buffer.byteLength,
    buffer: encoded.buffer,
  }
}
