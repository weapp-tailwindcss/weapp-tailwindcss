import { Buffer } from 'node:buffer'
import { spawn, spawnSync } from 'node:child_process'
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { version as osVersion, release, tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

if (process.platform !== 'win32') {
  throw new Error('该入口用于真实 Windows HBuilderX 验证，不能用平台模拟代替。')
}
const version = process.env.HBUILDERX_VERSION
if (!['5.24.2026081301', '5.25.2026082902-alpha'].includes(version)) {
  throw new Error(`未登记的 HBuilderX 验证版本：${version}`)
}
const artifactRoot = path.resolve('e2e', '.artifacts', 'issue-hbuilderx-windows')
const installRoot = path.join(process.env.RUNNER_TEMP ?? tmpdir(), `issue-hbuilderx-${version}`)
const directory = version.includes('alpha') ? 'HBuilderX-Alpha' : 'HBuilderX'
const cli = path.join(installRoot, directory, 'cli.exe')
await mkdir(artifactRoot, { recursive: true })

async function exists(file) {
  return readFile(file).then(() => true, () => false)
}

async function command(executable, args, name, timeout = 120_000) {
  const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      output += chunk.toString()
      process.stdout.write(chunk)
    })
  }
  let timer
  try {
    const exit = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
      timer = setTimeout(() => {
        // 初始化也可能卡在原生请求；终止前采集会话和线程，保留原始超时结果。
        if (executable === cli) {
          const diagnostic = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('scripts', 'ci', 'issue-hbuilderx-diagnostics.ps1')], {
            env: { ...process.env, HBUILDERX_CLI_PATH: cli, E2E_HBUILDERX_DIAGNOSTIC_DIR: path.join(artifactRoot, `${name}-failure`) },
            timeout: 30_000,
            windowsHide: true,
          })
          output += `\n初始化诊断状态：${JSON.stringify({ status: diagnostic.status, signal: diagnostic.signal, error: diagnostic.error?.message })}\n`
        }
        spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, timeout: 5000 })
        reject(new Error(`${name} 超过 ${timeout}ms`))
      }, timeout)
    })
    if (exit !== 0) {
      throw new Error(`${name} 退出码 ${exit}`)
    }
    return output
  }
  finally {
    clearTimeout(timer)
    await writeFile(path.join(artifactRoot, `${name}.log`), output)
  }
}

const url = `https://download1.dcloud.net.cn/download/HBuilderX.${version}.zip`
if (!await exists(cli)) {
  await mkdir(installRoot, { recursive: true })
  const zip = path.join(installRoot, 'official.zip')
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) })
  if (!response.ok) {
    throw new Error(`官方安装包下载失败：${response.status} ${url}`)
  }
  await writeFile(zip, Buffer.from(await response.arrayBuffer()))
  await command('7z', ['x', zip, `-o${installRoot}`, '-y'], 'extract')
  if (directory !== 'HBuilderX') {
    await rename(path.join(installRoot, 'HBuilderX'), path.join(installRoot, directory))
  }
}
if (process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Windows IDE 初始化入口仅用于独立 GitHub runner')
}
await command(cli, ['open'], 'open')
let actualVersion = ''
for (let attempt = 0; attempt < 30; attempt++) {
  actualVersion = await command(cli, ['version'], 'version')
  if (actualVersion.includes(version)) {
    break
  }
  await delay(1000)
}
if (!actualVersion.includes(version)) {
  throw new Error(`Windows IDE 版本不匹配：${actualVersion}`)
}
await command('powershell.exe', [
  '-NoLogo',
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  path.resolve('scripts', 'ci', 'hbuilderx-first-run.ps1'),
  '-Executable',
  path.join(installRoot, directory, 'HBuilderX.exe'),
  '-ArtifactRoot',
  path.join(artifactRoot, 'first-run'),
], 'first-run', 60_000)
// version 由原生 CLI 提供，返回时插件宿主可能尚未注册安装命令。
await delay(5000)
for (const plugin of ['uniapp-cli-vite', 'uniappx-launcher', 'compile-dart-sass', 'chrome-base']) {
  let output = ''
  for (let attempt = 0; attempt < 30; attempt++) {
    output = await command(cli, ['installPlugin', '--name', plugin], `install-${plugin}-${attempt}`, 600_000)
    if (!/does not exist|当前命令执行错误/.test(output)) {
      break
    }
    await delay(1000)
  }
  if (/does not exist|当前命令执行错误|安装失败/.test(output)) {
    throw new Error(`插件安装未完成：${plugin}\n${output}`)
  }
  JSON.parse(await readFile(path.join(installRoot, directory, 'plugins', plugin, 'package.json'), 'utf8'))
}
const plugins = path.join(installRoot, directory, 'plugins')
const compilerNode = await command(path.join(plugins, 'node', 'node.exe'), ['--version'], 'compiler-node')
const vite = JSON.parse(await readFile(path.join(plugins, 'uniapp-cli-vite', 'node_modules', 'vite', 'package.json'), 'utf8'))
await writeFile(path.join(artifactRoot, 'identity.json'), JSON.stringify({
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  os: osVersion(),
  release: release(),
  compilerNode: compilerNode.trim(),
  vite: vite.version,
  version: actualVersion,
  cli,
  url,
  revision: process.env.GITHUB_SHA,
}, null, 2))
if (process.env.GITHUB_ENV) {
  await appendFile(process.env.GITHUB_ENV, `HBUILDERX_CLI_PATH=${cli}\n`)
}
console.log(`Windows HBuilderX ${version} 已准备：${cli}`)
