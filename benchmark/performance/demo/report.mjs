import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { replaceSourceFile } from '../../../scripts/ci/demo-matrix/source-file.mjs'
import { capabilityLabel, modes, statistics, summarizeRow, validateReport } from './model.mjs'

const labels = { native: '不接入', static: '静态等价', enabled: '正常接入' }
const format = value => Number.isFinite(value) ? value.toFixed(2) : 'N/A'
const cell = value => String(value ?? 'N/A').replaceAll('|', '\\|').replaceAll(/\r?\n/g, ' ')
const html = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
const delta = value => value ? `${format(value.absolute)} ms / ${format(value.percent)}%` : 'N/A'

export function renderMarkdown(report) {
  const rows = report.rows.map(row => summarizeRow(row, report.settings, report))
  const errors = validateReport(report)
  const completed = rows.filter(row => row.comparable).length
  const worst = rows.filter(row => row.processing).sort((a, b) => b.processing.absolute - a.processing.absolute).slice(0, 10)
  const table = selected => [
    '| demo／目标 | 环境 | 能力边界 | 指标 | 不接入 median | 静态等价 median | 正常接入 median / p95 | 总接入增量 | 实时处理增量 | 状态 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...selected.map(row => `| ${cell(`${row.demo}:${row.target}`)} | ${cell(`${row.os} / Node ${row.node}`)} | ${cell(capabilityLabel(row))} | ${cell(row.metric)} | ${format(row.summary.native?.median)} ms | ${format(row.summary.static?.median)} ms | ${format(row.summary.enabled?.median)} / ${format(row.summary.enabled?.p95)} ms | ${delta(row.overhead)} | ${delta(row.processing)} | ${cell(row.status)} |`),
  ].join('\n')
  return `# weapp-tailwindcss 每周接入成本报告

- 发布版本：${cell(report.package.version)}；源码 SHA：${cell(report.sha)}
- 实际开始时间：${cell(report.startedAt)}；报告：${errors.length ? '不完整／失败' : '完整'}
- 已完成指标：${completed}/${report.expected.length}；所有耗时均为毫秒，负增量表示更快。
- 原生组不保证样式等价；静态组预生成不计时，也不包含人工编写 CSS 的时间。
- CLI 产物与浏览器覆盖不能代替 IDE／设备验收。仅构建目标没有 HMR 指标。
- 网络冷安装仅供观察。每个 demo 的安装结果不按编译目标重复计数。
- 三组统一复用匹配版本的仓库框架补丁，被测 npm 包不打补丁；版本、补丁原文与哈希见分片 dependencies 和 JSON。

## 实时处理开销最大的目标

${table(worst)}

## 全部结果

${table(rows)}

## 进程树内存与安装空间

RSS 为定期采样的进程树峰值估计（MiB），不包含观察器进程；HMR 为同一 watcher 截至本轮的峰值。安装空间为去重硬链接后的文件字节数，store 单独记录，不等同压缩下载流量。

| demo／目标 | 环境 | 指标 | 不接入 RSS | 静态 RSS | 正常接入 RSS | 正常接入安装空间 MiB |
| --- | --- | --- | --- | --- | --- | --- |
${rows.map(row => `| ${cell(`${row.demo}:${row.target}`)} | ${cell(`${row.os} / ${row.node}`)} | ${cell(row.metric)} | ${modes.map(mode => format(row.memory?.[mode]?.median)).join(' | ')} | ${format(statistics(row.samples.enabled.map(sample => sample.installedBytes / 1024 ** 2))?.median)} |`).join('\n')}

Web 的更新类型逐样本标记为 hmr 或 reload，小程序产物更新标记为 native-watch。Web dev 的内存模块不伪装为磁盘产物完成时间；当前以实际页面生效计时。安装依赖数、锁文件和完整性在 JSON 与分片 dependencies 目录保留。

## 未覆盖的 IDE 专属项目

${report.boundaries.filter(item => !item.targets.length).map(item => `- ${cell(item.demo)}：${cell(item.limitation)}`).join('\n') || '无'}

## 失败与缺证

${errors.map(error => `- ${cell(error)}`).join('\n') || '无'}
`
}

