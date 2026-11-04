import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { buildAndLaunchIos } from './ios-build'
import { awaitIosCaptureReadiness } from './ios-capture-readiness'
import { executeIosCommand } from './ios-command'

const [device, metroUrl, artifacts] = process.argv.slice(2)
if (!device || !metroUrl || !artifacts || process.argv.length !== 5) {
  throw new Error('用法：ios-build-cli <预检设备> <Metro origin> <本轮证据目录>')
}
const project = path.resolve(import.meta.dirname, '../../examples/react-native-expo')
const startupDeadline = Number(process.env['RN_IOS_STARTUP_DEADLINE_MS'])
const remaining = startupDeadline - Date.now()
if (!Number.isSafeInteger(startupDeadline) || remaining <= 0 || remaining > 1_800_000) {
  throw new Error('iOS 启动必须复用父进程的原始 30 分钟截止时间')
}
const owner = new AbortController()
const interrupted = () => owner.abort(new Error('iOS startup owner was interrupted'))
process.once('SIGTERM', interrupted)
process.once('SIGINT', interrupted)
const timer = setTimeout(() => owner.abort(new Error('iOS native startup deadline exceeded')), remaining)
try {
  const bundleId = 'com.weapptailwindcss.rncompat'
  // CLI 保持运行直到采集链就绪；父进程不能提前进入报告计时或发布 context。
  // eslint-disable-next-line antfu/no-top-level-await
  await buildAndLaunchIos({ project, device, metroUrl, artifacts, bundleId }, (file, args, cwd, stream) => executeIosCommand(file, args, cwd, stream, owner.signal))
  // eslint-disable-next-line antfu/no-top-level-await
  const session = JSON.parse(await fs.readFile(path.join(artifacts, 'runtime-session.json'), 'utf8'))
  // eslint-disable-next-line antfu/no-top-level-await
  await awaitIosCaptureReadiness({
    directory: path.join(artifacts, 'ios-capture-startup'),
    runId: session.runId,
    invocationId: session.invocationId,
    device,
    bundleId,
    startupDeadline,
    signal: owner.signal,
    capture: (filename, signal) => executeIosCommand('xcrun', ['simctl', 'io', device, 'screenshot', filename], project, false, signal),
  })
  owner.signal.throwIfAborted()
  if (Date.now() >= startupDeadline) {
    throw new Error('iOS native startup deadline exceeded')
  }
}
finally {
  clearTimeout(timer)
  process.off('SIGTERM', interrupted)
  process.off('SIGINT', interrupted)
}
