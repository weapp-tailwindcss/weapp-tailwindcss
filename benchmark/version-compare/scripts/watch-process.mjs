import process from 'node:process'

export function assertWatchRunning(child, message, logs) {
  if (child.exitCode != null || child.signalCode != null) {
    const signal = child.signalCode == null ? '' : ` signal=${child.signalCode}`
    throw new Error(`${message} code=${child.exitCode}${signal}\n${logs.slice(-120).join('\n')}`)
  }
}

export function stopChild(child) {
  return new Promise((resolve) => {
    if (child.exitCode != null || child.signalCode != null) {
      resolve()
      return
    }

    let done = false
    let terminateTimer
    let killTimer
    const finish = () => {
      if (done) {
        return
      }
      done = true
      clearTimeout(terminateTimer)
      clearTimeout(killTimer)
      resolve()
    }
    const signal = (name) => {
      if (done) {
        return
      }
      try {
        if (child.pid && process.platform !== 'win32') {
          process.kill(-child.pid, name)
        }
        else {
          child.kill(name)
        }
      }
      catch {}
    }

    child.once('close', finish)
    signal('SIGINT')
    // 测试替身或嵌入式启动器可能在发送信号时同步关闭。
    if (done) {
      return
    }
    terminateTimer = setTimeout(signal, 1200, 'SIGTERM')
    killTimer = setTimeout(() => {
      signal('SIGKILL')
      finish()
    }, 4000)
  })
}
