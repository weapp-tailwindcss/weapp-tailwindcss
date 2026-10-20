import path from 'node:path'
import process from 'node:process'
import { fixtureBaseline } from './baseline'

fixtureBaseline(path.resolve(import.meta.dirname, '../..'), true).catch((error) => {
  process.stderr.write(`${String(error)}\n`)
  process.exitCode = 1
})
