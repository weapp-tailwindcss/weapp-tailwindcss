import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const editFile = process.env.WEAPP_TAILWINDCSS_COMMIT_MSG_FILE
if (!editFile) {
  process.stderr.write('缺少 Git 提交消息路径，请通过已安装的 Git hook 执行提交检查。\n')
  process.exitCode = 1
}
else {
  const require = createRequire(import.meta.url)
  const manifest = require.resolve('repoctl/package.json')
  const cli = path.resolve(path.dirname(manifest), require(manifest).bin.repo)
  const result = spawnSync(process.execPath, [cli, 'verify', 'commit-msg', editFile], {
    stdio: 'inherit',
  })
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`)
  }
  process.exitCode = result.status ?? 1
}
