import path from 'node:path'
import process from 'node:process'

export const nativeTargets = {
  'aarch64-apple-darwin': { suffix: 'darwin-arm64', artifact: 'libweapp_tailwindcss_native.dylib' },
  'x86_64-apple-darwin': { suffix: 'darwin-x64', artifact: 'libweapp_tailwindcss_native.dylib' },
  'aarch64-unknown-linux-gnu': { suffix: 'linux-arm64-gnu', artifact: 'libweapp_tailwindcss_native.so' },
  'x86_64-unknown-linux-gnu': { suffix: 'linux-x64-gnu', artifact: 'libweapp_tailwindcss_native.so' },
  'aarch64-unknown-linux-musl': { suffix: 'linux-arm64-musl', artifact: 'libweapp_tailwindcss_native.so' },
  'x86_64-unknown-linux-musl': { suffix: 'linux-x64-musl', artifact: 'libweapp_tailwindcss_native.so' },
  'aarch64-pc-windows-msvc': { suffix: 'win32-arm64-msvc', artifact: 'weapp_tailwindcss_native.dll' },
  'x86_64-pc-windows-msvc': { suffix: 'win32-x64-msvc', artifact: 'weapp_tailwindcss_native.dll' },
}

export const nativePackagePrefix = '@weapp-tailwindcss/native-'

/** 原生验收只选择当前 Node 进程已确认的架构与 libc，不以缺少 glibc 信息猜测 musl。 */
export function hostNativeTarget(platform = process.platform, arch = process.arch, report) {
  let suffix = `${platform}-${arch}${platform === 'win32' ? '-msvc' : ''}`
  if (platform === 'linux') {
    const actual = report ?? process.report?.getReport()
    const glibc = actual?.header?.glibcVersionRuntime
    const musl = actual?.sharedObjects?.some(file => /^(?:ld-musl-|libc\.musl-)[^/]+\.so(?:\.\d+)?$/.test(path.posix.basename(file)))
    if (!actual?.header || (!glibc && !musl)) {
      throw new Error('无法确认原生宿主的 Linux libc，禁止猜测 ABI。')
    }
    suffix += glibc ? '-gnu' : '-musl'
  }
  const target = Object.keys(nativeTargets).find(target => nativeTargets[target].suffix === suffix)
  if (!target) {
    throw new Error(`无法确认原生宿主的受支持目标：${platform}/${arch}。`)
  }
  return target
}

export function bindingFileName(suffix, kernel = 'core') {
  return `${kernel === 'core' ? 'weapp-tailwindcss-native' : 'weapp-tailwindcss-postcss'}.${suffix}.node`
}
