/** 浏览器内绘制屏障，独立序列化，不依赖模块闭包。 */
export async function waitForFrameProgress({ after = -1, timeoutMs = 5_000, timeOrigin }: { after?: number, timeoutMs?: number, timeOrigin?: number } = {}): Promise<number[]> {
  if (timeOrigin !== undefined && performance.timeOrigin !== timeOrigin) {
    throw new Error('绘制屏障的文档已变化')
  }
  const frames: number[] = []
  return new Promise((resolve, reject) => {
    let pending: number | undefined
    const timer = setTimeout(() => {
      observer.finish(new Error(`绘制帧未在 ${timeoutMs}ms 预算内严格前进`))
    }, timeoutMs)
    const observer = {
      settled: false,
      finish(error?: unknown) {
        if (observer.settled) {
          return
        }
        observer.settled = true
        clearTimeout(timer)
        if (pending !== undefined) {
          cancelAnimationFrame(pending)
        }
        if (error) {
          reject(error)
        }
        else {
          resolve(frames)
        }
      },
      schedule() {
        try {
          pending = requestAnimationFrame(time => observer.tick(time))
        }
        catch (error) {
          observer.finish(error)
        }
      },
      tick(time: number) {
        if (observer.settled) {
          return
        }
        pending = undefined
        if (Number.isFinite(time) && time > (frames.at(-1) ?? after)) {
          frames.push(time)
        }
        if (frames.length === 2) {
          observer.finish()
        }
        else {
          observer.schedule()
        }
      },
    }
    observer.schedule()
  })
}
