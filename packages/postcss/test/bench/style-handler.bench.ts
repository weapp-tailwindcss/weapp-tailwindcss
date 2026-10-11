import fs from 'fs-extra'
import path from 'pathe'
import { test } from 'vitest'
import { createStyleHandler } from '@/index'

const v4Code = fs.readFileSync(path.resolve(__dirname, '../fixtures/css/v4.1.2.css'), 'utf8')
const rpxCode = `
.border-_b10rpx_B { border-style: var(--tw-border-style); border-color: 10rpx; }
.text-_b32rpx_B { color: 32rpx; }
.bg-_b10rpx_B { background-color: 10rpx; }
.outline-_b5rpx_B { outline-color: 5rpx; }
.ring-_b8rpx_B { --tw-ring-color: 8rpx; }
`

const v4Handler = createStyleHandler({ isMainChunk: true })
const rpxHandler = createStyleHandler({ isMainChunk: true })

test('style handler benchmark', async ({ bench }) => {
  await bench.compare(
    bench('tailwind v4 main chunk', async () => {
      await v4Handler(v4Code, {
        isMainChunk: true,
        majorVersion: 4,
      })
    }),
    bench('rpx arbitrary value normalization', async () => {
      await rpxHandler(rpxCode, {
        isMainChunk: true,
      })
    }),
  )
})
