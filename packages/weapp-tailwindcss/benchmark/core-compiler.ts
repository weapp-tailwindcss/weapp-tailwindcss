import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { createCompiler, createContext } from '../src/core'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from '../src/generator'

const sourceCss = `
@theme default {
  --spacing: 0.25rem;
}
@tailwind utilities;
`
const candidates = ['mb-[1.5rem]', 'mt-[8px]', 'w-[10px]']
const template = '<view class="mb-[1.5rem] mt-[8px] w-[10px]" />'
const script = 'const value = "mb-[1.5rem] mt-[8px] w-[10px]"'

interface Statistics {
  median: number
  p95: number
}

function percentile(sorted: readonly number[], ratio: number) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]!
}

function statistics(samples: number[]): Statistics {
  const sorted = [...samples].sort((left, right) => left - right)
  return {
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  }
}

async function sample(iterations: number, task: (iteration: number) => Promise<void>) {
  const samples: number[] = []
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const start = performance.now()
    await task(iteration)
    samples.push(performance.now() - start)
  }
  return statistics(samples)
}

async function samplePair(
  iterations: number,
  left: (iteration: number) => Promise<void>,
  right: (iteration: number) => Promise<void>,
) {
  const leftSamples: number[] = []
  const rightSamples: number[] = []
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const tasks = iteration % 2 === 0 ? [left, right] : [right, left]
    const samples = iteration % 2 === 0 ? [leftSamples, rightSamples] : [rightSamples, leftSamples]
    for (let index = 0; index < tasks.length; index += 1) {
      const start = performance.now()
      await tasks[index]!(iteration)
      samples[index]!.push(performance.now() - start)
    }
  }
  return [statistics(leftSamples), statistics(rightSamples)] as const
}

function improvement(previous: number, current: number) {
  return (previous - current) / previous
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}

async function main() {
  const source = await resolveTailwindV4Source({ base: process.cwd(), css: sourceCss })
  const context = createContext()
  const generator = createWeappTailwindcssGenerator(source)
  const compiler = createCompiler()
  const oldTransaction = async (iteration: number) => {
    const generated = await generator.generate({
      candidates,
      incrementalCache: true,
      scanSources: false,
      target: 'web',
    })
    await context.transformWxss(generated.css)
    await context.transformWxml(`${template}<!-- ${iteration % 2} -->`, { runtimeSet: generated.classSet })
    await context.transformJs(`${script};${iteration % 2}`, { runtimeSet: generated.classSet })
  }
  const compilerTransaction = async (iteration: number) => {
    const generated = await compiler.generate({
      candidates,
      id: 'benchmark:root',
      scanSources: false,
      source,
      target: 'web',
    })
    await compiler.transformCss(generated.css, generated.snapshot)
    await compiler.transformTemplate(`${template}<!-- ${iteration % 2} -->`, generated.snapshot)
    await compiler.transformJavaScript(`${script};${iteration % 2}`, generated.snapshot)
  }

  await oldTransaction(0)
  await compilerTransaction(0)
  globalThis.gc?.()
  const [oldWarm, compilerWarm] = await samplePair(200, oldTransaction, compilerTransaction)

  const oldCold = await sample(8, async (iteration) => {
    const coldContext = createContext({ cache: false })
    const coldGenerator = createWeappTailwindcssGenerator(source)
    const generated = await coldGenerator.generate({ candidates, scanSources: false, target: 'web' })
    await coldContext.transformWxss(generated.css)
    await coldContext.transformWxml(`${template}<!-- ${iteration} -->`, { runtimeSet: generated.classSet })
    await coldContext.transformJs(`${script};${iteration}`, { runtimeSet: generated.classSet })
    coldGenerator.dispose?.()
  })
  const compilerCold = await sample(8, async (iteration) => {
    const coldCompiler = createCompiler({ cache: false })
    const generated = await coldCompiler.generate({
      candidates,
      id: `benchmark:cold:${iteration}`,
      scanSources: false,
      source,
      target: 'web',
    })
    await coldCompiler.transformCss(generated.css, generated.snapshot)
    await coldCompiler.transformTemplate(`${template}<!-- ${iteration} -->`, generated.snapshot)
    await coldCompiler.transformJavaScript(`${script};${iteration}`, generated.snapshot)
    await coldCompiler.dispose()
  })

  globalThis.gc?.()
  const heapBefore = process.memoryUsage().heapUsed
  for (let iteration = 0; iteration < 160; iteration += 1) {
    await compiler.generate({
      candidates: [...candidates, `w-[${iteration % 12 + 11}px]`],
      id: 'benchmark:memory',
      scanSources: false,
      source,
    })
  }
  await compiler.remove('benchmark:memory')
  globalThis.gc?.()
  const heapDeltaMb = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024

  const report = {
    cold: {
      compiler: { medianMs: round(compilerCold.median), p95Ms: round(compilerCold.p95) },
      manual: { medianMs: round(oldCold.median), p95Ms: round(oldCold.p95) },
      regression: round((compilerCold.median - oldCold.median) / oldCold.median),
    },
    heapDeltaMb: round(heapDeltaMb),
    warm: {
      compiler: { medianMs: round(compilerWarm.median), p95Ms: round(compilerWarm.p95) },
      improvement: {
        median: round(improvement(oldWarm.median, compilerWarm.median)),
        p95: round(improvement(oldWarm.p95, compilerWarm.p95)),
      },
      manual: { medianMs: round(oldWarm.median), p95Ms: round(oldWarm.p95) },
    },
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

  generator.dispose?.()
  await compiler.dispose()
}

main().catch((error) => {
  process.stderr.write(`[core-compiler benchmark] failed: ${String(error)}\n`)
  process.exitCode = 1
})
