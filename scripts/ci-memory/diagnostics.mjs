export function renderMarkdown(report) {
  const rows = report.peakProcesses?.rows ?? []
  return [
    `# CI 内存报告：${report.label}`,
    '',
    `- generated_at: ${report.generatedAt}`,
    `- command: \`${report.command.join(' ')}\``,
    `- exit_code: ${report.exitCode}`,
    `- runtime: ${report.runtime.node} / ${report.runtime.platform} / ${report.runtime.arch}`,
    `- samples: ${report.summary.count}`,
    `- RSS baseline: ${report.summary.baselineRssMb}MB`,
    `- RSS peak: ${report.summary.peakRssMb}MB`,
    `- RSS peak at: ${report.summary.peakAt ? new Date(report.summary.peakAt).toISOString() : 'unavailable'}`,
    `- RSS steady: ${report.summary.steadyRssMb}MB`,
    `- RSS delta: ${report.summary.rssDeltaMb}MB`,
    `- max single process RSS: ${report.summary.peakMaxProcessRssMb}MB`,
    `- peak process count: ${report.summary.peakProcessCount}`,
    `- duration: ${Math.round(report.summary.durationMs / 1000)}s`,
    '',
    '最新峰值的进程快照（按 RSS 排序，最多 20 项；仅记录可执行文件，不采集参数）：',
    '',
    '| PID | PPID | RSS MB | 启动时间 | 可执行文件 |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${row.pid} | ${row.ppid} | ${row.rssMb} | ${row.startedAt} | ${row.command.replaceAll('|', '\\|')} |`),
    '',
    `省略进程：${report.peakProcesses?.omittedProcessCount ?? 0}`,
    '',
  ].join('\n')
}

export function renderStdoutSummary(report) {
  return `[ci-memory] summary: ${JSON.stringify({
    label: report.label.slice(0, 80),
    command: report.command.join(' ').slice(0, 256),
    runtime: report.runtime,
    exitCode: report.exitCode,
    ...report.summary,
  })}\n`
}
