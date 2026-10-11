import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { closeSync, openSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { stripVTControlCharacters } from 'node:util'
import { chromium } from 'playwright'

assert.ok(['win32', 'darwin'].includes(process.platform))
assert.ok(process.env.GITHUB_ACTIONS === 'true' || process.env.E2E_HBUILDERX_VANILLA === '1')
const repeats = process.env.GITHUB_ACTIONS === 'true' ? 8 : 1
const cli = process.env.HBUILDERX_CLI_PATH
assert.ok(cli)
const artifacts = path.resolve('e2e', '.artifacts', 'issue-hbuilderx-windows', 'vanilla')
const root = await mkdtemp(path.join(tmpdir(), '原生项目 & CLI-'))
const aliases = await mkdtemp(path.join(tmpdir(), '原生别名 & CLI-'))
await mkdir(artifacts, { recursive: true })
await mkdir(path.join(root, 'pages', 'index'), { recursive: true })
await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ 'name': 'vanilla-cli-boundary', 'appid': '__UNI__WTCLITEST', 'versionName': '1.0.0', 'versionCode': '100', 'uni-app-x': {}, 'vueVersion': '3' }))
await writeFile(path.join(root, 'pages.json'), JSON.stringify({ pages: [{ path: 'pages/index/index' }], globalStyle: { navigationBarTitleText: 'Vanilla CLI boundary' } }))
await writeFile(path.join(root, 'index.html'), '<!DOCTYPE html><html><head><meta charset="UTF-8"><!--preload-links--><!--app-context--></head><body><div id="app"><!--app-html--></div><script type="module" src="/main"></script></body></html>')
await writeFile(path.join(root, 'App.uvue'), '<script>export default { onLaunch() {} }</script>')
await writeFile(path.join(root, 'main.uts'), 'import App from \'./App.uvue\'\nimport { createSSRApp } from \'vue\'\nexport function createApp() { return { app: createSSRApp(App) } }\n')

let sessionIndex = 0
function start(args) {
  const viaPowerShell = process.env.E2E_WINDOWS_CASE === 'vanilla-powershell'
  const executable = viaPowerShell ? 'pwsh.exe' : cli
  const launchArgs = viaPowerShell
    ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.resolve('scripts', 'ci', 'hbuilderx-vanilla-shell.ps1')]
    : args
  const outputFile = process.env.E2E_WINDOWS_CASE === 'vanilla-file'
    ? path.join(artifacts, `native-output-${++sessionIndex}.log`)
    : undefined
  const outputFd = outputFile ? openSync(outputFile, 'w') : undefined
  const stdin = process.env.E2E_WINDOWS_CASE === 'vanilla-stdin' ? 'inherit' : 'ignore'
  const child = spawn(executable, launchArgs, {
    cwd: root,
    stdio: outputFd === undefined ? [stdin, 'pipe', 'pipe'] : [stdin, outputFd, outputFd],
    env: viaPowerShell ? { ...process.env, E2E_HBUILDERX_VANILLA_INVOCATION: JSON.stringify({ executable: cli, args }) } : process.env,
  })
  if (outputFd !== undefined) {
    closeSync(outputFd)
  }
  let output = ''
  for (const stream of [child.stdout, child.stderr].filter(Boolean)) {
    stream.on('data', (chunk) => {
      output += chunk.toString()
    })
  }
  child.on('error', (error) => {
    output += String(error)
  })
  const closed = new Promise(resolve => child.once('close', code => resolve(code)))
  return { child, closed, log: () => outputFile ? readFileSync(outputFile, 'utf8') + output : output }
}

async function stop(session) {
  if (session.child.exitCode === null) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(session.child.pid), '/t', '/f'], { timeout: 5000, windowsHide: true })
    }
    else {
      session.child.kill('SIGTERM')
    }
  }
  await Promise.race([session.closed, delay(5000)])
}

function diagnose(label) {
  if (process.platform !== 'win32') {
    return
  }
  spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('scripts', 'ci', 'issue-hbuilderx-diagnostics.ps1')], {
    env: { ...process.env, E2E_HBUILDERX_DIAGNOSTIC_DIR: path.join(artifacts, label) },
    timeout: 30_000,
  })
}

