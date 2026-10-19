export interface IosRuntimeOptions {
  device: string
  bundleId: string
  metroUrl: string
  project: string
}

export type IosRuntimeCommand = (file: string, args: string[], cwd: string, stream?: boolean) => Promise<string>

/** 直接启动指定应用，并通过进程参数配置 RN 的 NSArgumentDomain，避免系统深链确认。 */
export function iosRuntimeArguments({ device, bundleId, metroUrl }: Omit<IosRuntimeOptions, 'project'>) {
  if (!device || device.trim() !== device || device === 'booted' || device.startsWith('-') || /\s/.test(device)) {
    throw new Error('iOS 启动需要明确设备，不能使用隐式 booted 目标')
  }
  if (!/^[a-z\d-]+(?:\.[a-z\d-]+)+$/i.test(bundleId)) {
    throw new Error('iOS 启动需要有效应用 bundle ID')
  }
  let metro: URL
  try {
    metro = new URL(metroUrl)
  }
  catch { throw new Error('iOS Metro 地址必须是 HTTP(S) origin') }
  if (!['http:', 'https:'].includes(metro.protocol) || metro.username || metro.password || metro.search || metro.hash || metro.pathname !== '/') {
    throw new Error('iOS Metro 地址必须是无认证、路径和参数的 HTTP(S) origin')
  }
  // RN 对无端口 host 强制使用 8081；URL 会省略 80/443，因此这里必须显式恢复协议端口。
  const hostPort = `${metro.hostname}:${metro.port || (metro.protocol === 'https:' ? '443' : '80')}`
  return ['simctl', 'launch', '--terminate-running-process', device, bundleId, '-RCT_jsLocation', hostPort, '-RCT_packager_scheme', metro.protocol.slice(0, -1)]
}

/** 命令成功只证明启动请求完成；仍需等待本轮 runtime report 与语义证据。 */
export async function launchIosRuntime(options: IosRuntimeOptions, execute: IosRuntimeCommand) {
  const args = iosRuntimeArguments(options)
  const stdout = await execute('xcrun', args, options.project, true)
  const prefix = `${options.bundleId}: `
  const output = stdout.trim()
  const pidSource = output.startsWith(prefix) ? output.slice(prefix.length) : ''
  const pid = Number(pidSource)
  if (!/^[1-9]\d*$/.test(pidSource) || !Number.isSafeInteger(pid)) {
    throw new Error(`iOS 启动回执缺少目标应用的唯一有效 PID: ${stdout}`)
  }
  return { provider: 'simctl-launch-nsargumentdomain', device: options.device, bundleId: options.bundleId, metroUrl: new URL(options.metroUrl).origin, args, pid, stdout }
}
