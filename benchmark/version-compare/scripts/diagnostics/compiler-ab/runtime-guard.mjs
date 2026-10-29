import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { readEvidence } from './runtime-guard/evidence.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
const runtime = path.join(directory, 'runtime-guard.cjs')
const runtimeFiles = [runtime, ...['identity.cjs', 'launch.cjs'].map(filename => path.join(directory, 'runtime-guard', filename))]
const digest = filename => createHash('sha256').update(readFileSync(filename)).digest('hex')

/** 创建诊断专用的固定 bootstrap 与独立收据目录。 */
export function createRuntimeGuardSession(destination, { nativeHelpers = [], webpackSources } = {}) {
  mkdirSync(destination, { recursive: true })
  const sessionDirectory = realpathSync(destination)
  const events = path.join(sessionDirectory, 'events')
  mkdirSync(events)
  let compilerSources
  if (webpackSources) {
    const file = path.join(sessionDirectory, 'webpack-sources.json')
    writeFileSync(file, `${JSON.stringify(webpackSources)}\n`, { flag: 'wx' })
    compilerSources = { file, sha256: digest(file) }
  }
  const session = {
    id: randomUUID(),
    directory: sessionDirectory,
    bootstrap: path.join(sessionDirectory, 'bootstrap.cjs'),
    codeHashes: Object.fromEntries(runtimeFiles.map(filename => [filename, digest(filename)])),
    compilerSources,
    nativeHelpers: nativeHelpers.map(helper => {
      const filename = realpathSync(helper.path)
      if (!/^[a-f0-9]{64}$/.test(helper.sha256) || digest(filename) !== helper.sha256 || !Array.isArray(helper.args) || helper.args.some(value => typeof value !== 'string')) throw new Error('Invalid native helper identity')
      return { path: filename, sha256: helper.sha256, args: [...helper.args] }
    }),
  }
  const source = `require(${JSON.stringify(runtime)}).install(${JSON.stringify(session)})\n`
  writeFileSync(session.bootstrap, source, { flag: 'wx' })
  session.bootstrapSha = digest(session.bootstrap)
  return {
    session,
    execArgv: ['--require', session.bootstrap],
    env: {
      WEAPP_TW_COMPILER_AB_GUARD: JSON.stringify(session),
      NODE_OPTIONS: `--require ${JSON.stringify(session.bootstrap)}${process.env.NODE_OPTIONS ? ` ${process.env.NODE_OPTIONS}` : ''}`,
    },
  }
}

/** 在业务进程及其任务资源已确认关闭后校验完整运行证据。 */
export function readRuntimeGuardEvidence(session, { rootPid }) {
  return readEvidence(session, rootPid, digest)
}
