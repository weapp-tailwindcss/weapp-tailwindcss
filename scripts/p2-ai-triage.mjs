#!/usr/bin/env node
/* eslint-disable node/prefer-global/process */
import fs from 'node:fs'
import path from 'node:path'

const input = process.argv[2]
if (!input || process.argv.includes('--help')) {
  console.log('用法: node scripts/p2-ai-triage.mjs <issue.json> [output.json]')
  process.exit(input ? 0 : 1)
}
const issue = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'))
const scrub = value => String(value ?? '').replace(/[A-Z]:\\[^\s"']+/gi, '<path>').replace(/(?:\/|\\)(?:Users|home|tmp)[^\s"']*/gi, '<path>')
const facts = [
  { id: 'issue-title', text: scrub(issue.title), evidence: 'issue.title' },
  ...(Array.isArray(issue.evidence) ? issue.evidence.map((text, index) => ({ id: `evidence-${index + 1}`, text: scrub(text), evidence: `issue.evidence[${index}]` })) : []),
]
const result = { schemaVersion: 1, facts, hypotheses: facts.length ? [{ id: 'h1', statement: '需要根据现有证据验证最小复现路径', status: 'unverified', evidence: facts.map(f => f.id) }] : [], reproduction: { steps: ['准备脱敏 fixture', '运行对应测试入口', '记录首次偏离事件'], status: 'candidate' }, probes: ['记录首次失败阶段和输入模块'], regressionTests: ['为复现 fixture 增加回归测试'], generatedAt: new Date().toISOString() }
const output = process.argv[3] ? path.resolve(process.argv[3]) : undefined
if (output) {
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
}
else { console.log(JSON.stringify(result, null, 2)) }
