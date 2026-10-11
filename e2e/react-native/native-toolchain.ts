import { access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

export function androidSdkRoot(env: NodeJS.ProcessEnv, platform = process.platform, home = os.homedir(), fallback = true) {
  const api = platform === 'win32' ? path.win32 : path.posix
  if (env['ANDROID_HOME'] && env['ANDROID_SDK_ROOT']) {
    const canonical = (value: string) => platform === 'win32' ? api.resolve(value).toLowerCase() : api.resolve(value)
    if (canonical(env['ANDROID_HOME']) !== canonical(env['ANDROID_SDK_ROOT'])) {
      throw new Error('ANDROID_HOME 与 ANDROID_SDK_ROOT 指向不同目录，不能确定原生构建 SDK。')
    }
  }
  return env['ANDROID_HOME'] ?? env['ANDROID_SDK_ROOT'] ?? (fallback
    ? platform === 'darwin' ? api.join(home, 'Library', 'Android', 'sdk') : api.join(home, 'Android', 'Sdk')
    : undefined)
}

export async function reactNativeAndroidToolchain(env = process.env) {
  const studioHome = path.join(path.parse(os.homedir()).root, 'Applications', 'Android Studio.app', 'Contents', 'jbr', 'Contents', 'Home')
  const hasStudio = process.platform === 'darwin' && await access(studioHome).then(() => true, () => false)
  return {
    javaHome: env['RN_JAVA_HOME'] ?? (hasStudio ? studioHome : env['JAVA_HOME']),
    sdk: androidSdkRoot(env)!,
  }
}
