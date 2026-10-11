import type { PreflightReport } from './types'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { assertImage, writeReport } from './io'
import { maxAgeMs } from './types'

const actions = ['discover', 'read', 'screenshot', 'input', 'click', 'verify'] as const

export interface ComputerUseEvidence {
  runId: string
  provider: string
  sessionId: string
  targetUrl: string
  observedAt: string
  screenshot: string
  observations: Array<{ action: typeof actions[number], toolCallId: string, transcript: string }>
}

export async function recordComputerUseBlock(report: PreflightReport, file: string, reason: string) {
  if (!reason.trim()) {
    throw new Error('必须记录原始工具错误。')
  }
  const artifact = path.join(path.dirname(file), 'computer-use-error.txt')
  await writeFile(artifact, `${report.runId}\n${new Date().toISOString()}\n${reason}\n`)
  const check = report.checks.find(item => item.id === 'computer-use')!
  Object.assign(check, { status: 'blocked', checkedAt: new Date().toISOString(), detail: reason, evidence: [artifact] })
  report.status = 'blocked'
  delete report.verifiedAt
  await writeReport(file, report)
}

async function evidenceFile(dir: string, file: string) {
  if (typeof file !== 'string' || !file || path.isAbsolute(file) || path.win32.isAbsolute(file)) {
    throw new Error('工具证据必须使用本轮目录内的相对文件路径。')
  }
  const root = await realpath(dir)
  const target = await realpath(path.resolve(root, file))
  const relative = path.relative(root, target)
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('工具证据越过了本轮目录。')
  }
  return target
}

export async function validateComputerUse(report: PreflightReport, dir: string, interactionAt?: string, now = Date.now()) {
  const evidence: ComputerUseEvidence = JSON.parse(await readFile(path.join(dir, 'computer-use.json'), 'utf8'))
  const observed = Date.parse(evidence.observedAt)
  if (evidence.runId !== report.runId || evidence.targetUrl !== `${report.endpoint}/challenge/${report.challenge}`
    || typeof evidence.provider !== 'string' || !evidence.provider.trim()
    || typeof evidence.sessionId !== 'string' || !evidence.sessionId.trim()
    || !Number.isFinite(observed) || observed < Date.parse(report.createdAt) || observed > now
    || now - observed > maxAgeMs || !interactionAt || observed < Date.parse(interactionAt)) {
    throw new Error('Computer use 缺少本轮会话、有效时间或服务端交互回执。')
  }
  const files: string[] = []
  for (const action of actions) {
    const item = evidence.observations?.find(item => item.action === action)
    if (!item || typeof item.toolCallId !== 'string' || !item.toolCallId.trim()) {
      throw new Error(`Computer use 缺少实际工具调用：${action}`)
    }
    const file = await evidenceFile(dir, item.transcript)
    const transcript = await readFile(file, 'utf8')
    if (!transcript.includes(item.toolCallId) || !transcript.includes(report.runId) || transcript.trim().length < 40) {
      throw new Error(`Computer use 工具原始输出无法关联本轮 ${action}。`)
    }
    files.push(file)
  }
  const screenshot = await evidenceFile(dir, evidence.screenshot)
  await assertImage(screenshot)
  return { evidence, files: [...new Set([...files, screenshot, path.join(dir, 'computer-use.json')])] }
}

export function challengePage(runId: string, submitUrl: string, web = false) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>全面测试环境预检</title>
<body><h1>Computer use 环境预检</h1><p id="run">${runId}</p>
<p>读取并截图此页面，在输入框输入上面的 run ID，然后点击验证。不要使用脚本直接提交。</p>
<label>本轮 run ID <input id="input" autocomplete="off"></label><button id="submit">验证</button><p id="result">等待操作</p>
<script>
let typed = false;
document.querySelector('#input').addEventListener('input', event => { typed = event.isTrusted; });
document.querySelector('#submit').addEventListener('click', async event => {
  const value = document.querySelector('#input').value;
  if (value !== ${JSON.stringify(runId)} || !typed || !event.isTrusted) return;
  ${web ? '' : `const response = await fetch(${JSON.stringify(submitUrl)}, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({runId:value,typed,clicked:event.isTrusted})}); if (!response.ok) return;`}
  document.querySelector('#result').textContent = '完成：' + value;
});
</script></body></html>`
}
