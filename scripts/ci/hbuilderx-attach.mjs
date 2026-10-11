import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { execa } from 'execa'

const { values } = parseArgs({ options: {
  case: { type: 'string' },
  channel: { type: 'string' },
  url: { type: 'string' },
  log: { type: 'string' },
  recover: { type: 'string' },
  help: { type: 'boolean' },
} })
if (values.help) {
  console.log('pnpm e2e:hbuilderx:attach --case 1170-LF|1170-CRLF|1144-options|1144-setup --channel stable|alpha --url http://localhost:5173/ --log <本次 IDE 日志绝对路径>\n异常中断恢复：pnpm e2e:hbuilderx:attach --recover <恢复账本路径>')
}
else {
  if (!values.recover && (!['1170-LF', '1170-CRLF', '1144-options', '1144-setup'].includes(values.case)
    || !['stable', 'alpha'].includes(values.channel) || !values.url || !values.log)) {
    throw new Error('必须显式指定 --case、--channel、--url、--log；查看 --help')
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const result = await execa('pnpm', ['exec', 'vitest', 'run', '-c', 'e2e/vitest.e2e.config.ts', 'e2e/issue-hbuilderx-attach.test.ts', '--update=none'], {
    cwd: root,
    stdio: 'inherit',
    reject: false,
    env: { ...process.env, CI: '1', E2E_HBUILDERX_ATTACH: JSON.stringify(values) },
  })
  process.exitCode = result.exitCode ?? 1
}
