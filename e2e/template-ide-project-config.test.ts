import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { withTemplateAppId } from './template-ide/project-config'

describe('template IDE AppID override', () => {
  let dir: string
  let file: string
  const original = '{\r\n  "appid": "touristappid", "setting": {"es6": true}\r\n}\r\n'
  const appId = 'wx0123456789abcdef'

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'template-ide-config-'))
    file = path.join(dir, 'project.config.json')
    await writeFile(file, original)
  })
  afterEach(async () => rm(dir, { recursive: true, force: true }))

  it('uses the explicit AppID during execution and restores original bytes afterwards', async () => {
    const result = await withTemplateAppId(file, appId, async () => {
      expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ appid: appId, setting: { es6: true } })
      return 'passed'
    })
    expect(result).toBe('passed')
    expect(await readFile(file, 'utf8')).toBe(original)
  })

  it('restores configuration when launch, assertions or project cleanup fail', async () => {
    const error = new Error('IDE failed')
    await expect(withTemplateAppId(file, appId, async () => {
      throw error
    })).rejects.toBe(error)
    expect(await readFile(file, 'utf8')).toBe(original)
  })

  it('leaves the project unchanged without an explicit override', async () => {
    await withTemplateAppId(file, undefined, async () => {
      expect(await readFile(file, 'utf8')).toBe(original)
    })
  })

  it.each(['', 'touristappid', 'invalid'])('rejects invalid override %j before launching', async (value) => {
    let launched = false
    await expect(withTemplateAppId(file, value, async () => {
      launched = true
    })).rejects.toThrow('AppID')
    expect(launched).toBe(false)
    expect(await readFile(file, 'utf8')).toBe(original)
  })

  it('preserves concurrent edits and reports the ownership conflict', async () => {
    const external = '{"appid":"wx1111111111111111"}'
    await expect(withTemplateAppId(file, appId, async () => {
      await writeFile(file, external)
    })).rejects.toThrow('配置已被修改')
    expect(await readFile(file, 'utf8')).toBe(external)
  })

  it('执行失败与恢复冲突同时保留，且不覆盖其他写入', async () => {
    const primary = new Error('auto HTTP 500')
    const external = '{"appid":"wx1111111111111111"}'
    const error = await withTemplateAppId(file, appId, async () => {
      await writeFile(file, external)
      throw primary
    }).catch(error => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.cause).toBe(primary)
    expect(error.errors[0]).toBe(primary)
    expect(error.errors[1].message).toContain('配置已被修改')
    expect(await readFile(file, 'utf8')).toBe(external)
  })
})
