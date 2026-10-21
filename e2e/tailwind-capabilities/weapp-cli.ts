import path from 'node:path'
import process from 'node:process'
import { assertCapabilitySuccess } from './report'
import { runStageProducer } from './stage-receipt'
import { runWeapp } from './weapp'

// 微信服务从子进程的本轮绑定读取环境，避免改变父调度器的预检身份。
const [directory, runId, pattern, flags] = process.argv.slice(2)
if (!directory || !runId) {
  throw new Error('微信能力验证缺少本轮目录和 run ID')
}
runStageProducer('weapp', () => runWeapp({
  root: path.resolve(import.meta.dirname, '../..'),
  directory,
  runId,
  env: process.env,
  ...(pattern ? { caseFilter: new RegExp(pattern, flags) } : {}),
}).then(assertCapabilitySuccess)).catch((error) => {
  process.stderr.write(`${String(error)}\n`)
  process.exitCode = 1
})
