import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isInside, limits, prepareRequest, readBounded, sha256, taroProject } from './identity.mjs'
import { runOwnedTaroProcess } from './process.mjs'

function errorRecord(stage, error) {
  return {
    stage,
    name: error?.name ?? 'Error',
    message: String(error?.message ?? error),
    code: error?.code,
  }
}
const limitations = ['独立诊断，仅每侧一次；没有统计置信、正式预算验收或性能回归豁免能力', 'CPU profile 覆盖整个 Node 主进程，包含启动、preload、退出时 CJS 文件哈希与报告写入；不是 processAssets 窗口', '未与同次业务 span 对齐的函数、阶段或 processAssets CPU 归因均为 unknown', 'loaded=true 的 require.cache 仅证明该主进程中已完成的 CJS 加载；ESM、worker、子进程及 bundle 内部模块身份不完整', '退出时读取磁盘的源码/package/map SHA 不能证明它们就是最初加载的字节；生成 chunk 名称或哈希不能单独证明源码不同']
async function artifact(root, file, maximum) {
  const physical = await fs.realpath(file)
  if (!isInside(root, physical)) {
    throw new Error('证据物理文件越过任务输出目录')
  }
  const bytes = await readBounded(physical, maximum)
  return {
    receipt: {
      physical,
      bytes: bytes.length,
      sha256: sha256(bytes),
    },
    bytes,
  }
}
async function collectProfiles(output, pid) {
  const names = (await fs.readdir(output)).filter(name => name.endsWith('.cpuprofile')).sort()
  if (names.length > limits.profileFiles) {
    throw new Error('CPU profile 数量超过固定上限')
  }
  const profiles = []
  let bytes = 0
  let mainBytes
  for (const name of names) {
    const {
      receipt: info,
      bytes: captured,
    } = await artifact(output, path.join(output, name), limits.profilesBytes)
    bytes += info.bytes
    if (bytes > limits.profilesBytes) {
      throw new Error('CPU profile 合计超过固定上限')
    }
    const match = /^CPU\.\d{8}\.\d{6}\.(\d+)\.(\d+)(?:\.(\d+))?\.cpuprofile$/.exec(name)
    const processId = match ? Number(match[1]) : null
    const threadId = match ? Number(match[2]) : null
    const sequence = match?.[3] === undefined ? null : Number(match[3])
    if (processId === pid && threadId === 0) {
      mainBytes = captured
    }
    profiles.push({
      ...info,
      name,
      processId,
      threadId,
      sequence,
      identityEvidence: match ? 'Node-default-filename' : 'unknown',
      mainProcess: processId === pid && threadId === 0,
    })
  }
  const main = profiles.filter(profile => profile.mainProcess)
  if (main.length !== 1) {
    throw new Error('缺少唯一、PID 与 thread=0 绑定的主进程 CPU profile')
  }
  const profile = JSON.parse(mainBytes.toString('utf8'))
  if (!Array.isArray(profile.nodes) || !Array.isArray(profile.samples) || !Array.isArray(profile.timeDeltas) || !Number.isFinite(profile.startTime) || !Number.isFinite(profile.endTime) || profile.endTime < profile.startTime || profile.samples.length !== profile.timeDeltas.length || profile.timeDeltas.some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error('主进程 CPU profile 协议不完整')
  }
  return {
    profiles,
    main: {
      ...main[0],
      startTimeUs: profile.startTime,
      endTimeUs: profile.endTime,
      samples: profile.samples.length,
      nodes: profile.nodes.length,
      scope: 'whole-main-process',
      includesExitObserver: true,
      processAssets: {
        window: 'unknown',
        attribution: 'unknown',
      },
    },
  }
}
async function collectLoaded(output, pid, identity) {
  const file = path.join(output, 'loaded-cjs.json')
  const {
    receipt,
    bytes,
  } = await artifact(output, file, limits.loadedManifestBytes)
  const loaded = JSON.parse(bytes.toString('utf8'))
  if (loaded.schemaVersion !== 1 || loaded.diagnosticOnly !== true || loaded.budgetAcceptance !== false || loaded.status !== 'complete' || loaded.incomplete !== false || loaded.pid !== pid || loaded.threadId !== 0 || Object.entries(identity).some(([key, value]) => loaded.identity?.[key] !== value)) {
    throw new Error('CJS 加载证据缺失、不完整或与本次进程身份不一致')
  }
  if (!Array.isArray(loaded.loaded)) {
    throw new TypeError('CJS manifest 缺少 loaded 清单')
  }
  return {
    ...receipt,
    count: loaded.loaded.length,
    status: loaded.status,
    observer: loaded.observer,
    observed: loaded.observed,
  }
}
async function writeReport(file, report) {
  const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
  if (bytes.length > limits.controllerBytes) {
    throw new Error('CPU controller 报告超过固定上限')
  }
  await fs.writeFile(file, bytes, {
    flag: 'wx',
  })
  return {
    physical: await fs.realpath(file),
    bytes: bytes.length,
    sha256: sha256(bytes),
  }
}
export async function runTaroCpuDiagnostics(options) {
  // 准备校验全部通过后才创建输出目录或启动 role；不隐式安装或构建。
  const prepared = await prepareRequest(options)
  const report = {
    schemaVersion: 1,
    diagnosticOnly: true,
    budgetAcceptance: false,
    status: 'complete',
    project: taroProject,
    mode: 'taro-webpack-cpu',
    runsPerRole: 1,
    order: ['base', 'current'],
    node: {
      executable: await fs.realpath(process.execPath),
      version: process.version,
      inheritedNodeOptions: prepared.nodeOptions,
    },
    preload: prepared.preload,
    limits,
    timeoutMs: prepared.timeoutMs,
    limitations,
    processAssets: {
      window: 'unknown',
      attribution: 'unknown',
    },
    roles: prepared.roles,
    runs: [],
  }
  for (const role of prepared.roles) {
    const output = path.join(prepared.output, role.role)
    const run = {
      role: role.role,
      status: 'complete',
    }
    const recordFailure = (stage, error) => {
      run.status = 'incomplete'
      run.firstFailure ??= errorRecord(stage, error)
      report.firstFailure ??= {
        role: role.role,
        ...run.firstFailure,
      }
      report.status = 'incomplete'
    }
    try {
      await fs.mkdir(output)
      const identity = {
        role: role.role,
        root: role.root,
        sourceCommit: role.sourceCommit,
        lockSha256: role.lockSha256,
        runnerSha256: role.runnerSha256,
        preloadSha256: prepared.preload.sha256,
        output: await fs.realpath(output),
      }
      run.identity = identity
      run.process = await runOwnedTaroProcess({
        cwd: role.project.physical,
        runner: role.runner.physical,
        preload: prepared.preload.physical,
        identity,
        output: identity.output,
        timeoutMs: prepared.timeoutMs,
      })
      if (run.process.firstFailure) {
        run.firstFailure = run.process.firstFailure
        recordFailure('process', new Error(run.process.firstFailure.message))
      }
      if (!run.process.closeConfirmed || run.process.cleanupErrors.length) {
        recordFailure('cleanup', new Error('任务子进程或清理未获完整确认'))
      }
      // 即使构建失败也读取现有证据，但后续错误不能覆盖最先发生的失败。
      try {
        run.cpu = await collectProfiles(identity.output, run.process.pid)
      }
      catch (error) {
        recordFailure('cpu-evidence', error)
      }
      try {
        run.loadedCjs = await collectLoaded(identity.output, run.process.pid, identity)
      }
      catch (error) {
        recordFailure('loaded-cjs-evidence', error)
      }
    }
    catch (error) {
      recordFailure('controller', error)
    }
    report.runs.push(run)
    if (run.status === 'incomplete') {
      break
    }
  }
  report.completedRoles = report.runs.filter(run => run.status === 'complete').map(run => run.role)
  report.unstartedRoles = prepared.roles.filter(role => !report.runs.some(run => run.role === role.role)).map(role => role.role)
  const receipt = await writeReport(path.join(prepared.output, 'taro-cpu-diagnostic.json'), report)
  return {
    ...report,
    receipt,
  }
}
async function main() {
  const args = process.argv.slice(2)
  if (args.length !== 4 || args[0] !== '--roots-file' || args[2] !== '--output') {
    throw new Error('用法：node run-taro-cpu.mjs --roots-file <JSON> --output <新目录>')
  }
  const requestFile = await fs.realpath(args[1])
  const request = JSON.parse((await readBounded(requestFile, limits.controllerBytes)).toString('utf8'))
  if (!request || !Array.isArray(request.roles)) {
    throw new Error('roots 文件必须提供 roles 数组')
  }
  const result = await runTaroCpuDiagnostics({
    roles: request.roles,
    timeoutMs: request.timeoutMs,
    outputDirectory: path.resolve(args[3]),
    preloadFile: fileURLToPath(new URL('./taro-cpu-loaded-preload.cjs', import.meta.url)),
  })
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    receipt: result.receipt,
    firstFailure: result.firstFailure,
  })}\n`)
  if (result.status !== 'complete') {
    process.exitCode = 1
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exitCode = 1
  })
}
