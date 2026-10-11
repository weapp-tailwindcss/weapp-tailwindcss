import os from 'node:os'
import process from 'node:process'

function fmt(value, suffix = '') {
  return Number.isFinite(value) ? `${value.toFixed(2)}${suffix}` : '-'
}

export function renderReport(report, gate) {
  const rows = report.cases
    .map(item => `| ${item.id} | ${item.size} | ${fmt(item.coldMs, 'ms')} | ${fmt(item.time?.median, 'ms')} | ${fmt(item.time?.p95, 'ms')} | ${fmt(item.memory?.peakRssMb, 'MB')} | ${fmt(item.memory?.peakRssDeltaMb, 'MB')} | ${item.outputBytes} |`)
    .join('\n')
  const complexity = gate.complexity
    .map(item => `| ${item.group} | ${fmt(item.exponent)} |`)
    .join('\n')
  const findings = [...gate.violations, ...gate.observations]
    .map(item => `- ${item.knownDebt ? '<span style="color:red">🔴' : ''}**${item.id}/${item.metric}**：${item.message}${item.issue ? `（${item.issue}）` : ''}${item.knownDebt ? '</span>' : ''}`)
    .join('\n') || '- 无'
  const bundles = (report.bundles ?? []).map(item => `| ${item.name} | ${item.rawBytes} | ${item.gzipBytes} | ${item.brotliBytes} |`).join('\n') || '| - | - | - | - |'
  return `# weapp-tailwindcss 全链路性能报告

生成时间：${report.generatedAt}

## 环境

- Commit：${report.commit}
- Node：${process.version}
- Platform：${process.platform} ${process.arch}
- CPU：${os.cpus()[0]?.model ?? 'unknown'}
- 样本：warmup ${report.options.warmups}，runs ${report.options.runs}
- 场景隔离：${report.options.isolation === 'process' ? '独立进程（RSS 不累积前序场景）' : '共享进程'}

## 场景结果

| 场景 | 规模 | Cold | Median | P95 | Peak RSS | RSS 增量 | 输出字节 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

## 复杂度

| 分组 | 指数 |
| --- | ---: |
${complexity}

## Runtime 包体积

| 包 | Raw | gzip | brotli |
| --- | ---: | ---: | ---: |
${bundles}

## 门禁

- 结果：${gate.passed ? '通过' : '失败'}
- 阻断违规：${gate.violations.length}
- 已知债务/观察：${gate.observations.length}

${findings}
`
}
