import type { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'

export interface PngPixels {
  width: number
  height: number
  data: Buffer
}

// pngjs 是未携带类型声明的 CJS 依赖，在读取边界约束本流程使用的 API。
export const { PNG } = createRequire(import.meta.url)('pngjs') as {
  PNG: {
    new (options: { width: number, height: number }): PngPixels
    sync: {
      read: (input: Buffer) => PngPixels
      write: (image: PngPixels, options?: { deflateLevel: number }) => Buffer
    }
  }
}
