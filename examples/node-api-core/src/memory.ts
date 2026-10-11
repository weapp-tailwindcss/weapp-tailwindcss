import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createCompiler } from 'weapp-tailwindcss/core'
import { memoryClassMatrix } from './fixtures'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const cssEntry = fileURLToPath(new URL('./app.css', import.meta.url))

export interface MemorySample {
  heapUsedMb: number
  iteration: number
  rssMb: number
}

export interface MemoryResult {
  deltaHeapUsedMb: number
  first: MemorySample
  last: MemorySample
  maxHeapUsedMb: number
  samples: MemorySample[]
}

function toMb(bytes: number) {
  return Math.round(bytes / 1024 / 1024)
}

function sampleMemory(iteration: number): MemorySample {
  globalThis.gc?.()
  const memory = process.memoryUsage()
  return {
    heapUsedMb: toMb(memory.heapUsed),
    iteration,
    rssMb: toMb(memory.rss),
  }
}

function createSources(iteration: number) {
  const [textClass, bgClass] = memoryClassMatrix[(iteration - 1) % memoryClassMatrix.length]!
  const textSize = textClass.match(/\[(\d+)px\]/)?.[1] ?? '20'
  const bgColor = bgClass.match(/\[#([0-9a-f]+)\]/)?.[1] ?? '000001'

  return {
    js: `const classes = ["mb-[1.5rem]", "${textClass}", "${bgClass}"]`,
    wxml: `<view class="mt-[8px] ${textClass} ${bgClass}"></view>`,
    candidates: ['mb-[1.5rem]', 'mt-[8px]', `text-[${textSize}px]`, `bg-[#${bgColor}]`],
  }
}

export async function runMemoryDemo(options: {
  heapBudgetMb?: number
  iterations?: number
} = {}): Promise<MemoryResult> {
  const iterations = options.iterations ?? 160
  const heapBudgetMb = options.heapBudgetMb ?? 96
  const compiler = createCompiler({
    appType: 'native',
  })
  const sourceOptions = {
    cssEntries: [cssEntry],
    projectRoot,
  }
  const rootId = 'memory:main-style'
  const samples: MemorySample[] = []

  samples.push(sampleMemory(0))
  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const source = createSources(iteration)
    const generated = await compiler.generate({
      candidates: source.candidates,
      id: rootId,
      scanSources: false,
      sourceOptions,
      target: 'web',
    })
    await compiler.transformTemplate(source.wxml, generated.snapshot)
    await compiler.transformJavaScript(source.js, generated.snapshot)
    await compiler.transformCss(generated.css, generated.snapshot, {
      isMainChunk: true,
    })
    if (iteration % 20 === 0) {
      samples.push(sampleMemory(iteration))
    }
  }
  await compiler.remove(rootId)
  await compiler.dispose()
  samples.push(sampleMemory(iterations))

  const first = samples[0]!
  const last = samples[samples.length - 1]!
  const maxHeapUsedMb = Math.max(...samples.map(sample => sample.heapUsedMb))
  const deltaHeapUsedMb = maxHeapUsedMb - first.heapUsedMb
  if (typeof globalThis.gc === 'function' && deltaHeapUsedMb > heapBudgetMb) {
    throw new Error(`Node API compiler heap 增长超出预算: ${deltaHeapUsedMb}MB > ${heapBudgetMb}MB`)
  }

  return {
    deltaHeapUsedMb,
    first,
    last,
    maxHeapUsedMb,
    samples,
  }
}

async function main() {
  const result = await runMemoryDemo()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main()
}
