import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'

/** 对固定 Expo 模板建立消费合同，模板变化时先审查，不假定启动参数仍会生效。 */
export function iosBundleProviderEvidence(contents: string, language: string) {
  const source = contents.replace(/\/\/[^\r\n]*/g, '')
  const factory = /let\s+delegate\s*=\s*ReactNativeDelegate\(\)\s+let\s+factory\s*=\s*ExpoReactNativeFactory\(delegate:\s*delegate\)/
  const bridge = /override\s+func\s+sourceURL\(for\s+bridge:\s*RCTBridge\)\s*->\s*URL\?\s*\{\s*(?:return\s+)?bridge\.bundleURL\s*\?\?\s*bundleURL\(\)\s*\}/
  const provider = /override\s+func\s+bundleURL\(\)\s*->\s*URL\?\s*\{\s*#if\s+DEBUG\s+return\s+RCTBundleURLProvider\.sharedSettings\(\)\.jsBundleURL\(forBundleRoot:\s*"(\.expo\/\.virtual-metro-entry)"\)\s*#else\s+return\s+Bundle\.main\.url\(forResource:\s*"main",\s*withExtension:\s*"jsbundle"\)\s*#endif\s*\}/
  const match = source.match(provider)
  if (language !== 'swift' || !factory.test(source) || !bridge.test(source) || !source.includes('bindReactNativeFactory(factory)') || !source.includes('factory.startReactNative(') || !match) {
    throw new Error('iOS AppDelegate 不满足 Expo Debug RCTBundleURLProvider 与 Release bundle 消费合同')
  }
  return { language, sha256: createHash('sha256').update(contents).digest('hex'), debugProvider: 'RCTBundleURLProvider.sharedSettings', bundleRoot: match[1]!, releaseResource: 'main.jsbundle' }
}

/** 通过 Expo 官方扫描层定位本轮 prebuild 的 AppDelegate，不推导项目目录布局。 */
export function inspectIosBundleProvider(project: string) {
  const projectRequire = createRequire(path.join(project, 'package.json'))
  const expoRequire = createRequire(projectRequire.resolve('expo/package.json'))
  const plugins = expoRequire('@expo/config-plugins') as { IOSConfig: { Paths: { getAppDelegate: (project: string) => { path: string, contents: string, language: string } } } }
  const delegate = plugins.IOSConfig.Paths.getAppDelegate(project)
  const relative = path.relative(project, delegate.path)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('iOS AppDelegate 不属于本轮 Expo 工程')
  }
  return { ...iosBundleProviderEvidence(delegate.contents, delegate.language), path: delegate.path, contents: delegate.contents }
}
