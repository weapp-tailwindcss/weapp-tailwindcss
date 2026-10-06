import type { ProbeContext, ProbeOutput } from '../types'
import { access, readdir, readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { gradleJavaArgs } from '../../../e2e/lynx/native-command'
import { androidSdkRoot, reactNativeAndroidToolchain } from '../../../e2e/react-native/native-toolchain'
import { assertRuntimePath, runtimeCommand } from './runtime-command'

async function javaVersion(label: string, javaHome: string | undefined, ctx: ProbeContext) {
  const file = javaHome ? path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java'
  const result = await runtimeCommand(file, ['-version'], ctx.root)
  const version = /(?:java|openjdk) version "(\d+)(?:\.(\d+))?/.exec(result.output)
  const major = version?.[1] === '1' ? Number(version[2]) : Number(version?.[1])
  if (!Number.isFinite(major) || major < 17) {
    throw new Error(`${label} 需要 Java 17 以上；实际 ${result.output}`)
  }
  return { command: result.command, version: result.output }
}

async function sdkComponents(sdk: string | undefined, compileSdk: string, buildTools: string, ndk?: string) {
  if (!sdk) {
    throw new Error('Lynx Android 缺少 ANDROID_HOME / ANDROID_SDK_ROOT。')
  }
  const root = await realpath(sdk)
  const required = [path.join(root, 'platforms', `android-${compileSdk}`, 'android.jar'), path.join(root, 'build-tools', buildTools, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2')]
  if (ndk) {
    required.push(path.join(root, 'ndk', ndk, 'source.properties'))
  }
  for (const file of required) {
    await access(file).catch((cause) => {
      throw new Error(`Android SDK 缺少组件：${file}`, { cause })
    })
  }
  return { root, compileSdk, buildTools, ...(ndk ? { ndk } : {}) }
}

export async function runtimeAndroid(ctx: ProbeContext): Promise<ProbeOutput> {
  for (const key of ['ANDROID_HOME', 'ANDROID_SDK_ROOT', 'RN_JAVA_HOME', 'LYNX_JAVA_HOME']) {
    assertRuntimePath(process.env[key], key)
  }
  const rn = await reactNativeAndroidToolchain()
  const lynxHome = process.env['LYNX_JAVA_HOME'] ?? process.env['JAVA_HOME']
  assertRuntimePath(lynxHome, 'Lynx JAVA_HOME')
  assertRuntimePath(rn.javaHome, 'RN JAVA_HOME')
  const lynxJava = await javaVersion('Lynx Android', lynxHome, ctx)
  const rnJava = await javaVersion('React Native Android', rn.javaHome, ctx)
  const gradle = await runtimeCommand(process.env['LYNX_GRADLE'] ?? 'gradle', [...gradleJavaArgs(), '--version'], ctx.root, {
    ...process.env,
    ...(lynxHome ? { JAVA_HOME: lynxHome } : {}),
  })
  const version = /^Gradle (\d+)\.(\d+)(?:\.\d+)?$/m.exec(gradle.output)
  if (version?.[1] !== '8' || Number(version[2]) < 9) {
    throw new Error(`Lynx AGP 8.7.3 需要 Gradle 8.9 或更高的 8.x；实际 ${gradle.output}`)
  }
  const daemonLine = gradle.output.split('\n').find(line => line.startsWith('Daemon JVM:'))
  let daemonHome = daemonLine?.slice('Daemon JVM:'.length).trim()
  if (daemonHome?.includes(' (')) {
    daemonHome = daemonHome.slice(0, daemonHome.lastIndexOf(' ('))
  }
  if (daemonHome?.startsWith('\'') && daemonHome.endsWith('\'')) {
    daemonHome = daemonHome.slice(1, -1)
  }
  if (daemonHome && !path.isAbsolute(daemonHome)) {
    throw new Error(`无法确认 Gradle Daemon Java 路径：${daemonHome}`)
  }
  const daemonJava = daemonHome ? await javaVersion('Gradle Daemon', daemonHome, ctx) : undefined
  const gradleIdentity = { command: gradle.command, version: version[0], daemonJava, jvm: gradle.output.match(/^(?:Launcher JVM|Daemon JVM|JVM):.*$/gm)?.join('\n') ?? '' }
  const sdk = androidSdkRoot(process.env, process.platform, undefined, false)
  if (!sdk) {
    throw new Error('Lynx Android 缺少 ANDROID_HOME / ANDROID_SDK_ROOT。')
  }
  const platforms = await readdir(path.join(sdk, 'platforms'), { withFileTypes: true })
  const versions = platforms.filter(item => item.isDirectory()).map(item => /^android-(\d+)$/.exec(item.name)?.[1]).filter(Boolean).map(Number)
  const compileSdk = Math.max(...versions)
  if (!Number.isFinite(compileSdk) || compileSdk < 35) {
    throw new Error('Lynx Android 需要 Android SDK platform 35 以上。')
  }
  const lynxSdk = await sdkComponents(sdk, String(compileSdk), '35.0.0')
  const require = createRequire(path.join(ctx.root, 'examples', 'react-native-expo', 'package.json'))
  const nativeRoot = path.dirname(require.resolve('react-native/package.json'))
  const nativeVersions = await readFile(path.join(nativeRoot, 'gradle', 'libs.versions.toml'), 'utf8')
  const setting = (key: string) => {
    const value = new RegExp(`^${key} = "([\\d.]+)"`, 'm').exec(nativeVersions)?.[1]
    if (!value) {
      throw new Error(`React Native 缺少 Android 工具链版本：${key}`)
    }
    return value
  }
  const rnSdk = await sdkComponents(rn.sdk, setting('compileSdk'), setting('buildTools'), setting('ndkVersion'))
  return {
    detail: 'RN/Lynx Android 实际 Java、Gradle 可执行，所需 SDK/Build Tools/NDK 组件存在；尚未执行原生编译。',
    binding: { lynxJava: JSON.stringify(lynxJava), rnJava: JSON.stringify(rnJava), gradle: JSON.stringify(gradleIdentity), lynxSdk: JSON.stringify(lynxSdk), rnSdk: JSON.stringify(rnSdk) },
  }
}

export async function runtimeIos(ctx: ProbeContext): Promise<ProbeOutput> {
  const xcodegen = await runtimeCommand('xcodegen', ['--version'], ctx.root)
  const pod = await runtimeCommand('pod', ['--version'], ctx.root)
  const lynxPod = await runtimeCommand(process.env['LYNX_POD'] ?? 'pod', ['--version'], ctx.root)
  for (const [name, result] of Object.entries({ xcodegen, pod, lynxPod })) {
    if (!/\d+\.\d+/.test(result.output)) {
      throw new Error(`${name} 未返回有效版本：${result.output}`)
    }
  }
  return { detail: 'RN CocoaPods 与 Lynx CocoaPods/xcodegen 均可执行；尚未安装 Pods 或执行原生编译。', binding: { xcodegen: JSON.stringify(xcodegen), pod: JSON.stringify(pod), lynxPod: JSON.stringify(lynxPod) } }
}
