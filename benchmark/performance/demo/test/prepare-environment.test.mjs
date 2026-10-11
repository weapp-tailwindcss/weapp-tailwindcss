import { expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { capture, platformEnvironmentKeys } from '../capture.cjs'
import { withCapturedEnvironment } from '../prepare-environment.mjs'

it('捕获 CLI 平台环境并重放，失败也恢复原环境且不记录凭据', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cost-environment-'))
  const before = { ...process.env }
  try {
    process.env.WEAPP_DEMO_COST_CAPTURE = path.join(directory, 'options.jsonl')
    process.env.TARO_ENV = 'h5'
    process.env.COST_SECRET_TOKEN = 'must-not-record'
    delete process.env.UNI_PLATFORM
    capture('weapp-tailwindcss/vite', 'WeappTailwindcss', value => value)({ generator: { target: 'web' } })
    const source = await readFile(process.env.WEAPP_DEMO_COST_CAPTURE, 'utf8')
    expect(source).not.toContain('must-not-record')
    const records = [JSON.parse(source)]
    expect(records[0].value.environment.TARO_ENV).toBe('h5')
    process.env.TARO_ENV = 'weapp'
    process.env.UNI_PLATFORM = 'mp-weixin'
    await expect(withCapturedEnvironment(records, async () => {
      expect(process.env.TARO_ENV).toBe('h5')
      expect(process.env.UNI_PLATFORM).toBeUndefined()
      throw new Error('生成失败')
    })).rejects.toThrow('生成失败')
    expect(process.env.TARO_ENV).toBe('weapp')
    expect(process.env.UNI_PLATFORM).toBe('mp-weixin')
  }
  finally {
    for (const key of [...platformEnvironmentKeys, 'WEAPP_DEMO_COST_CAPTURE', 'COST_SECRET_TOKEN']) {
      if (before[key] === undefined) delete process.env[key]
      else process.env[key] = before[key]
    }
    await rm(directory, { recursive: true, force: true })
  }
})

it('缺失或混合平台身份时拒绝建立静态基线', async () => {
  await expect(withCapturedEnvironment([{ key: 'options', value: {} }], () => {})).rejects.toThrow('缺少平台环境')
  const environment = Object.fromEntries(platformEnvironmentKeys.map(key => [key, null]))
  await expect(withCapturedEnvironment([{ key: 'options', value: { environment } }, { key: 'options', value: { environment: { ...environment, TARO_ENV: 'h5' } } }], () => {})).rejects.toThrow('不同的平台环境')
})
