/** 每轮回收最多使用原有一秒，调用方的绝对截止只能进一步收紧该窗口。 */
export function createObserverReapWindow() {
  let deadline = Number.POSITIVE_INFINITY
  const waits = new Set<() => void>()
  const assertClosed = (at: number | undefined, error: () => Error) => {
    if (at !== undefined && at >= deadline) {
      throw error()
    }
  }
  return {
    assertClosed,
    constrain(until: number) {
      if (!Number.isFinite(until)) {
        throw new TypeError('身份采集器回收必须绑定有限的绝对截止。')
      }
      if (until >= deadline) {
        return
      }
      deadline = until
      for (const arm of waits) {
        arm()
      }
    },
    async wait(closed: Promise<number>, error: () => Error) {
      const originalDeadline = Date.now() + 1000
      let timer: ReturnType<typeof setTimeout> | undefined
      let arm: (() => void) | undefined
      try {
        const closedAt = await Promise.race([closed, new Promise<never>((_resolve, reject) => {
          arm = () => {
            clearTimeout(timer)
            const remaining = Math.min(originalDeadline, deadline) - Date.now()
            if (remaining <= 0) {
              reject(error())
            }
            else {
              timer = setTimeout(() => reject(error()), remaining)
            }
          }
          waits.add(arm)
          arm()
        })])
        // 事件循环阻塞时 close 可能先于过期计时器派发，必须按接收时刻拒绝迟到关闭。
        assertClosed(closedAt, error)
      }
      finally {
        clearTimeout(timer)
        if (arm) {
          waits.delete(arm)
        }
      }
    },
  }
}
