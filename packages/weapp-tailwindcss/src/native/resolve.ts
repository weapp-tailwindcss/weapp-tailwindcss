import process from 'node:process'

interface RuntimeReport {
  header?: { glibcVersionRuntime?: string }
}

export function getNativeBindingSuffix(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  report: () => RuntimeReport | undefined = () => process.report?.getReport() as RuntimeReport | undefined,
) {
  if (arch !== 'arm64' && arch !== 'x64') {
    return undefined
  }
  if (platform === 'darwin') {
    return `${platform}-${arch}`
  }
  if (platform === 'win32') {
    return `${platform}-${arch}-msvc`
  }
  if (platform === 'linux') {
    const header = report()?.header
    // 无 report 时不能猜测 libc；由上层沿用 JavaScript 回退。
    return header ? `${platform}-${arch}-${header.glibcVersionRuntime ? 'gnu' : 'musl'}` : undefined
  }
  return undefined
}

interface NativeRequire {
  (id: string): unknown
  resolve: (id: string) => string
}

export function requireNativeBinding(require: NativeRequire, suffix: string): unknown {
  const packageName = `@weapp-tailwindcss/native-${suffix}`
  const candidates = [packageName, `weapp-tailwindcss/native/bindings/weapp-tailwindcss-native.${suffix}.node`]
  const errors: unknown[] = []
  for (const candidate of candidates) {
    let resolved: string
    try {
      // 只在解析不到包时尝试本地开发产物；包已存在但损坏时不能掩盖错误。
      resolved = require.resolve(candidate)
    }
    catch (error) {
      errors.push(error)
      if ((error as NodeJS.ErrnoException)?.code !== 'MODULE_NOT_FOUND') {
        throw error
      }
      continue
    }
    return require(resolved)
  }
  throw new AggregateError(errors, `Unable to resolve native compiler package ${packageName}`)
}
