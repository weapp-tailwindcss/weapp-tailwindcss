import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { prepareSourceDiagnostics } from './prepare.mjs'

export async function main(args = process.argv.slice(2)) {
  const keys = new Map()
  if (args.length % 2 !== 0) {
    throw new Error('参数必须为具名 key/value')
  }
  for (let index = 0; index < args.length; index += 2) {
    if (!['--source-repository', '--driver', '--base', '--current', '--kind', '--output', '--pnpm-entry'].includes(args[index]) || keys.has(args[index])) {
      throw new Error('未知或重复参数')
    }
    keys.set(args[index], args[index + 1])
  }
  for (const key of ['--source-repository', '--driver', '--base', '--current', '--kind', '--output']) {
    if (!keys.has(key)) {
      throw new Error(`缺参数：${key}`)
    }
  }
  const report = await prepareSourceDiagnostics({
    sourceRepository: path.resolve(keys.get('--source-repository')),
    driverCommit: keys.get('--driver'),
    products: [{
      role: 'base',
      sourceCommit: keys.get('--base'),
    }, {
      role: 'current',
      sourceCommit: keys.get('--current'),
    }],
    kind: keys.get('--kind'),
    outputDirectory: path.resolve(keys.get('--output')),
    pnpmEntry: keys.get('--pnpm-entry'),
  })
  process.stdout.write(`${JSON.stringify({
    status: report.status,
    evidenceDirectory: report.evidenceDirectory,
    receipt: report.receipt,
    firstFailure: report.firstFailure,
  })}\n`)
  if (report.status !== 'complete') {
    process.exitCode = 1
  }
  return report
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exitCode = 1
  })
}
