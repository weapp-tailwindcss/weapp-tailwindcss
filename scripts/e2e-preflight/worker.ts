import type { ProbeContext, ProbeId } from './types'
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { formatWorkflowError } from './cleanup'
import { base, hbuilderx, wechat } from './probes/desktop'
import { android, harmony, ios } from './probes/native'
import { runtimeAndroid, runtimeIos } from './probes/runtime'
import { web } from './probes/web'

const probes = { 'runtime-android': runtimeAndroid, 'runtime-ios': runtimeIos, base, hbuilderx, web, wechat, android, harmony, ios }
const [id, contextFile, resultFile] = process.argv.slice(2)
try {
  if (!id || !Object.hasOwn(probes, id) || !contextFile || !resultFile) {
    throw new Error('预检 worker 参数无效。')
  }
  const context: ProbeContext = JSON.parse(await readFile(contextFile, 'utf8'))
  await writeFile(resultFile, JSON.stringify(await probes[id as ProbeId](context)))
}
catch (error) {
  process.stderr.write(`${formatWorkflowError(error)}\n`)
  process.exitCode = 1
}
