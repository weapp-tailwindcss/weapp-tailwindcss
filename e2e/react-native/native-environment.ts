import type { ReactNativeReport } from './catalog'
import process from 'node:process'

export function createExpoNativeEnvironment(runtimeHost: string, reportUrl: string, clientToken: string) {
  return {
    ...process.env,
    CI: '0',
    EXPO_PUBLIC_RN_REPORT_URL: reportUrl,
    EXPO_PUBLIC_RN_REPORT_CLIENT: clientToken,
    // 两个 Expo 进程分别生成 URL，必须共享同一宿主地址。
    REACT_NATIVE_PACKAGER_HOSTNAME: runtimeHost,
  }
}

export function withNativeEnvironment(report: ReactNativeReport, environment: Partial<ReactNativeReport['environment']>) {
  return { ...report, environment: { ...report.environment, ...environment } }
}
