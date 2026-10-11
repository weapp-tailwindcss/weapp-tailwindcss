import type { WatchCase } from '../../types'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { resolveBaseCwd } from '../../cli'

export interface WebIconifyStyleEvidence {
  phase: string
  styleText: string
  expectedIconCssIncludes: string[]
  expectedContentCssIncludes: string[]
  missingIcons: string[]
  missingContent: string[]
}

/** 保存失败时同一次浏览器样式读取及精确选择器诊断，不能以泛化超时文案推断图标丢失。 */
export async function writeWebIconifyStyleEvidence(watchCase: WatchCase, sourceFile: string, marker: string, evidence: WebIconifyStyleEvidence) {
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const caseName = watchCase.name.replace(/[^a-z0-9-]/gi, '-')
  const directory = path.join(resolveBaseCwd(), 'e2e', 'benchmark', 'e2e-watch-hmr', 'snapshots', `${timestamp}-${caseName}-web-iconify-failure`)
  const { styleText, ...diagnostics } = evidence
  await fs.mkdir(directory, { recursive: true })
  await Promise.all([
    fs.writeFile(path.join(directory, 'live.css'), styleText, 'utf8'),
    fs.writeFile(path.join(directory, 'meta.json'), JSON.stringify({ label: watchCase.label, project: watchCase.project, sourceFile, marker, ...diagnostics }, null, 2), 'utf8'),
  ])
  return directory
}
