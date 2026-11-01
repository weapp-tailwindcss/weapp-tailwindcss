import type { ArchivedJsEngine } from './js-engines'

export interface PerEngineStats {
  iter: number
  samples: number[]
  median: number
  mean: number
  p95: number
}

export interface PerFileResult {
  id: string
  engines: Record<string, PerEngineStats>
}

export interface BenchSnapshot {
  version: 1
  meta: {
    date: string
    commit?: string
    engines: ArchivedJsEngine[]
    iter: number
    warmup: number
    glob: string | string[]
  }
  files: PerFileResult[]
}

export function toSnapshot(
  engines: ArchivedJsEngine[],
  iter: number,
  warmup: number,
  glob: string | string[],
  files: PerFileResult[],
): BenchSnapshot {
  return {
    version: 1,
    meta: {
      date: new Date().toISOString(),
      engines,
      iter,
      warmup,
      glob,
    },
    files,
  }
}

function ratio(a: number, b: number) {
  if (b <= 0) {
    return 0
  }
  return a / b
}

function percent(deltaRatio: number) {
  return `${(deltaRatio * 100).toFixed(1)}%`
}

export function compareToBabel(files: PerFileResult[]) {
  const rows: Array<{
    file: string
    swcVsBabel?: string | undefined
    oxcVsBabel?: string | undefined
  }> = []
  for (const f of files) {
    const babel = f.engines['babel']?.median
    const swc = f.engines['swc']?.median
    const oxc = f.engines['oxc']?.median
    rows.push({
      file: f.id,
      swcVsBabel: (typeof swc === 'number' && typeof babel === 'number') ? percent(1 - ratio(swc, babel)) : undefined,
      oxcVsBabel: (typeof oxc === 'number' && typeof babel === 'number') ? percent(1 - ratio(oxc, babel)) : undefined,
    })
  }
  return rows
}

export function diffSnapshots(curr: BenchSnapshot, base: BenchSnapshot) {
  const baseMap = new Map(base.files.map(f => [f.id, f]))
  const deltas: Array<{
    file: string
    engine: string
    base: number
    curr: number
    deltaMs: number
    deltaPct: string
  }> = []
  for (const f of curr.files) {
    const old = baseMap.get(f.id)
    if (!old) {
      continue
    }
    for (const [engine, stats] of Object.entries(f.engines)) {
      const prev = old.engines[engine]
      if (!prev) {
        continue
      }
      const baseMed = prev.median
      const currMed = stats.median
      const d = currMed - baseMed
      const pct = baseMed > 0 ? (d / baseMed) : 0
      deltas.push({
        file: f.id,
        engine,
        base: baseMed,
        curr: currMed,
        deltaMs: d,
        deltaPct: percent(pct),
      })
    }
  }
  deltas.sort((a, b) => Math.abs(b.deltaMs) - Math.abs(a.deltaMs))
  return deltas
}
