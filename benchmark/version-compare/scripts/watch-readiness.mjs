import { stripVTControlCharacters } from 'node:util'

const defaultReadyLogRE = /compiled successfully|built in [\d.]+m?s?|Build complete|Watching for changes|ready in \d+/i

function matchesReadyLog(line, watchReadyLog) {
  if (typeof watchReadyLog === 'string') {
    return line.includes(watchReadyLog)
  }
  if (watchReadyLog instanceof RegExp) {
    watchReadyLog.lastIndex = 0
    return watchReadyLog.test(line)
  }
  return defaultReadyLogRE.test(line)
}

export function isWatchReady({
  logs,
  outputExists,
  outputMtime,
  initialOutputMtime,
  outputHasContent,
  watchReadyLog,
}) {
  if (!outputExists || !outputHasContent) {
    return false
  }

  if (watchReadyLog !== undefined) {
    return logs.some(line => matchesReadyLog(line, watchReadyLog))
  }

  return outputMtime > initialOutputMtime || logs.some(line => matchesReadyLog(line))
}

/** 仅本次操作内的开始和完成日志可以证明生产者已经提交产物。 */
export function isWatchBuildComplete(logs, watchBuildLogs) {
  if (!watchBuildLogs) {
    return true
  }
  let started = false
  let complete = false
  for (const line of logs) {
    const text = stripVTControlCharacters(line)
    if (matchesReadyLog(text, watchBuildLogs.start)) {
      started = true
      complete = false
    }
    else if (started && matchesReadyLog(text, watchBuildLogs.complete)) {
      complete = true
    }
  }
  return complete
}
