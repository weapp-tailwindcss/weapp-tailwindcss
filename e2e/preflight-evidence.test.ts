import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { validateComputerUse } from '../scripts/e2e-preflight/computer-use'
import { assertIdentity, samePath } from '../scripts/e2e-preflight/io'
import { computerEvidence, fixtureSession } from './preflight-fixture'

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})
async function setup() {
  const fixture = await fixtureSession()
  dirs.push(fixture.dir)
  return { ...fixture, evidence: await computerEvidence(fixture.session) }
}

describe('computer use 证据与身份', () => {
  it('有效工具证据必须同时包含服务端交互回执', async () => {
    const { dir, report, session } = await setup()
    await expect(validateComputerUse(report, dir, session.interactionAt)).resolves.toHaveProperty('files')
    await expect(validateComputerUse(report, dir)).rejects.toThrow('交互回执')
  })

  it.each(['discover', 'read', 'screenshot', 'input', 'click', 'verify'])('缺少 %s 不得放行', async (action) => {
    const { evidence, dir, report, session } = await setup()
    evidence.observations = evidence.observations.filter(item => item.action !== action)
    await writeFile(path.join(dir, 'computer-use.json'), JSON.stringify(evidence))
    await expect(validateComputerUse(report, dir, session.interactionAt)).rejects.toThrow('缺少实际工具调用')
  })

  it('拒绝历史图片、其他运行、空图片和手写 passed', async () => {
    const { dir, report, session, evidence } = await setup()
    const file = path.join(dir, 'computer-use.json')
    await writeFile(file, JSON.stringify({ passed: true }))
    await expect(validateComputerUse(report, dir, session.interactionAt)).rejects.toThrow()
    await writeFile(file, JSON.stringify({ ...evidence, runId: 'old-run' }))
    await expect(validateComputerUse(report, dir, session.interactionAt)).rejects.toThrow()
    await writeFile(file, JSON.stringify({ ...evidence, observedAt: new Date(0).toISOString() }))
    await expect(validateComputerUse(report, dir, session.interactionAt)).rejects.toThrow()
    await writeFile(file, JSON.stringify(evidence))
    await writeFile(path.join(dir, evidence.screenshot), '')
    await expect(validateComputerUse(report, dir, session.interactionAt)).rejects.toThrow()
  })

  it('证据不能越界读取其他目录', async () => {
    const { dir, report, session, evidence } = await setup()
    evidence.screenshot = '../outside.png'
    await writeFile(path.join(dir, 'computer-use.json'), JSON.stringify(evidence))
    await expect(validateComputerUse(report, dir, session.interactionAt)).rejects.toThrow()
  })

  it('再次验证失败会清除之前的就绪结果', async () => {
    const { session, report, dir } = await setup()
    await session.verify(report.identity)
    expect(report.status).toBe('ready')
    await rm(path.join(dir, 'computer-use.json'))
    await expect(session.verify(report.identity)).rejects.toThrow()
    expect(report.status).toBe('blocked')
    expect(JSON.parse(await readFile(session.file, 'utf8')).verifiedAt).toBeUndefined()
  })

  it.each([
    ['/work/中文 & 空格/repo', '/work/中文 & 空格/repo', 'linux', true],
    ['C:\\work\\中文 & 空格\\repo', 'C:\\work\\中文 & 空格\\repo', 'win32', true],
    ['C:\\work\\repo', 'D:\\work\\repo', 'win32', false],
    ['C:\\work\\repo', '\\work\\repo', 'win32', false],
    ['C:\\work\\repo', 'work\\repo', 'win32', false],
    ['/work/repo', 'work/repo', 'linux', false],
  ] as const)('路径身份 %s / %s', (a, b, platform, expected) => {
    expect(samePath(a, b, platform)).toBe(expected)
  })

  it('SHA、源码、主机及工具配置改变均使报告失效', async () => {
    const { report } = await setup()
    for (const [key, value] of Object.entries({ head: 'new', source: 'changed', host: 'another', config: { device: 'other' } })) {
      expect(() => assertIdentity(report.identity, { ...report.identity, [key]: value })).toThrow('已变化')
      expect(() => assertIdentity(report.identity, { ...report.identity, [key]: value })).toThrow(`变化字段：${key}。`)
    }
  })
})
