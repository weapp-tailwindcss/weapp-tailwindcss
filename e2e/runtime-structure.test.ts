import type { RuntimeStructureSample } from './hbuilderx-local/runtime-structure'
import { Buffer } from 'node:buffer'
import { ChildProcess } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createRuntimeStructureProbe, hasRuntimeStructureMarker, observeRuntimeStructure, readRuntimeStructureSample } from './hbuilderx-local/runtime-structure'

function sample(): RuntimeStructureSample {
  const marker = { id: 'native-hmr-probe', tagName: 'VIEW', text: '本轮 } "文字', rect: { left: 0, top: 64, width: 173, height: 41 } }
  return { schemaVersion: 1, runId: 'current-run', adapter: 'uni-app-x-element', sequence: 1, instanceId: 'instance-1', token: 'step-token', pixelRatio: 3, markerCount: 1, marker, nodes: [marker] }
}
const line = (value: unknown, runId = 'current-run') => `12:00 WT_RUNTIME_STRUCTURE_${runId}=${JSON.stringify(value)} at C:\\项目\\page.uvue:12\n`

describe('独立运行时结构传输', () => {
  it('绑定当前run，支持文字内JSON符号与日志路径后缀', () => {
    expect(readRuntimeStructureSample(line(sample()), 'current-run')).toEqual(sample())
    expect(readRuntimeStructureSample(line(sample(), 'old-run'), 'current-run')).toBeUndefined()
    expect(hasRuntimeStructureMarker(sample(), 'current-run', sample().marker.text, 'step-token')).toBe(true)
    expect(hasRuntimeStructureMarker(sample(), 'current-run', '旧步骤', 'step-token')).toBe(false)
    expect(hasRuntimeStructureMarker(sample(), 'current-run', sample().marker.text, 'old-token')).toBe(false)
  })

  it.each([
    { runId: 'old-run' },
    { schemaVersion: 0 },
    { sequence: 0 },
    { sequence: 1.5 },
    { pixelRatio: 0 },
    { markerCount: -1 },
    { nodes: [null] },
    { marker: { ...sample().marker, rect: { left: 0, top: 0, width: -1, height: 4 } } },
  ])('拒绝当前run的不完整或非法结构 %j', (change) => {
    expect(() => readRuntimeStructureSample(line({ ...sample(), ...change }), 'current-run')).toThrow()
  })

  it('真实节点错误和损坏协议必须阻断，不能当作暂未就绪', () => {
    expect(() => readRuntimeStructureSample(line({ runId: 'current-run', error: 'UniElement API failed' }), 'current-run')).toThrow('UniElement API failed')
    expect(() => readRuntimeStructureSample('WT_RUNTIME_STRUCTURE_current-run={broken', 'current-run')).toThrow('无效 JSON')
    const value = sample()
    value.nodes = []
    expect(hasRuntimeStructureMarker(value, 'current-run', value.marker.text, 'step-token')).toBe(false)
  })

  it('按完整UTF8行处理跨chunk数据；接收序号跨原生reload递增且释放订阅', () => {
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const child = Object.assign(new ChildProcess(), { stdout, stderr })
    const before = stdout.listenerCount('data')
    const observer = observeRuntimeStructure(child, 'current-run', 'uni-app-x-element')
    const data = Buffer.from(line(sample()))
    const split = data.indexOf(Buffer.from('本')) + 1
    stdout.write(data.subarray(0, split))
    expect(observer.read()).toBeUndefined()
    stdout.write(data.subarray(split))
    expect(observer.read()).toMatchObject({ ordinal: 1, sample: sample() })
    stderr.write(line({ ...sample(), instanceId: 'reload-instance', sequence: 1 }))
    expect(observer.read()?.ordinal).toBe(2)
    for (let index = 0; index < 50; index++) {
      stdout.write('unrelated log\n')
    }
    expect(observer.read()?.ordinal).toBe(2)
    observer.dispose()
    expect(stdout.listenerCount('data')).toBe(before)
    stdout.write(line(sample()))
    expect(observer.read()?.ordinal).toBe(2)
  })

  it('同实例重复或倒序序号不刷新接收代次，旧实例日志重放也不能假冒新采样', () => {
    const stdout = new PassThrough()
    const observer = observeRuntimeStructure({ stdout, stderr: null }, 'current-run', 'uni-app-x-element')
    try {
      stdout.write(line({ ...sample(), sequence: 10 }))
      stdout.write(line({ ...sample(), sequence: 10 }))
      stdout.write(line({ ...sample(), sequence: 9 }))
      expect(observer.read()?.ordinal).toBe(1)
      stdout.write(line({ ...sample(), instanceId: 'new-instance' }))
      expect(observer.read()?.ordinal).toBe(2)
      stdout.write(line({ ...sample(), sequence: 10 }))
      expect(observer.read()?.ordinal).toBe(2)
    }
    finally { observer.dispose() }
  })

  it('当前run错误持续阻断，后来的正常样本不能抹掉首次错误', () => {
    const stdout = new PassThrough()
    const observer = observeRuntimeStructure({ stdout, stderr: null }, 'current-run', 'uni-app-x-element')
    try {
      stdout.write(line({ ...sample(), adapter: 'uni-app-renderjs' }))
      stdout.write(line(sample()))
      expect(observer.read).toThrow('适配器')
    }
    finally { observer.dispose() }
  })

  it.each([
    ['components/BindClass.uvue', 'uni.getElementById'],
    ['C:\\项目\\components\\BindClass.uvue', 'uni.getElementById'],
    ['/pages/index.vue', 'lang="renderjs"'],
    ['C:\\pages\\index.vue', 'lang="renderjs"'],
    ['index.vue', 'lang="renderjs"'],
  ])('适配器只看文件类型，兼容路径 %s', (file, expected) => {
    const probe = createRuntimeStructureProbe(file)
    expect(probe.inject('<template><view/></template><script>export default {}</script>')).toContain(expected)
    expect(probe.runId).not.toBe(createRuntimeStructureProbe(file).runId)
  })
})
