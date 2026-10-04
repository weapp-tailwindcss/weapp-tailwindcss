import { createRequire } from 'node:module'
import process from 'node:process'

export interface NativeCompiler {
  tokenizeWxml: (source: string) => Uint32Array
}

const require = createRequire(import.meta.url)
let compiler: NativeCompiler | false | undefined
let loadError: unknown

function unavailable(mode: string) {
  if (mode === 'required') {
    throw new Error('WEAPP_TW_NATIVE=required, but the native compiler could not be loaded', { cause: loadError })
  }
  return undefined
}

export function getNativeBindingSuffix(platform = process.platform, arch = process.arch) {
  if (platform === 'darwin' && (arch === 'arm64' || arch === 'x64')) {
    return `${platform}-${arch}`
  }
  if (platform === 'win32' && (arch === 'arm64' || arch === 'x64')) {
    return `${platform}-${arch}-msvc`
  }
  if (platform === 'linux' && (arch === 'arm64' || arch === 'x64')) {
    const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined
    return `${platform}-${arch}-${report?.header?.glibcVersionRuntime ? 'gnu' : 'musl'}`
  }
  return undefined
}

export function loadNativeCompiler(): NativeCompiler | undefined {
  const mode = process.env.WEAPP_TW_NATIVE ?? 'auto'
  if (mode === 'off') {
    return undefined
  }
  if (mode !== 'auto' && mode !== 'required') {
    throw new Error(`Invalid WEAPP_TW_NATIVE mode: ${mode}`)
  }
  if (compiler === false) {
    return unavailable(mode)
  }
  if (compiler) {
    return compiler
  }
  try {
    const suffix = getNativeBindingSuffix()
    if (!suffix) {
      throw new Error(`Unsupported native platform: ${process.platform}-${process.arch}`)
    }
    const loaded = require(`weapp-tailwindcss/native/bindings/weapp-tailwindcss-native.${suffix}.node`) as NativeCompiler
    if (typeof loaded.tokenizeWxml !== 'function') {
      throw new TypeError('Native compiler does not provide tokenizeWxml')
    }
    compiler = loaded
    return compiler
  }
  catch (error) {
    compiler = false
    loadError = error
    return unavailable(mode)
  }
}
