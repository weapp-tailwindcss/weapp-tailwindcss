import fs from 'node:fs/promises'
import { requiresPixelEffect } from '../../../examples/react-lynx/src/compatibility/evidence'

/** ce65d0626 的原始 Android 局部图：utility 移除了默认效果，却没有绘制预期效果。 */
export async function effectFixtureImage(id: string, frame: string) {
  if (!requiresPixelEffect(id)) {
    return undefined
  }
  return fs.readFile(new URL(`./pixels/${id}-${frame}.png`, import.meta.url))
}
