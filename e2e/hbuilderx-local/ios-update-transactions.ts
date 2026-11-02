import { stripVTControlCharacters } from 'node:util'

interface CompileTransaction {
  started: number
  compiled?: number
  syncing?: number
  completed?: number
}

interface CompletedTransfer {
  started: number
  compiled: number
  synced: number
}

/** 按日志事件归属编译与传输；无变化只能结束编译，不能替代本轮真实传输。 */
export function createIosUpdateTransactions() {
  const events = /开始差量编译|开始编译|编译成功|正在同步手机端程序文件|同步手机端程序文件成功|本次代码变更，编译结果未发生变化，跳过同步手机端程序文件/g
  const cursors = { stdout: 0, stderr: 0 }
  const transactions: CompileTransaction[] = []
  let ordinal = 0
  let unownedEvent = 0
  let transfer: CompletedTransfer | undefined

  return {
    update(stream: 'stdout' | 'stderr', output: string) {
      const text = stripVTControlCharacters(output)
      // 每个流保留各自的未完成消息，事件次序以消息实际接收完成为准。
      events.lastIndex = cursors[stream]
      for (let match = events.exec(text); match; match = events.exec(text)) {
        cursors[stream] = events.lastIndex
        const current = ++ordinal
        const event = match[0]
        if (event === '开始差量编译' || event === '开始编译') {
          transactions.push({ started: current })
          continue
        }
        const compiling = transactions.find(item => item.compiled === undefined && item.completed === undefined)
        if (event === '编译成功') {
          if (compiling) {
            compiling.compiled = current
          }
          else {
            unownedEvent = current
          }
        }
        else if (event.startsWith('本次代码变更')) {
          if (compiling) {
            compiling.completed = current
          }
          else {
            unownedEvent = current
          }
        }
        else if (event === '正在同步手机端程序文件') {
          const waiting = transactions.find(item => item.compiled !== undefined && item.syncing === undefined && item.completed === undefined)
          if (waiting) {
            waiting.syncing = current
          }
          else {
            unownedEvent = current
          }
        }
        else {
          // 新编译可以早于旧传输结束；同步完成必须交还已编译的旧事务。
          const waiting = transactions.find(item => item.syncing !== undefined && item.completed === undefined)
            ?? transactions.find(item => item.compiled !== undefined && item.completed === undefined)
          if (waiting?.compiled !== undefined) {
            waiting.completed = current
            transfer = { started: waiting.started, compiled: waiting.compiled, synced: current }
          }
          else {
            unownedEvent = current
          }
        }
      }
    },
    read() {
      const latest = transactions.at(-1)
      if (!latest || !transfer || unownedEvent > transfer.synced || transactions.some(item => item.completed === undefined)) {
        return undefined
      }
      // 身份同时绑定真实传输与最新编译，无变化事务也必须重新获取设备证据。
      return `ios-update:${transfer.started}:${transfer.compiled}:${transfer.synced}:${latest.started}:${latest.completed}`
    },
  }
}
