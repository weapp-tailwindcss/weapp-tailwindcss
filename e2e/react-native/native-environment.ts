import process from 'node:process'

export function createExpoNativeEnvironment(runtimeHost: string, reportUrl: string) {
  return {
    ...process.env,
    CI: '0',
    EXPO_PUBLIC_RN_REPORT_URL: reportUrl,
    // 两个 Expo 进程分别生成 URL，必须共享同一宿主地址。
    REACT_NATIVE_PACKAGER_HOSTNAME: runtimeHost,
  }
}
