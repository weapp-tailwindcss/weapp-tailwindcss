import process from 'node:process'
import { execa } from 'execa'
import { closeWechatProject } from '../wechat-project-cleanup.ts'
import { Launcher } from '../wechat/automator'
import { findFreePort } from './process.ts'

export function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function readNumberEnv(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

export function parseWechatDevToolsWindowBounds(value: string) {
  const bounds = value.trim().split(',').map(part => Number(part.trim()))
  if (bounds.length !== 4 || bounds.some(part => !Number.isFinite(part) || part < 0)) {
    throw new Error(`无法解析微信开发者工具窗口边界: ${value}`)
  }
  const [left, top, width, height] = bounds
  if (width === 0 || height === 0) {
    throw new Error(`微信开发者工具窗口尺寸无效: ${value}`)
  }
  return `${left},${top},${width},${height}`
}

export async function captureWechatDevToolsWindow(screenshot: string) {
  if (process.platform !== 'darwin') {
    throw new Error('微信开发者工具窗口截图当前仅支持 macOS')
  }
  const script = [
    'tell application "System Events"',
    'set targetProcess to first application process whose name contains "wechatwebdevtools"',
    'set frontmost of targetProcess to true',
    'tell targetProcess',
    'set windowPosition to position of front window',
    'set windowSize to size of front window',
    'end tell',
    'return (item 1 of windowPosition as text) & "," & (item 2 of windowPosition as text) & "," & (item 1 of windowSize as text) & "," & (item 2 of windowSize as text)',
    'end tell',
  ].join('\n')
  const { stdout } = await execa('osascript', ['-e', script], { timeout: 5000 })
  const bounds = parseWechatDevToolsWindowBounds(stdout)
  await execa('screencapture', ['-x', '-R', bounds, screenshot], { timeout: 10_000 })
}

export async function launchMiniProgramInCleanDevTools(
  name: string,
  projectPath: string,
  preferredPort: number | undefined,
  timeoutMs: number,
) {
  const port = preferredPort ?? await findFreePort()
  const launcher = new Launcher()
  process.stdout.write(`[weapp-hmr] ${name}: connect existing IDE for ${projectPath} port=${port}\n`)
  // 会话边界统一管理截止时间；项目清理由拥有整个用例的 finally 统一执行。
  const miniProgram = await launcher.launch({ cliPath: process.env.E2E_PREFLIGHT_WECHAT_CLI, projectPath, port, timeout: timeoutMs })
  return { miniProgram, port }
}

export async function closeMiniProgramAndCleanup(miniProgram: any, projectPath: string) {
  await closeWechatProject(projectPath, miniProgram, readNumberEnv('DEMO_VISUAL_IDE_CLOSE_TIMEOUT_MS', 10_000))
}
