import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { captureMiniProgramScreenshot } from '../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { resolveWechatAppId } from '../scripts/wechat-app-id'
import { closeWechatProject } from '../scripts/wechat-project-cleanup'
import { Launcher } from '../scripts/wechat/automator'
import { existingWechatService } from '../scripts/wechat/service'

async function main() {
  const marker = randomUUID()
  const runRoot = path.resolve('e2e', '.artifacts', 'skyline-typography-native', marker)
  const project = path.join(runRoot, 'project')
  const globalReset = process.env.SKYLINE_GLOBAL_RESET === '1'
  await mkdir(project, { recursive: true })
  await mkdir(runRoot, { recursive: true })
  const save = async (name: string, value: unknown) => writeFile(path.join(runRoot, name), JSON.stringify(value, null, 2))
  async function write(name: string, value: string | object) {
    const file = path.join(project, name)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2))
  }
  const cases = ['initial', 'cycle', 'missing', 'empty', 'valid', 'literal-initial', 'literal-cycle', 'theme', 'reference']
  const globalRule = globalReset ? 'view,text{--tw-leading:var(--tw-leading);--tw-font-weight:var(--tw-font-weight)}\n' : ''
  const sheet = `${globalRule}page{--text-header-md:20px;--text-header-md--line-height:32px;--text-header-md--font-weight:500;background:#fff;color:#111;padding:12px;box-sizing:border-box}
  .label{font-size:11px;line-height:16px;color:#444}
  .sample{display:block;white-space:pre-wrap;width:280px;font-size:20px;line-height:var(--tw-leading,var(--text-header-md--line-height));font-weight:var(--tw-font-weight,var(--text-header-md--font-weight))}
  .initial,.literal-initial{--tw-leading:initial;--tw-font-weight:initial}
  .cycle,.literal-cycle{--tw-leading:var(--tw-leading);--tw-font-weight:var(--tw-font-weight)}
  .empty{--tw-leading: ;--tw-font-weight: }
  .valid{--tw-leading:44px;--tw-font-weight:700}
  .literal-initial,.literal-cycle{line-height:var(--tw-leading,32px);font-weight:var(--tw-font-weight,500)}
  .theme{line-height:var(--text-header-md--line-height);font-weight:var(--text-header-md--font-weight)}
  .reference{line-height:32px;font-weight:500}
  `
  await write('app.js', 'App({})')
  await write('app.json', {
    pages: ['pages/webview/index', 'pages/skyline/index'],
    componentFramework: 'glass-easel',
    lazyCodeLoading: 'requiredComponents',
    rendererOptions: { skyline: { defaultDisplayBlock: true, disableABTest: true } },
    window: { navigationStyle: 'custom' },
  })
  await write('project.config.json', {
    appid: resolveWechatAppId(),
    projectname: 'skyline-typography-probe',
    compileType: 'miniprogram',
    miniprogramRoot: './',
    libVersion: '3.10.3',
    setting: { urlCheck: false, es6: true, skylineRenderEnable: true },
  })
  await write('app.wxss', sheet)
  for (const renderer of ['webview', 'skyline']) {
    await write(path.join('pages', renderer, 'index.json'), { renderer })
    await write(path.join('pages', renderer, 'index.js'), `Page({data:{marker:${JSON.stringify(marker)},sample:'第一行 Aa\\n第二行 Bb',overrideStyle:''}})`)
    await write(path.join('pages', renderer, 'index.wxml'), `<view id="marker" class="label">${renderer} {{marker}}</view>${cases.map(id => `<view class="label">${id}</view><text id="${id}" class="sample ${id}" style="{{overrideStyle}}">{{sample}}</text>`).join('')}`)
  }
  const service = await existingWechatService()
  console.log(JSON.stringify({ runRoot, project, service, marker, globalReset }))
  const results: unknown[] = []
  let mini: Awaited<ReturnType<Launcher['launch']>> | undefined
  let failed: unknown
  try {
    mini = await new Launcher().launch({ projectPath: project, cliPath: service.command, runtimeProvider: 'devtools', timeout: 90_000 })
    await save('environment.json', { service, system: await mini.systemInfo(), tool: await mini.toolInfo(), marker, globalReset, cssSha256: createHash('sha256').update(sheet).digest('hex') })
    for (const renderer of ['webview', 'skyline']) {
      const page = await mini.reLaunch(`/pages/${renderer}/index`)
      await page.waitForRendered({ selector: '#marker', timeout: 10_000 })
      const identity = await mini.evaluate('function(){var p=getCurrentPages();var page=p[p.length-1];return {route:page.route,renderer:page.renderer,appRenderer:typeof __wxConfig!=="undefined"?__wxConfig.renderer:null}}')
      await save(`${renderer}-identity.json`, identity)
      if (identity.renderer !== renderer) {
        throw new Error(`renderer 不匹配：请求 ${renderer}，实际 ${identity.renderer}`)
      }
      for (const [phase, overrideStyle] of [['default', ''], ['override', '--tw-leading:44px;--tw-font-weight:700'], ['restored', '']]) {
        await page.setData({ overrideStyle })
        const observations = await mini.evaluate(`function(ids){return new Promise(function(resolve){
          var query=wx.createSelectorQuery();
          ids.forEach(function(id){query.select('#'+id).fields({id:true,rect:true,size:true,computedStyle:['line-height','font-weight']});});
          query.exec(resolve);
        });}`, cases)
        const evidence = { renderer, identity, phase, observations }
        results.push(evidence)
        await save('evidence.json', results)
        console.log(JSON.stringify(evidence))
        if (phase === 'default') {
          await captureMiniProgramScreenshot(mini, path.join(runRoot, `${renderer}.png`), 10_000)
        }
      }
    }
  }
  catch (error) {
    failed = error
    await save('failure.json', { error: String(error), stack: error instanceof Error ? error.stack : undefined, results })
  }
  finally {
    if (mini) {
      try {
        await closeWechatProject(project, mini)
        await save('cleanup.json', { closed: true, project })
      }
      catch (error) {
        await save('cleanup.json', { closed: false, project, error: String(error) })
        failed = failed ? new AggregateError([failed, error], '原生复现与项目清理失败') : error
      }
    }
  }
  if (failed) {
    throw failed
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
