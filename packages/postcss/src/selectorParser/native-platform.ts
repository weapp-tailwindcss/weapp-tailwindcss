import process from 'node:process'

/** 独立解析本包使用的预编译目标，不依赖上层编译器包。 */
export function getNativeSelectorBindingSuffix(platform = process.platform, arch = process.arch) {
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
