import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { authoredClasses, authoredCss } from './authored.mjs'
import { cases, commands, repo } from './catalog.mjs'
import { inspectFiles } from './output.mjs'

const demoRequire = createRequire(path.join(repo, 'demo', 'mpx-tailwindcss-v4', 'package.json'))
const cliRequire = createRequire(demoRequire.resolve('@mpxjs/mpx-cli-service/package.json'))
const { getTargets } = cliRequire('@mpxjs/cli-shared-utils')
const minimist = cliRequire('minimist')

it.each(cases.filter(item => item.family === 'mpx'))('$id 的生产与开发命令均由真实 Mpx CLI 解析为目标平台', (item) => {
  const config = commands(item)
  for (const args of [config.build, config.dev]) {
    const parsed = minimist(args.slice(2))
    expect(getTargets(parsed).map(target => target.mode)).toEqual([item.target])
  }
})

it('拒绝用微信模板与样式冒充支付宝产物', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mpx-target-'))
  const item = { ...cases.find(item => item.id === 'style-injector-mpx:wx'), target: 'ali' }
  try {
    const markup = Object.entries(authoredClasses('initial')).map(([key, value]) => `<view id="tw-matrix-${key}" data-tw-matrix="initial" class="${value}">tw-matrix-initial-${key}</view>`).join('')
    await writeFile(path.join(root, 'page.wxml'), markup)
    await writeFile(path.join(root, 'page.wxss'), authoredCss(item, 'initial'))
    await expect(inspectFiles(root, item, 'initial')).rejects.toThrow('expected ali template')
    await rm(path.join(root, 'page.wxml'))
    await rm(path.join(root, 'page.wxss'))
    await writeFile(path.join(root, 'page.axml'), markup)
    await writeFile(path.join(root, 'page.acss'), authoredCss(item, 'initial'))
    await expect(inspectFiles(root, item, 'initial')).resolves.toMatchObject({ platform: 'ali' })
    await writeFile(path.join(root, 'page.acss'), '')
    await writeFile(path.join(root, 'page.wxss'), authoredCss(item, 'initial'))
    await expect(inspectFiles(root, item, 'initial')).rejects.toThrow('missing tw-authored-height-small')
  }
  finally { await rm(root, { recursive: true, force: true }) }
})
