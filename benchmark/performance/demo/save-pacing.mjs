import { setTimeout } from 'node:timers/promises'

// Chokidar 的 change/remove 去重窗口为 50/100 ms；观察到上次结果后再等待，三组口径一致。
// 该间隔只约束下一次输入，不用于判断 HMR 成功，也不计入保存到生效耗时。
export const interSaveQuietMs = 150

export function createSavePacer() {
  let settledAt = performance.now()
  return {
    settled() { settledAt = performance.now() },
    async beforeSave() {
      while (performance.now() - settledAt < interSaveQuietMs) {
        await setTimeout(Math.max(1, interSaveQuietMs - (performance.now() - settledAt)))
      }
    },
  }
}
