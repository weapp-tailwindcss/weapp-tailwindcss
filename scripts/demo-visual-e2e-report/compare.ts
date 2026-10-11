import type { RuntimeContext } from './types.ts'
import fs from 'node:fs'
import path from 'pathe'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

export interface ImageComparison {
  diff: string
  differentPixels: number
  ratio: number
  maxRatio?: number
  withinLimit?: boolean
}

function resizePng(source: PNG, width: number, height: number) {
  if (source.width === width && source.height === height) {
    return source
  }

  const resized = new PNG({ width, height })
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(source.height - 1, Math.floor((y * source.height) / height))
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(source.width - 1, Math.floor((x * source.width) / width))
      const sourceIndex = (sourceY * source.width + sourceX) * 4
      const targetIndex = (y * width + x) * 4
      resized.data[targetIndex] = source.data[sourceIndex]
      resized.data[targetIndex + 1] = source.data[sourceIndex + 1]
      resized.data[targetIndex + 2] = source.data[sourceIndex + 2]
      resized.data[targetIndex + 3] = source.data[sourceIndex + 3]
    }
  }
  return resized
}

export function compareImages(actual: string, expected: string, name: string, context: RuntimeContext): ImageComparison {
  const diff = path.join(context.artifactRoot, 'diffs', `${name}.png`)
  const width = context.viewport.width
  const height = context.viewport.height
  const actualPng = resizePng(PNG.sync.read(fs.readFileSync(actual)), width, height)
  const expectedPng = resizePng(PNG.sync.read(fs.readFileSync(expected)), width, height)
  const diffPng = new PNG({ width, height })
  const differentPixels = pixelmatch(actualPng.data, expectedPng.data, diffPng.data, width, height, {
    threshold: 0.1,
  })
  fs.mkdirSync(path.dirname(diff), { recursive: true })
  fs.writeFileSync(diff, PNG.sync.write(diffPng))
  const ratio = Math.round((differentPixels / (width * height)) * 10000) / 10000
  return {
    diff,
    differentPixels,
    ratio,
    ...(context.maxCrossPlatformDiffRatio === undefined
      ? {}
      : {
          maxRatio: context.maxCrossPlatformDiffRatio,
          withinLimit: ratio <= context.maxCrossPlatformDiffRatio,
        }),
  }
}
