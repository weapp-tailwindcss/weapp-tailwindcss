import process from 'node:process'
import { it } from 'vitest'
import { runStyleRemovalIdeProbe } from './issue-1241/ide-runner'

it.runIf(process.env.E2E_IDE === '1')('微信 watch 删除整块 style 后实际尺寸恢复，重复恢复和清空仍一致', runStyleRemovalIdeProbe, 300_000)
