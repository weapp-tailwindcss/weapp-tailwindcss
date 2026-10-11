import type { ColorValue, View } from 'react-native'
import { processColor } from 'react-native'

export interface NativeVisualProbe {
  id: string
  bounds: { x: number, y: number, width: number, height: number }
  rgb: [number, number, number]
}

/** 将原生窗口坐标与当前背景色一起交给截图门禁，避免用 JS 报告代替原生绘制完成。 */
export async function measureVisualProbe(view: View | null, id: string, color: ColorValue | undefined): Promise<NativeVisualProbe> {
  const processed = processColor(color)
  if (!view || typeof processed !== 'number') {
    throw new Error(`Missing native visual probe: ${id}`)
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Native visual probe measurement timed out: ${id}`)), 5_000)
    view.measureInWindow((x, y, width, height) => {
      clearTimeout(timer)
      if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
        reject(new Error(`Invalid native visual probe bounds: ${id}`))
        return
      }
      resolve({ id, bounds: { x, y, width, height }, rgb: [(processed >>> 16) & 255, (processed >>> 8) & 255, processed & 255] })
    })
  })
}