export function renderHtml(report) {
  const rows = report.rows.map(row => summarizeRow(row, report.settings, report))
  const body = rows.map(row => `<tr data-demo="${html(row.demo)}" data-target="${html(row.target)}" data-os="${html(row.os)}" data-node="${html(row.node)}" data-phase="${html(row.metric.split('.')[0])}"><td>${html(`${row.demo}:${row.target}`)}</td><td>${html(`${row.os} / ${row.node}`)}</td><td>${html(capabilityLabel(row))}</td><td>${html(row.metric)}</td>${modes.map(mode => `<td>${format(row.summary[mode]?.median)}<small>p95 ${format(row.summary[mode]?.p95)}</small></td>`).join('')}<td>${html(delta(row.overhead))}</td><td>${html(delta(row.processing))}</td><td>${html(row.status)} ${html(row.error)}</td></tr>`).join('\n')
  const select = (field, label, values) => `<label>${label} <select id="${field}"><option value="">全部</option>${[...new Set(values)].map(value => `<option>${html(value)}</option>`).join('')}</select></label>`
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>weapp-tailwindcss 接入成本</title>
<style>body{font:15px system-ui;margin:32px;color:#17252b}h1{font-size:26px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}th{background:#eef4f4}input,select{padding:8px;margin:12px 12px 20px 0}td{font-variant-numeric:tabular-nums}tr[hidden]{display:none}small{display:block;color:#59656b}</style>
<h1>weapp-tailwindcss ${html(report.package.version ?? 'N/A')} 接入成本</h1>
<p>${html(report.startedAt)} · ${html(report.sha)} · ${validateReport(report).length ? '报告不完整／失败' : '报告完整'} · 已完成 ${rows.filter(row => row.comparable).length}/${report.expected.length}</p>
<p>单位 ms。原生组样式可能不等价；静态组预生成不计时。IDE／设备另行验收。负增量表示更快。</p>
<p>三组统一复用匹配版本的仓库框架补丁，被测 npm 包不打补丁；补丁原文与哈希保存在分片 dependencies 和 JSON 中。</p>
<label>demo <input id="demo" placeholder="输入名称"></label>
${select('target', '目标平台', rows.map(row => row.target))}
${select('os', '系统', rows.map(row => row.os))}
${select('node', 'Node', rows.map(row => row.node))}
${select('phase', '阶段', ['install', 'build', 'startup', 'hmr'])}
<table><thead><tr><th>demo／目标</th><th>环境</th><th>能力边界</th><th>指标</th>${modes.map(mode => `<th>${labels[mode]}</th>`).join('')}<th>总接入增量</th><th>实时处理增量</th><th>状态</th></tr></thead><tbody>${body}</tbody></table>
<h2>失败与缺证</h2><ul>${validateReport(report).map(error => `<li>${html(error)}</li>`).join('')}</ul>
<h2>IDE 专属项目</h2><ul>${report.boundaries.filter(item => !item.targets.length).map(item => `<li>${html(item.demo)}：${html(item.limitation)}</li>`).join('')}</ul>
<script>const fields=['demo','target','os','node','phase'];const controls=fields.map(id=>document.getElementById(id));for(const c of controls)c.addEventListener('input',()=>{for(const r of document.querySelectorAll('tbody tr'))r.hidden=fields.some((field,index)=>{const value=controls[index].value;return value&&(field==='demo'?!r.dataset[field].includes(value):r.dataset[field]!==value)})});</script></html>`
}

export function renderSummary(report) {
  const markdown = renderMarkdown(report)
  const errors = validateReport(report)
  return `${markdown.split('## 全部结果')[0]}\n## 失败范围（最多 30 条）\n\n${errors.slice(0, 30).map(error => `- ${cell(error.slice(0, 500))}`).join('\n') || '无'}\n\n完整逐目标表格、原始样本和 HTML 筛选报告请下载本次运行的「每周接入成本报告」artifact，保留 90 天。\n`
}

export async function writeReport(report, directory) {
  await mkdir(directory, { recursive: true })
  const enriched = { ...report, rows: report.rows.map(row => summarizeRow(row, report.settings, report)), errors: validateReport(report) }
  await Promise.all([
    replaceSourceFile(path.join(directory, 'report.json'), `${JSON.stringify(enriched, null, 2)}\n`),
    replaceSourceFile(path.join(directory, 'report.md'), renderMarkdown(enriched)),
    replaceSourceFile(path.join(directory, 'report.html'), renderHtml(enriched)),
  ])
  return enriched
}
