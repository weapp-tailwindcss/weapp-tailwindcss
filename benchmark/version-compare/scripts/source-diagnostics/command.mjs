import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { errorRecord, fileReceipt, limits, readBounded } from './files.mjs'

/** 使用独立进程组和原始日志运行固定 argv，不经过 shell。 */
export async function executeCommand(request) {
  const {
    executable,
    args,
    cwd,
    stdoutFile,
    stderrFile,
    capture = true,
    stdoutLimit = limits.logBytes,
    timeoutMs = 1200000,
  } = request
  let child
  let closed = false
  let stopping = false
  let firstFailure
  const secondaryFailures = []
  let killTimer
  let closeTimer
  let finish
  let completion
  const cleanupErrors = []
  const taskkills = []
  const record = (stage, error) => {
    const item = errorRecord(stage, error)
    if (firstFailure) {
      secondaryFailures.push(item)
    }
    else {
      firstFailure = item
    }
  }
  const kill = (signal) => {
    if (!child?.pid) {
      return
    }
    if (process.platform !== 'win32') {
      try {
        process.kill(-child.pid, signal)
      }
      catch (error) {
        if (error.code !== 'ESRCH') {
          cleanupErrors.push(errorRecord('kill-owned-group', error))
        }
      }
      return
    }
    if (closed) {
      return
    }
    if (!process.env.SystemRoot) {
      cleanupErrors.push(errorRecord('taskkill', new Error('SystemRoot 缺失')))
      child.kill(signal)
      return
    }
    taskkills.push(new Promise((resolve) => {
      const killer = spawn(path.join(process.env.SystemRoot, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], {
        shell: false,
        stdio: 'ignore',
        windowsHide: true,
        timeout: 2000,
      })
      killer.once('error', (error) => {
        cleanupErrors.push(errorRecord('taskkill', error))
        resolve()
      })
      killer.once('close', (code) => {
        if (code) {
          cleanupErrors.push(errorRecord('taskkill', new Error(`taskkill exit ${code}`)))
        }
        resolve()
      })
    }))
  }
  const fail = (stage, error) => {
    record(stage, error)
    if (!child || stopping || closed) {
      return
    }
    stopping = true
    kill('SIGTERM')
    killTimer = setTimeout(kill, 1000, 'SIGKILL')
    closeTimer = setTimeout(() => {
      cleanupErrors.push(errorRecord('cleanup-unconfirmed', new Error('命令关闭状态未确认')))
      child.stdout?.destroy()
      child.stderr?.destroy()
      child.unref()
      finish?.({
        exitCode: child.exitCode,
        signal: child.signalCode,
        closeConfirmed: false,
      })
    }, 6000)
  }
  const descriptors = []
  const sink = (file, maximum) => {
    const descriptor = fs.openSync(file, 'wx')
    descriptors.push(descriptor)
    let bytes = 0
    let incomplete = false
    return (chunk) => {
      bytes += chunk.length
      if (incomplete) {
        return
      }
      if (bytes > maximum) {
        incomplete = true
        fail('log-limit', new Error(`命令输出超过固定上限：${file}`))
        return
      }
      try {
        let offset = 0
        while (offset < chunk.length) {
          const count = fs.writeSync(descriptor, chunk, offset, chunk.length - offset)
          if (!count) {
            throw new Error('原始日志写入未推进')
          }
          offset += count
        }
      }
      catch (error) {
        incomplete = true
        fail('log-write', error)
      }
    }
  }
  let timer
  let result
  const startedAt = new Date().toISOString()
  try {
    const stdout = sink(stdoutFile, stdoutLimit)
    const stderr = sink(stderrFile, limits.logBytes)
    child = spawn(executable, args, {
      cwd,
      shell: false,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...request.environment,
        CI: '1',
        HUSKY: '0',
        LEFTHOOK: '0',
        WEAPP_TW_SKIP_AUTO_BUILD: '1',
        WEAPP_TW_SKIP_INTERACTIVE_TARO_BUILD: '1',
        WEAPP_TW_SKIP_INTERACTIVE_UNI_BUILD: '1',
      },
    })
    completion = new Promise((resolve) => {
      finish = resolve
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
    child.stdout.on('data', stdout)
    child.stderr.on('data', stderr)
    child.stdout.on('error', error => fail('stdout-read', error))
    child.stderr.on('error', error => fail('stderr-read', error))
    timer = setTimeout(() => fail('timeout', new Error(`命令超过 ${timeoutMs}ms`)), timeoutMs)
    result = await completion
    if (result.exitCode !== 0) {
      record('command-exit', new Error(`命令退出 ${result.exitCode}, signal=${result.signal}`))
    }
  }
  catch (error) {
    fail('controller', error)
    if (completion) {
      result = await completion
    }
  }
  finally {
    clearTimeout(timer)
    clearTimeout(killTimer)
    clearTimeout(closeTimer)
    if (child?.pid && process.platform !== 'win32') {
      const exists = () => {
        try {
          process.kill(-child.pid, 0)
          return true
        }
        catch (error) {
          if (error.code === 'ESRCH') {
            return false
          }
          cleanupErrors.push(errorRecord('group-probe', error))
          return null
        }
      }
      if (exists() !== false) {
        record('cleanup-owned-group', new Error('命令主进程关闭后仍有自建组成员'))
        kill('SIGTERM')
        await new Promise(resolve => setTimeout(resolve, 1000))
        if (exists() === true) {
          kill('SIGKILL')
        }
        const deadline = Date.now() + 4000
        let present = exists()
        while (present === true && Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 50))
          present = exists()
        }
        if (present !== false) {
          cleanupErrors.push(errorRecord('cleanup-unconfirmed', new Error('自建进程组未确认消失')))
        }
      }
    }
    await Promise.allSettled(taskkills)
    for (const descriptor of descriptors) {
      try {
        fs.closeSync(descriptor)
      }
      catch (error) {
        cleanupErrors.push(errorRecord('log-close', error))
        record('log-close', error)
      }
    }
  }
  const logs = {}
  for (const [name, file, maximum] of [['stdout', stdoutFile, stdoutLimit], ['stderr', stderrFile, limits.logBytes]]) {
    try {
      logs[name] = await fileReceipt(file, {
        maximum,
        kind: 'command-log',
      })
    }
    catch (error) {
      record('log-receipt', error)
    }
  }
  let stdout
  if (capture && logs.stdout) {
    try {
      stdout = new TextDecoder('utf-8', {
        fatal: true,
      }).decode(await readBounded(stdoutFile, stdoutLimit))
    }
    catch (error) {
      record('stdout-decode', error)
    }
  }
  return {
    executable,
    args,
    cwd,
    startedAt,
    finishedAt: new Date().toISOString(),
    pid: child?.pid ?? null,
    ...result,
    firstFailure,
    secondaryFailures,
    cleanupErrors,
    logs,
    stdout,
  }
}
