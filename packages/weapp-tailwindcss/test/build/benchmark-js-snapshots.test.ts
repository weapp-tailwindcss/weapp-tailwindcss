import type { BenchSnapshot } from '../../../../tools/weapp-tailwindcss-scripts/src/benchmark/js-snapshots'
import { describe, expect, it } from 'vitest'
import { compareToBabel, diffSnapshots, toSnapshot } from '../../../../tools/weapp-tailwindcss-scripts/src/benchmark/js-snapshots'

describe('历史 JS 基准快照域', () => {
  it('保留 version1 SWC 数据、相对比率和同键差异', () => {
    const archived: BenchSnapshot = JSON.parse(`{
      "version": 1,
      "meta": {"date":"2025-01-01T00:00:00.000Z","engines":["babel","swc","oxc"],"iter":1,"warmup":0,"glob":"archived.js"},
      "files": [{"id":"archived.js","engines":{
        "babel":{"iter":1,"samples":[4],"median":4,"mean":4,"p95":4},
        "swc":{"iter":1,"samples":[2],"median":2,"mean":2,"p95":2},
        "oxc":{"iter":1,"samples":[3],"median":3,"mean":3,"p95":3}
      }}]
    }`)
    const before = JSON.stringify(archived)
    expect(compareToBabel(archived.files)).toEqual([{
      file: 'archived.js',
      swcVsBabel: '50.0%',
      oxcVsBabel: '25.0%',
    }])
    const current = structuredClone(archived)
    current.files[0]!.engines['swc'] = { iter: 1, samples: [3], median: 3, mean: 3, p95: 3 }
    expect(diffSnapshots(current, archived).filter(row => row.engine === 'swc')).toEqual([{
      file: 'archived.js',
      engine: 'swc',
      base: 2,
      curr: 3,
      deltaMs: 1,
      deltaPct: '50.0%',
    }])
    expect(JSON.stringify(archived)).toBe(before)
    expect(toSnapshot(archived.meta.engines, 1, 0, archived.meta.glob, archived.files).meta.engines).toEqual(['babel', 'swc', 'oxc'])
  })

  it('缺失比较侧仍保留显式 undefined 字段和原零基线策略', () => {
    const files = [{ id: 'only-babel.js', engines: { babel: { iter: 1, samples: [0], median: 0, mean: 0, p95: 0 } } }]
    const row = compareToBabel(files)[0]!
    expect(Object.keys(row)).toEqual(['file', 'swcVsBabel', 'oxcVsBabel'])
    expect(row.swcVsBabel).toBeUndefined()
    expect(row.oxcVsBabel).toBeUndefined()
    expect(diffSnapshots(toSnapshot(['babel'], 1, 0, '*.js', files), toSnapshot(['babel'], 1, 0, '*.js', files))[0]?.deltaPct).toBe('0.0%')
  })
})
