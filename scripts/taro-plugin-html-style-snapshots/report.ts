import { deepStrictEqual } from 'node:assert'

export type PluginHtmlMode = 'with-plugin-html' | 'without-plugin-html'

export interface CssArtifact {
  fileName: string
  artifact: string
  bytes: number
  lines: number
  selectors: number
  hasTaroSelector: boolean
  hasWeappEscapedArbitrarySelector: boolean
  h5AliasSelectors: number
  rawHtmlTagSelectors: number
  cursorDeclarations: number
  sha256: string
}

export interface ModeResult {
  mode: PluginHtmlMode
  status: 'passed' | 'failed'
  command: string
  durationMs: number
  artifacts: CssArtifact[]
  error?: string
}

export interface ProjectReport {
  project: string
  cssFiles: string[]
  modes: ModeResult[]
  comparison: {
    sameArtifactCount: boolean
    sameHashes: boolean
    changedFiles: string[]
    onlyWithPluginHtml: string[]
    onlyWithoutPluginHtml: string[]
  }
}

function normalizeReportText(input: string) {
  return `${input.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd()}\n`
}

export function renderModeReadme(project: string, result: ModeResult) {
  const rows = result.artifacts.map(item =>
    `| \`${item.fileName}\` | [${item.artifact}](${item.artifact}) | ${item.bytes} | ${item.lines} | ${item.selectors} | ${item.h5AliasSelectors} | ${item.rawHtmlTagSelectors} | ${item.cursorDeclarations} | ${item.hasTaroSelector} | ${item.hasWeappEscapedArbitrarySelector} | \`${item.sha256}\` |`)

  return normalizeReportText([
    `# ${project} ${result.mode}`,
    '',
    `Status: ${result.status}`,
    `Command: \`${result.command}\``,
    `Duration: ${result.durationMs}ms`,
    '',
    '| File | Artifact | Bytes | Lines | Selectors | h5-* aliases | Raw HTML tags | Cursor declarations | Taro selector | Weapp escaped arbitrary selector | Hash |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |',
    ...rows,
    result.error ? ['', '## Error', '', '```text', result.error, '```'] : '',
  ].filter(Boolean).join('\n'))
}

function sumArtifacts(artifacts: CssArtifact[], key: 'h5AliasSelectors' | 'rawHtmlTagSelectors' | 'cursorDeclarations') {
  return artifacts.reduce((total, artifact) => total + artifact[key], 0)
}

export function renderProjectReadme(report: ProjectReport) {
  const withResult = report.modes.find(item => item.mode === 'with-plugin-html')
  const withoutResult = report.modes.find(item => item.mode === 'without-plugin-html')
  const rows = report.modes.flatMap(result => result.artifacts.map(item =>
    `| ${result.mode} | \`${item.fileName}\` | [${result.mode}/${item.artifact}](${result.mode}/${item.artifact}) | ${item.bytes} | ${item.selectors} | ${item.h5AliasSelectors} | ${item.rawHtmlTagSelectors} | ${item.cursorDeclarations} | \`${item.sha256}\` |`))
  const withArtifacts = withResult?.artifacts ?? []
  const withoutArtifacts = withoutResult?.artifacts ?? []

  return normalizeReportText([
    `# ${report.project} Plugin HTML Style Output`,
    '',
    '## Core Report',
    '',
    `- with-plugin-html: ${withResult?.status ?? 'missing'}`,
    `- without-plugin-html: ${withoutResult?.status ?? 'missing'}`,
    `- same hashes: ${report.comparison.sameHashes}`,
    `- changed files: ${report.comparison.changedFiles.length === 0 ? '-' : report.comparison.changedFiles.map(file => `\`${file}\``).join(', ')}`,
    `- only with plugin-html: ${report.comparison.onlyWithPluginHtml.length === 0 ? '-' : report.comparison.onlyWithPluginHtml.map(file => `\`${file}\``).join(', ')}`,
    `- only without plugin-html: ${report.comparison.onlyWithoutPluginHtml.length === 0 ? '-' : report.comparison.onlyWithoutPluginHtml.map(file => `\`${file}\``).join(', ')}`,
    `- h5-* aliases: ${sumArtifacts(withArtifacts, 'h5AliasSelectors')} / ${sumArtifacts(withoutArtifacts, 'h5AliasSelectors')}`,
    `- raw HTML tag selectors: ${sumArtifacts(withArtifacts, 'rawHtmlTagSelectors')} / ${sumArtifacts(withoutArtifacts, 'rawHtmlTagSelectors')}`,
    `- cursor declarations: ${sumArtifacts(withArtifacts, 'cursorDeclarations')} / ${sumArtifacts(withoutArtifacts, 'cursorDeclarations')}`,
    '',
    '## File Index',
    '',
    '| Mode | File | Artifact | Bytes | Selectors | h5-* aliases | Raw HTML tags | Cursor declarations | Hash |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...rows,
  ].join('\n'))
}

export function renderRootReadme(reports: ProjectReport[]) {
  const rows = reports.map((report) => {
    const withStatus = report.modes.find(item => item.mode === 'with-plugin-html')?.status ?? 'missing'
    const withoutStatus = report.modes.find(item => item.mode === 'without-plugin-html')?.status ?? 'missing'
    return `| [${report.project}](${report.project}/README.md) | ${withStatus} | ${withoutStatus} | ${report.comparison.sameHashes} | ${report.comparison.changedFiles.length} |`
  })

  return normalizeReportText([
    '# Taro Plugin HTML Style Output',
    '',
    '## Core Report',
    '',
    `对 ${reports.length} 个 Taro demo 分别执行 \`with-plugin-html\` 与 \`without-plugin-html\` 的 \`build:weapp\`，样式产物按项目和模式保存到子目录。`,
    '',
    '| Project | With plugin-html | Without plugin-html | Same hashes | Changed files |',
    '| --- | --- | --- | --- | ---: |',
    ...rows,
    '',
    '## File Index',
    '',
    '- 每个项目目录下的 `README.md` 是该项目核心对比报告。',
    '- 完整样式产物在 `with-plugin-html/artifacts/` 与 `without-plugin-html/artifacts/`。',
    '- 结构化结果在 `report.json`。',
  ].join('\n'))
}

/** 定向更新仅替换本轮项目，保留未构建项目及其顺序。 */
export function mergeScopedPluginHtmlReports<T extends { project: string }>(baseline: T[], current: T[]): T[] {
  const pending = new Map(current.map(report => [report.project, report]))
  if (pending.size !== current.length) {
    throw new Error('plugin-html 报告包含重复项目')
  }
  const merged = baseline.map((report) => {
    const replacement = pending.get(report.project)
    pending.delete(report.project)
    return replacement ?? report
  })
  return [...merged, ...pending.values()]
}

/** 真实重建复验产物与结构元数据，构建耗时不属于确定性基线。 */
export function verifyPluginHtmlReports(baseline: ProjectReport[], current: ProjectReport[]) {
  for (const report of current) {
    const expected = baseline.find(item => item.project === report.project)
    if (!expected) {
      throw new Error(`plugin-html 缺少项目基线：${report.project}`)
    }
    const stable = (item: ProjectReport) => ({
      ...item,
      modes: item.modes.map(mode => ({
        mode: mode.mode,
        status: mode.status,
        command: mode.command,
        artifacts: mode.artifacts,
        ...(mode.error ? { error: mode.error } : {}),
      })),
    })
    deepStrictEqual(stable(report), stable(expected), `plugin-html 产物基线不一致：${report.project}`)
  }
}
