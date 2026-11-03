import type { ProbeContext } from '../types'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

function projectFiles(ctx: ProbeContext, appid: string): Record<string, string> {
  return {
    'project.config.json': JSON.stringify({ appid, projectname: `preflight-${ctx.runId}`, compileType: 'miniprogram', miniprogramRoot: './', setting: { es6: true } }),
    'app.json': JSON.stringify({ pages: ['pages/probe/index'], window: { navigationBarTitleText: '环境预检' } }),
    'app.js': 'App({})',
    [path.join('pages', 'probe', 'index.js')]: `Page({data:{marker:${JSON.stringify(ctx.runId)},clicked:false},tap(){this.setData({clicked:true})}})`,
    [path.join('pages', 'probe', 'index.json')]: '{}',
    [path.join('pages', 'probe', 'index.wxml')]: '<view id="marker">{{marker}}</view><button id="probe" bindtap="tap">验证</button><view id="result">{{clicked}}</view>',
  }
}

function projectDirectory(ctx: ProbeContext) {
  return path.resolve(ctx.dir, 'wechat-project')
}

/** prepare 只创建一次；已有项目不允许重写，避免触发其编译或热更新。 */
export async function createWechatProbeProject(ctx: ProbeContext, appid: string) {
  const project = projectDirectory(ctx)
  try {
    await mkdir(project)
    await mkdir(path.join(project, 'pages', 'probe'), { recursive: true })
    for (const [name, content] of Object.entries(projectFiles(ctx, appid))) {
      await writeFile(path.join(project, name), content, { flag: 'wx' })
    }
  }
  catch (error) {
    throw new Error(`微信探针项目创建失败，不能覆盖已有文件：${project}`, { cause: error })
  }
}

function jsonObject(source: string, file: string): Record<string, unknown> {
  const value: unknown = JSON.parse(source)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`微信探针项目配置必须是对象：${file}`)
  }
  return value as Record<string, unknown>
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function assertConfigIdentity(config: Record<string, unknown>, expected: Record<string, unknown>, optional = false) {
  for (const key of ['appid', 'compileType', 'miniprogramRoot', ...optional ? [] : ['projectname']]) {
    if ((!optional || config[key] !== undefined) && config[key] !== expected[key]) {
      throw new Error(`微信探针项目配置身份改变：${key}`)
    }
  }
}

/** 只读取全部受控源码；IDE 的编辑器元数据不参与编译身份摘要。 */
export async function inspectWechatProbeProject(ctx: ProbeContext, appid: string) {
  const project = projectDirectory(ctx)
  try {
    const files = projectFiles(ctx, appid)
    const expectedConfig = jsonObject(files['project.config.json']!, 'project.config.json')
    const directories = new Set(['', 'pages', path.join('pages', 'probe')])
    const entries = ['', ...await readdir(project, { recursive: true })].sort()
    for (const name of entries) {
      const info = await lstat(path.join(project, name))
      const expectedDirectory = directories.has(name)
      if (expectedDirectory ? !info.isDirectory() : !info.isFile()) {
        throw new Error(`微信探针项目文件类型改变：${name || project}`)
      }
      if (!expectedDirectory && !Object.hasOwn(files, name) && name !== 'project.private.config.json') {
        throw new Error(`微信探针项目出现未登记文件：${name}`)
      }
    }
    const snapshot: Array<[string, string]> = []
    for (const [name, expected] of Object.entries(files)) {
      const source = await readFile(path.join(project, name), 'utf8')
      if (name === 'project.config.json') {
        const config = jsonObject(source, name)
        assertConfigIdentity(config, expectedConfig)
        const setting = config['setting']
        if (!setting || typeof setting !== 'object' || !('es6' in setting) || setting.es6 !== true) {
          throw new Error('微信探针项目编译配置改变：setting.es6')
        }
        // IDE 可在首次打开时补齐默认配置；成功收尾后封存其编译语义。
        const { editorSetting: _editorSetting, description: _description, ...compileConfig } = config
        snapshot.push([name, stableJson(compileConfig)])
      }
      else {
        if (source !== expected) {
          throw new Error(`微信探针项目源码改变：${name}`)
        }
        snapshot.push([name, source])
      }
    }
    if (entries.includes('project.private.config.json')) {
      const config = jsonObject(await readFile(path.join(project, 'project.private.config.json'), 'utf8'), 'project.private.config.json')
      assertConfigIdentity(config, expectedConfig, true)
    }
    const fixtureSha256 = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
    return { project, fixtureSha256 }
  }
  catch (error) {
    throw new Error(`微信探针项目校验失败，必须重新 prepare：${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

/** verify/live 必须使用 prepare 成功后封存的同一项目，不补写或修复文件。 */
export async function assertWechatProbeProject(ctx: ProbeContext, appid: string) {
  if (ctx.binding?.['project'] !== projectDirectory(ctx) || !/^[a-f0-9]{64}$/.test(ctx.binding?.['fixtureSha256'] ?? '')) {
    throw new Error('微信探针项目缺少本轮已验证的完整来源绑定，必须重新 prepare。')
  }
  const actual = await inspectWechatProbeProject(ctx, appid)
  if (actual.fixtureSha256 !== ctx.binding['fixtureSha256']) {
    throw new Error('微信探针项目与 prepare 封存内容不一致，必须重新 prepare。')
  }
  return actual
}
