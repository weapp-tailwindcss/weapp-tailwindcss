import type { StyleProcessingPipeline } from '@/pipeline'
import fs from 'fs-extra'
import path from 'pathe'
import postcss from 'postcss'
import { probeFeatures } from '@/content-probe'
import { createStyleHandler } from '@/index'
import { createStylePipeline } from '@/pipeline'

const v4Code = fs.readFileSync(path.resolve(__dirname, '../fixtures/css/v4.1.2.css'), 'utf8')

/** 不含任何现代特征的简单 CSS */
const simpleCode = `
.container { display: flex; padding: 16px; margin: 8px; }
.text-red { color: red; }
.bg-white { background-color: #fff; }
.border { border: 1px solid #ccc; }
.hidden { display: none; }
.flex { display: flex; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.w-full { width: 100%; }
.h-screen { height: 100vh; }
.p-4 { padding: 16px; }
.m-2 { margin: 8px; }
.rounded { border-radius: 4px; }
.shadow { box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
.font-bold { font-weight: 700; }
.text-lg { font-size: 18px; }
.leading-6 { line-height: 24px; }
.tracking-wide { letter-spacing: 0.05em; }
.overflow-hidden { overflow: hidden; }
.relative { position: relative; }
`

const rpxCode = `
.border-_b10rpx_B { border-style: var(--tw-border-style); border-color: 10rpx; }
.text-_b32rpx_B { color: 32rpx; }
.bg-_b10rpx_B { background-color: 10rpx; }
.outline-_b5rpx_B { outline-color: 5rpx; }
.ring-_b8rpx_B { --tw-ring-color: 8rpx; }
`

const baseOptions = { isMainChunk: true }

// 预计算信号
const v4Signal = probeFeatures(v4Code)
const simpleSignal = probeFeatures(simpleCode)
const rpxSignal = probeFeatures(rpxCode)

function requireFlat(pipeline: StyleProcessingPipeline) {
  if (pipeline.kind !== 'flat') {
    throw new Error('Expected a flat pruning benchmark pipeline')
  }
  return pipeline
}

// 预构建 pipeline 和 processor
const fullPipeline = requireFlat(createStylePipeline(baseOptions as any))
const fullProcessor = postcss(fullPipeline.plugins)

const v4Pipeline = requireFlat(createStylePipeline({ ...baseOptions } as any, v4Signal))
const _v4Processor = postcss(v4Pipeline.plugins)

const simplePipeline = requireFlat(createStylePipeline({ ...baseOptions } as any, simpleSignal))
const simpleProcessor = postcss(simplePipeline.plugins)

const rpxPipeline = requireFlat(createStylePipeline({ ...baseOptions } as any, rpxSignal))
const rpxProcessor = postcss(rpxPipeline.plugins)

it('pipeline pruning benchmark - 信号探测开销', async ({ bench: benchmark }) => {
  await benchmark.compare(
    benchmark('probeFeatures: v4 CSS (198 行)', () => {
      probeFeatures(v4Code)
    }),
    benchmark('probeFeatures: 简单 CSS (20 行)', () => {
      probeFeatures(simpleCode)
    }),
    benchmark('probeFeatures: rpx CSS (5 行)', () => {
      probeFeatures(rpxCode)
    }),
  )
})

it('pipeline pruning benchmark - 插件数量对比', async ({ bench: benchmark }) => {
  await benchmark.compare(
    benchmark(`完整流水线 (${fullPipeline.plugins.length} 插件) - 简单 CSS`, async () => {
      await fullProcessor.process(simpleCode, { from: undefined })
    }),
    benchmark(`裁剪流水线 (${simplePipeline.plugins.length} 插件) - 简单 CSS`, async () => {
      await simpleProcessor.process(simpleCode, { from: undefined })
    }),
    benchmark(`完整流水线 (${fullPipeline.plugins.length} 插件) - rpx CSS`, async () => {
      await fullProcessor.process(rpxCode, { from: undefined })
    }),
    benchmark(`裁剪流水线 (${rpxPipeline.plugins.length} 插件) - rpx CSS`, async () => {
      await rpxProcessor.process(rpxCode, { from: undefined })
    }),
  )
})

it('pipeline pruning benchmark - 端到端 handler 对比', async ({ bench: benchmark }) => {
  const handler = createStyleHandler({ isMainChunk: true })

  await benchmark.compare(
    benchmark('handler: v4 CSS (含现代特征)', async () => {
      await handler(v4Code, { isMainChunk: true, majorVersion: 4 })
    }),
    benchmark('handler: 简单 CSS (无现代特征)', async () => {
      await handler(simpleCode, { isMainChunk: true })
    }),
    benchmark('handler: rpx CSS (无现代特征)', async () => {
      await handler(rpxCode, { isMainChunk: true })
    }),
  )
})
