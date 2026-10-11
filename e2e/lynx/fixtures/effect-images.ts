import fs from 'node:fs/promises'
import { PNG } from '../png'
import { darkImage } from './dark-images'
import { skewImage } from './skew-images'
import { structuralImage } from './structural-images'
import { textFlowImage } from './text-flow-images'

/** ce65d0626 的原始 Android 局部图：utility 移除了默认效果，却没有绘制预期效果。 */
export async function effectFixtureImage(id: string, frame: string) {
  if (id === 'type-flow') {
    return PNG.sync.write(textFlowImage(1, frame === 'control' ? 'control' : 'expected'))
  }
  if (id === 'variant-structural') {
    return PNG.sync.write(structuralImage(1, frame === 'control' ? 'plain' : 'expected'))
  }
  if (id === 'variant-dark') {
    return PNG.sync.write(darkImage(1, frame === 'dark-probe' ? 'white' : 'ink'))
  }
  // skew 使用明确的合成图验证协议，不能冒充设备截图。
  if (id === 'transform-skew') {
    return PNG.sync.write(skewImage(1, frame === 'control' ? 'identity' : 'skew'))
  }
  if (id !== 'background-linear-gradient' && id !== 'effect-shadow') {
    return undefined
  }
  return fs.readFile(new URL(`./pixels/${id}-${frame}.png`, import.meta.url))
}
