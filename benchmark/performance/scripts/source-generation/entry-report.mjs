import { difference, statistics } from '../../demo/model.mjs'

export const entries = ['weapp-tailwindcss', 'weapp-tailwindcss/vite', 'weapp-tailwindcss/webpack', 'weapp-tailwindcss/postcss']

export function summarizeEntries(report) {
  const rows = []
  const errors = []
  const expected = report.profile ? 1 : 7
  const cases = entries.flatMap(entry => ['esm', 'cjs'].flatMap(format =>
    ['loadMs', ...(entry === 'weapp-tailwindcss' ? [] : ['initializeMs']), 'firstGenerateMs', 'firstTransformMs', 'totalMs', 'peakRssMb'].map(field => ({ metric: 'entry', entry, format, field }))))
  if (!report.profile) {
    cases.unshift({ metric: 'install.offline', field: 'ms' }, { metric: 'install.offline', field: 'peakRssMb' })
  }
  for (const batch of report.profile ? ['first'] : ['first', 'second']) {
    for (const item of cases) {
      const summary = {}
      for (const variant of ['before', 'after']) {
        const samples = report.samples.filter(sample => sample.batch === batch && sample.variant === variant && sample.metric === item.metric && sample.entry === item.entry && sample.format === item.format)
        const measured = statistics(samples.map(sample => sample[item.field]))
        const valid = samples.length === expected && new Set(samples.map(sample => sample.round)).size === expected
          && samples.every(sample => Number.isInteger(sample.round) && sample.round >= 0 && sample.round < expected)
          && measured?.count === expected && (item.field !== 'peakRssMb' || measured.min > 0)
        summary[variant] = valid ? measured : null
        if (!valid) {
          errors.push(`${batch}/${variant}/${item.entry ?? item.metric}/${item.format ?? ''}/${item.field} 样本不足或无效`)
        }
      }
      rows.push({ batch, ...item, summary, difference: summary.before && summary.after ? difference(summary.before.median, summary.after.median) : null })
    }
  }
  return { rows, errors }
}

export function entryMarkdown(report, rows) {
  const number = value => Number.isFinite(value) ? value.toFixed(2) : 'N/A'
  const lines = ['# 独立消费项目安装与入口诊断', '', report.scope, '', `Node ${report.environment.node}；${report.environment.packageManager}；${report.environment.platform}/${report.environment.arch}；${report.environment.cpu}。`, '', report.profile ? '这是独立 profiling，不能参与验收计时。' : '两批反向顺序，每批 7 轮；入口数字不是框架端到端收益。RSS 单位 MiB，其余单位 ms。', '', '| 批次 | 入口 / 阶段 | 格式 | 指标 | 前 median / p95 | 后 median / p95 | median 差值 / % |', '| --- | --- | --- | --- | --- | --- | --- |']
  for (const row of rows) {
    lines.push(`| ${row.batch} | ${row.entry ?? row.metric} | ${row.format ?? 'N/A'} | ${row.field} | ${number(row.summary.before?.median)} / ${number(row.summary.before?.p95)} | ${number(row.summary.after?.median)} / ${number(row.summary.after?.p95)} | ${number(row.difference?.absolute)} / ${number(row.difference?.percent)} |`)
  }
  lines.push('', '根聚合入口没有插件初始化步骤，未填造零值。首次生成包含生成入口加载及 source 解析，首次转换包含转换入口加载、管线初始化及自定义插件执行。进程树 RSS 是轮询峰值；单进程 resourceUsage 峰值另存于原始样本，不混用。', '', ...report.errors.map(error => `- ${error.split(/\r?\n/)[0]}`))
  return `${lines.join('\n')}\n`
}
