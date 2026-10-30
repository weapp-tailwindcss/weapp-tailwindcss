import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { artifactBytes, logSink } from './process-output.mjs'

function errorRecord(stage, error) {
  return {
    stage,
    name: error?.name ?? 'Error',
    message: String(error?.message ?? error),
    code: error?.code,
  }
}
export async function runOwnedTaroProcess({
  cwd,
  runner,
  preload,
  identity,
  output,
  timeoutMs,
}) {
  let child
  let firstFailure
  let closed = false
  let terminating = false
  let terminationStartedAt
  let ownedGroupCloseConfirmed = process.platform === 'win32' ? null : true
  let hardKill
  let unresolvedClose
  let finishProcess
  let completion
  const cleanupErrors = []
  const cleanupTasks = []
  const recordFailure = (stage, error) => {
    firstFailure ??= errorRecord(stage, error)
  }
  const stopOwnedTree = (signal) => {
    if (!child?.pid) {
      return
    }
    if (process.platform === 'win32') {
      if (closed) {
        return
      }
      const systemRoot = process.env.SystemRoot
      if (!systemRoot) {
        cleanupErrors.push(errorRecord('taskkill', new Error('SystemRoot 缺失，无法确认自有子进程树清理')))
        child.kill(signal)
        return
      }
      cleanupTasks.push(new Promise((resolve) => {
        let finished = false
        const finish = (error) => {
          if (finished) {
            return
          }
          finished = true
          if (error) {
            cleanupErrors.push(errorRecord('taskkill', error))
          }
          resolve()
        }
        try {
          const killer = spawn(path.join(systemRoot, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true,
            timeout: 2000,
          })
          killer.once('error', finish)
          killer.once('close', code => finish(code && !closed ? new Error(`taskkill exit ${code}`) : undefined))
        }
        catch (error) {
          finish(error)
        }
      }))
      return
    }
    try {
      process.kill(-child.pid, signal)
    }
    catch (error) {
      if (error.code !== 'ESRCH') {
        cleanupErrors.push(errorRecord('kill-owned-group', error))
      }
    }
  }
  const ownedGroupExists = () => {
    try {
      process.kill(-child.pid, 0)
      return true
    }
    catch (error) {
      if (error.code === 'ESRCH') {
        return false
      }
      cleanupErrors.push(errorRecord('probe-owned-group', error))
      return null
    }
  }
  const confirmOwnedGroupClosed = async () => {
    if (!child?.pid || process.platform === 'win32') {
      return
    }
    let exists = ownedGroupExists()
    if (exists === false) {
      return
    }
    if (exists === null) {
      ownedGroupCloseConfirmed = false
      return
    }
    if (!terminating) {
      recordFailure('cleanup-owned-group', new Error('主进程已关闭，但自建进程组仍有成员'))
      terminating = true
      terminationStartedAt = Date.now()
      stopOwnedTree('SIGTERM')
    }
    // 主进程 close 不代表同组后代退出；保留宽限期后检查并清理自己创建的组。
    const graceRemaining = Math.max(0, terminationStartedAt + 1000 - Date.now())
    if (graceRemaining) {
      await new Promise(resolve => setTimeout(resolve, graceRemaining))
    }
    exists = ownedGroupExists()
    if (exists === true) {
      stopOwnedTree('SIGKILL')
    }
    const deadline = Date.now() + 4000
    while (exists === true && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50))
      exists = ownedGroupExists()
    }
    ownedGroupCloseConfirmed = exists === false
    if (!ownedGroupCloseConfirmed) {
      cleanupErrors.push(errorRecord('cleanup-unconfirmed', new Error('自建进程组仍存在或关闭状态无法确认')))
    }
  }
  const fail = (stage, error) => {
    recordFailure(stage, error)
    if (!child || terminating || closed) {
      return
    }
    terminating = true
    terminationStartedAt = Date.now()
    stopOwnedTree('SIGTERM')
    hardKill = setTimeout(stopOwnedTree, 1000, 'SIGKILL')
    unresolvedClose = setTimeout(() => {
      cleanupErrors.push(errorRecord('cleanup-unconfirmed', new Error('任务子进程树关闭状态未确认')))
      child.stdout?.destroy()
      child.stderr?.destroy()
      child.unref()
      finishProcess?.({
        exitCode: child.exitCode ?? null,
        signal: child.signalCode ?? null,
        closeConfirmed: false,
      })
    }, 6000)
  }
  let stdout
  let stderr
  try {
    stdout = logSink(path.join(output, 'stdout.log'), fail)
    stderr = logSink(path.join(output, 'stderr.log'), fail)
  }
  catch (error) {
    recordFailure('log-open', error)
    const logs = [stdout, stderr].filter(Boolean).map(sink => sink.close())
    return {
      firstFailure,
      cleanupErrors,
      logs,
      pid: null,
      exitCode: null,
      signal: null,
      closeConfirmed: true,
    }
  }
  const command = ['--cpu-prof', `--cpu-prof-dir=${output}`, '--require', preload, runner, 'build', '--type', 'weapp']
  const startedAt = new Date().toISOString()
  let timer
  let monitor
  let result
  try {
    child = spawn(process.execPath, command, {
      cwd,
      detached: process.platform !== 'win32',
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CI: '1',
        HUSKY: '0',
        LEFTHOOK: '0',
        WEAPP_TW_HMR_TIMING: '1',
        WEAPP_TW_HMR_TIMING_LOG: '0',
        TARO_BUILD_STRICT: '1',
        WEAPP_TW_TARO_DIAG_IDENTITY: JSON.stringify(identity),
      },
    })
    // 子进程一旦存在，所有控制器异常都复用这一个 close 收尾。
    completion = new Promise((resolve) => {
      finishProcess = resolve
      child.once('error', error => fail('spawn', error))
      child.once('close', (exitCode, signal) => {
        closed = true
        resolve({
          exitCode,
          signal,
          closeConfirmed: true,
        })
      })
    })
    child.stdout.on('data', chunk => stdout.consume(chunk))
    child.stdout.on('error', error => fail('stdout-read', error))
    child.stderr.on('data', chunk => stderr.consume(chunk))
    child.stderr.on('error', error => fail('stderr-read', error))
    timer = setTimeout(() => fail('timeout', new Error(`Taro CPU 构建超过 ${timeoutMs}ms`)), timeoutMs)
    monitor = setInterval(() => {
      try {
        artifactBytes(output)
      }
      catch (error) {
        fail('artifact-limit', error)
      }
    }, 200)
    result = await completion
  }
  catch (error) {
    fail('controller', error)
    if (completion) {
      result = await completion
    }
  }
  finally {
    if (result?.exitCode !== 0) {
      recordFailure('build-exit', new Error(`Taro 构建退出 ${result?.exitCode}, signal=${result?.signal}`))
    }
    clearTimeout(timer)
    clearInterval(monitor)
    clearTimeout(hardKill)
    clearTimeout(unresolvedClose)
    await confirmOwnedGroupClosed()
    await Promise.allSettled(cleanupTasks)
  }
  const logs = {
    stdout: stdout.close(),
    stderr: stderr.close(),
  }
  try {
    artifactBytes(output)
  }
  catch (error) {
    recordFailure('artifact-limit', error)
  }
  return {
    command: {
      executable: process.execPath,
      args: command,
      cwd,
    },
    pid: child?.pid ?? null,
    startedAt,
    closedAt: new Date().toISOString(),
    ...result,
    ownedGroupCloseConfirmed,
    firstFailure,
    cleanupErrors,
    logs,
  }
}
