import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { lynxDecoderIdentity } from './decoder'

/** 读取解析到的真实包，不以 package.json 中的范围或历史报告冒充已安装版本。 */
export function readInstalledVersion(fromManifest: string, packageName: string) {
  const require = createRequire(fromManifest)
  let directory: string
  try {
    directory = path.dirname(require.resolve(`${packageName}/package.json`))
  }
  catch {
    directory = path.dirname(require.resolve(packageName))
  }
  for (;;) {
    try {
      const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')) as { name?: string, version?: string }
      if (manifest.name === packageName) {
        if (!manifest.version || !/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(manifest.version)) {
          throw new Error(`${packageName} 的实际版本无效`)
        }
        return manifest.version
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
    const parent = path.dirname(directory)
    if (parent === directory) {
      throw new Error(`无法确认 ${packageName} 的实际 package.json`)
    }
    directory = parent
  }
}

/** 两端 host 必须固定相同原生版本；bundle SDK 来自实际 Rspeedy 配置。 */
export function readHostVersions(ios: string, android: string, config: string) {
  const lynxEngine = ios.match(/pod\s+['"]Lynx['"]\s*,\s*['"]([^'"]+)['"]/)?.[1]
  const androidEngine = android.match(/org\.lynxsdk\.lynx:lynx:([^"')\s]+)/)?.[1]
  const engineVersion = config.match(/engineVersion:\s*['"]([^'"]+)['"]/)?.[1]
  if (!lynxEngine || lynxEngine !== androidEngine || !engineVersion) {
    throw new Error('Lynx 双端 host 版本或 bundle engineVersion 缺失、不一致')
  }
  return { lynxEngine, engineVersion }
}

export function readCompatibilityVersions(repoRoot: string) {
  const host = path.join(repoRoot, 'e2e', 'fixtures', 'lynx-native')
  const exampleManifest = path.join(repoRoot, 'examples', 'react-lynx', 'package.json')
  const exampleRequire = createRequire(exampleManifest)
  const reactRequire = createRequire(exampleRequire.resolve('@lynx-js/react-rsbuild-plugin/package.json'))
  const templateManifest = reactRequire.resolve('@lynx-js/template-webpack-plugin/package.json')
  const bundleConfig = readFileSync(path.join(repoRoot, 'examples', 'react-lynx', 'lynx.config.ts'), 'utf8')
  return {
    tailwindcss: readInstalledVersion(exampleManifest, 'tailwindcss'),
    ...readHostVersions(
      readFileSync(path.join(host, 'ios', 'Podfile'), 'utf8'),
      readFileSync(path.join(host, 'android', 'app', 'build.gradle.kts'), 'utf8'),
      bundleConfig,
    ),
    cssDefines: readInstalledVersion(path.join(repoRoot, 'e2e', 'package.json'), '@lynx-js/css-defines'),
    tasmEncoder: readInstalledVersion(templateManifest, '@lynx-js/tasm'),
    cssSerializer: readInstalledVersion(templateManifest, '@lynx-js/css-serializer'),
    tasmDecoder: lynxDecoderIdentity(),
    bundleConfig: createHash('sha256').update(bundleConfig).digest('hex'),
  }
}
