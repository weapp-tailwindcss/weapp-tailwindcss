import { execFile } from 'node:child_process'

/** 门禁领取后确认基线是当前仓库内的提交，避免完成设备验收才发现基线无效。 */
export async function verifyBaseline(baseline: string) {
  const resolved = await new Promise<string>((resolve, reject) => {
    execFile('git', ['rev-parse', '--verify', '--end-of-options', `${baseline}^{commit}`], { timeout: 15_000, windowsHide: true, encoding: 'utf8' }, (error, stdout) => {
      if (error) {
        reject(new Error(`性能基线提交不可用：${baseline}`, { cause: error }))
      }
      else {
        resolve(stdout.trim())
      }
    })
  })
  if (resolved !== baseline.toLowerCase()) {
    throw new Error(`性能基线必须直接指定提交 SHA：${baseline}`)
  }
  return resolved
}
