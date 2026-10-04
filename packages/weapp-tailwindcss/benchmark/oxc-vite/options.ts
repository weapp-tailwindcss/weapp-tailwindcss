import type { BenchmarkMode, Comparison, WorkerOptions } from './types'
import assert from 'node:assert/strict'
import path from 'node:path'
import process from 'node:process'

export function parseOptions(args: string[]) {
  let root = process.cwd()
  let output: string | undefined
  let pairs = 3
  let timeoutMs = 30_000
  let selfCheck = false
  let target: 'web' | 'weapp' = 'web'
  let compare: Comparison = 'transfer'
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!
    if (flag === '--self-check') {
      selfCheck = true
      continue
    }
    assert(['--root', '--output', '--pairs', '--timeout-ms', '--target', '--compare'].includes(flag), `未知参数：${flag}`)
    const value = args[++index]
    assert(value && !value.startsWith('--'), `参数缺少值：${flag}`)
    if (flag === '--root') {
      root = path.resolve(value)
    }
    if (flag === '--output') {
      output = path.resolve(value)
    }
    if (flag === '--pairs') {
      pairs = Number(value)
    }
    if (flag === '--timeout-ms') {
      timeoutMs = Number(value)
    }
    if (flag === '--target') {
      assert(value === 'web' || value === 'weapp', '--target 必须是 web 或 weapp。')
      target = value
    }
    if (flag === '--compare') {
      assert(value === 'transfer' || value === 'native', '--compare 必须是 transfer 或 native。')
      compare = value
    }
  }
  assert(Number.isInteger(pairs) && pairs >= 1 && pairs <= 20, '--pairs 必须是 1–20。')
  assert(Number.isInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 120_000, '--timeout-ms 必须是 1000–120000。')
  return { root: path.resolve(root), output: output ?? path.resolve(root, '.tmp', 'oxc-vite', 'report.json'), pairs, timeoutMs, selfCheck, target, compare }
}

export function comparisonModes(compare: Comparison): readonly BenchmarkMode[] {
  return compare === 'native' ? ['off', 'required'] : ['normal', 'raw']
}

export function pairOrder(pair: number, compare: Comparison = 'transfer') {
  const modes = comparisonModes(compare)
  return pair % 2 === 0 ? modes : [...modes].reverse()
}

export function nativeMode(options: Pick<WorkerOptions, 'compare' | 'mode'>) {
  if (options.compare === 'native') {
    assert(options.mode === 'off' || options.mode === 'required', 'native 对比的 mode 必须为 off/required。')
    return options.mode
  }
  assert(options.mode === 'normal' || options.mode === 'raw', 'transfer 对比的 mode 必须为 normal/raw。')
  return 'off'
}

export function statistics(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  assert(sorted.length > 0, '没有可用于统计的样本。')
  return { samples: values, medianMs: sorted[Math.floor(sorted.length / 2)]!, p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1]! }
}
