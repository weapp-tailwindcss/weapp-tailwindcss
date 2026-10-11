#!/usr/bin/env node
/* eslint-disable node/prefer-global/process, style/max-statements-per-line */
import fs from 'node:fs'
import path from 'node:path'

const file = process.argv[2] || 'skills/evals/quality-cases.json'
if (process.argv.includes('--help')) { console.log('用法: node scripts/p2-skill-eval.mjs [cases.json]'); process.exit(0) }
const data = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
if (!Array.isArray(data.cases)) { throw new TypeError('cases 必须是数组') }
const total = data.cases.length
const tp = data.cases.filter(c => c.expected === c.actual && c.expected === true).length
const fp = data.cases.filter(c => c.expected === false && c.actual === true).length
const fn = data.cases.filter(c => c.expected === true && c.actual === false).length
const precision = tp / Math.max(tp + fp, 1)
const recall = tp / Math.max(tp + fn, 1)
const metrics = { schemaVersion: 1, version: data.version || '1.0.0', total, precision, recall, misleadingRate: data.cases.filter(c => c.misleading === true).length / Math.max(total, 1), correctionRate: data.cases.filter(c => c.corrected === true).length / Math.max(total, 1), completionRate: data.cases.filter(c => c.completed === true).length / Math.max(total, 1) }
console.log(JSON.stringify(metrics, null, 2))