let commandIndex = 0
async function command(args) {
  const index = ++commandIndex
  const startedAt = Date.now()
  const session = start(args)
  let timeout
  try {
    const code = await Promise.race([session.closed, new Promise((resolve) => {
      timeout = setTimeout(resolve, 20_000, 'timeout')
    })])
    await writeFile(path.join(artifacts, `command-${index}.json`), JSON.stringify({
      args,
      pid: session.child.pid,
      code,
      elapsedMs: Date.now() - startedAt,
      output: session.log(),
    }, null, 2))
    if (code !== 0) {
      // 项目重新打开也可能挂起，必须在终止失败命令前采集原生现场。
      diagnose(`command-${index}-failure`)
    }
    assert.equal(code, 0, `${args.join(' ')}: ${session.log()}`)
    return session.log()
  }
  finally {
    clearTimeout(timeout)
    await stop(session)
  }
}

const hosts = (await command(['listhost'])).trim().split(/\r?\n/).filter(Boolean)
assert.equal(hosts.length, 1)
const hostArgs = ['--host', hosts[0]]
const browser = await chromium.launch()
const page = await browser.newPage()
const results = []
try {
  for (const [mode, iteration] of ['physical', 'junction'].flatMap(mode => Array.from({ length: repeats }, (_, index) => [mode, index + 1]))) {
    const project = mode === 'physical' ? root : path.join(aliases, `project-${iteration}`)
    if (mode === 'junction') {
      await symlink(root, project, process.platform === 'win32' ? 'junction' : 'dir')
    }
    const marker = `vanilla-${mode}-${iteration}`
    await writeFile(path.join(root, 'pages', 'index', 'index.uvue'), `<template><view><text>${marker}</text></view></template><script setup></script><style scoped>view { padding: 10px; }</style>`)
    await command(['project', 'open', '--path', project, ...hostArgs])
    let registered = false
    const registrationDeadline = Date.now() + 20_000
    while (Date.now() < registrationDeadline) {
      const listed = await command(['project', 'list', ...hostArgs])
      if (listed.includes(` - ${path.basename(project)}(`)) {
        registered = true
        break
      }
      await delay(300)
    }
    assert.ok(registered, `项目未注册：${project}`)
    const session = start(['launch', 'web', '--project', project, '--browser', 'Chrome', ...hostArgs])
    const deadline = Date.now() + 120_000
    let loaded = false
    try {
      while (Date.now() < deadline) {
        const url = stripVTControlCharacters(session.log()).match(/http:\/\/(?:localhost|127\.0\.0\.1):\d+\//)?.[0]
        if (url) {
          try {
            await page.goto(url, { timeout: 5000 })
            loaded = (await page.locator('body').textContent()).includes(marker)
            if (loaded) {
              break
            }
          }
          catch { /* 编译器报告地址后等待对应页面真正加载。 */ }
        }
        assert.equal(session.child.exitCode, null, session.log())
        await delay(300)
      }
      results.push({ platform: process.platform, mode, iteration, loaded, project })
      await writeFile(path.join(artifacts, 'results.json'), JSON.stringify(results, null, 2))
      await writeFile(path.join(artifacts, `${mode}-${iteration}.log`), session.log())
      console.log(JSON.stringify(results.at(-1)))
      if (!loaded) {
        diagnose(`${mode}-${iteration}-failure`)
      }
      assert.ok(loaded, '未使用 weapp-tailwindcss 或仓库 runner 的原生项目启动失败')
      await page.screenshot({ path: path.join(artifacts, `${mode}-${iteration}.png`) })
    }
    finally {
      await writeFile(path.join(artifacts, `${mode}-${iteration}.log`), session.log())
      await stop(session)
      await command(['project', 'close', '--path', project, ...hostArgs])
      if (mode === 'junction') {
        await rm(project, { force: true, recursive: true })
      }
    }
  }
}
finally { await browser.close() }
