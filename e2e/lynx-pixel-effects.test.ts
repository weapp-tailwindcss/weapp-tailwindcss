import { expect, it } from 'vitest'
import { effectFixtureImage } from './lynx/fixtures/effect-images'
import { evaluatePixelEffect } from './lynx/pixel-effects'
import { PNG } from './lynx/png'

async function frames(id: string) {
  return Promise.all(['probe', 'control'].map(async frame => PNG.sync.read((await effectFixtureImage(id, frame))!)))
}

function gradientImage(scale: number, kind: 'expected' | 'reverse' | 'bands' | 'control' = 'expected') {
  const image = new PNG({ width: 160 * scale, height: 160 * scale })
  const colors = [[2, 132, 199], [34, 197, 94], [250, 204, 21]]
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      let color = [247, 250, 251]
      const logicalX = (x + 0.5) / scale
      const logicalY = (y + 0.5) / scale
      if (logicalX >= 12 && logicalX < 148 && logicalY >= 12 && logicalY < 74) {
        let fraction = (logicalX - 12) / 136
        if (kind === 'reverse') {
          fraction = 1 - fraction
        }
        const segment = fraction < 0.5 ? 0 : 1
        const local = fraction * 2 - segment
        color = kind === 'bands' ? colors[Math.min(2, Math.floor(fraction * 3))]! : colors[segment]!.map((value, index) => Math.round(value * (1 - local) + colors[segment + 1]![index]! * local))
        if (kind === 'control') {
          color = [15 + 233 * fraction, 23 + 227 * fraction, 42 + 210 * fraction]
        }
        if (logicalX >= 20 && logicalX < 32) {
          if (logicalY >= 38 && logicalY < 50) {
            color = [250, 204, 21]
          }
          if (logicalY >= 54 && logicalY < 66) {
            color = [239, 68, 68]
          }
        }
      }
      image.data.set([...color, 255], (y * image.width + x) * 4)
    }
  }
  return image
}

it.each(['background-linear-gradient', 'effect-shadow'])('真实 Android 的 %s 图片有差异但没有效果', async (id) => {
  const [probe, control] = await frames(id)
  expect(evaluatePixelEffect(id, probe!, control!)).toMatchObject({ status: 'unsupported', failureStage: 'runtime' })
})

it.each([1, 2.625, 3])('接收 %s 倍画布中的预期连续渐变，不要求端点色出现在内缩采样位置', async (scale) => {
  const control = gradientImage(scale, 'control')
  expect(evaluatePixelEffect('background-linear-gradient', gradientImage(scale), control)?.status).toBe('supported')
})

it.each(['reverse', 'bands'] as const)('拒绝含有三个正确颜色但为 %s 的图', async (kind) => {
  const [, control] = await frames('background-linear-gradient')
  expect(evaluatePixelEffect('background-linear-gradient', gradientImage(2.625, kind), control!)?.status).toBe('unsupported')
})

it('灰色默认渐变、装饰子节点和一个正确像素不能冒充彩色渐变', async () => {
  const [probe, control] = await frames('background-linear-gradient')
  expect(evaluatePixelEffect('background-linear-gradient', control!, control!)?.status).toBe('unsupported')
  probe!.data.set([34, 197, 94, 255], (40 * probe!.width + 210) * 4)
  expect(evaluatePixelEffect('background-linear-gradient', probe!, control!)?.status).toBe('unsupported')
})

it('阴影必须在主体外部呈中性黑色并向远处衰减', async () => {
  const [probe, control] = await frames('effect-shadow')
  const scale = probe!.width / 160
  const shade = (kind: 'black' | 'red' | 'constant' | 'hard') => {
    const image = PNG.sync.read(PNG.sync.write(probe!))
    for (let y = Math.ceil(58 * scale); y < image.height; y++) {
      const distance = y / scale - 58
      const opacity = kind === 'constant' ? 0.06 : kind === 'hard' ? (distance < 16 ? 0.06 : 0) : Math.max(0, 0.08 * (1 - distance / 24))
      for (let x = Math.ceil(12 * scale); x < Math.floor(148 * scale); x++) {
        const color = [247, 250, 251].map((channel, index) => Math.round(channel * (1 - opacity) + (kind === 'red' && index === 0 ? 255 : 0) * opacity))
        image.data.set([...color, 255], (y * image.width + x) * 4)
      }
    }
    return image
  }
  expect(evaluatePixelEffect('effect-shadow', shade('black'), control!)?.status).toBe('supported')
  expect(evaluatePixelEffect('effect-shadow', shade('red'), control!)?.status).toBe('unsupported')
  expect(() => evaluatePixelEffect('effect-shadow', shade('constant'), control!)).toThrow('夹具')
  expect(evaluatePixelEffect('effect-shadow', shade('hard'), control!)?.status).toBe('unsupported')
  expect(evaluatePixelEffect('effect-shadow', control!, control!)?.status).toBe('unsupported')
})

it('缺失主体、损坏对照、透明画布和错误尺寸属于无效证据', async () => {
  const [probe, control] = await frames('effect-shadow')
  const missing = new PNG({ width: 420, height: 420 })
  missing.data.fill(255)
  expect(() => evaluatePixelEffect('effect-shadow', missing, control!)).toThrow('夹具缺失')
  expect(() => evaluatePixelEffect('effect-shadow', probe!, missing)).toThrow('夹具缺失')
  expect(() => evaluatePixelEffect('effect-shadow', new PNG({ width: 160, height: 80 }), control!)).toThrow('画布')
  const [gradient, grey] = await frames('background-linear-gradient')
  for (let offset = 0; offset < gradient!.data.length; offset += 4) {
    gradient!.data.set([247, 250, 251, 255], offset)
  }
  expect(() => evaluatePixelEffect('background-linear-gradient', gradient!, grey!)).toThrow('夹具')
  gradient!.data.fill(0)
  expect(() => evaluatePixelEffect('background-linear-gradient', gradient!, grey!)).toThrow('不透明')
  expect(() => evaluatePixelEffect('background-linear-gradient', grey!, probe!)).toThrow('control')
})
