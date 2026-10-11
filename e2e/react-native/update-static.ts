/* eslint-disable antfu/no-top-level-await, no-console */

import fs from 'node:fs/promises'
import path from 'node:path'
import { writeStaticEvidence } from './static-evidence'

const output = path.resolve(import.meta.dirname, '../../examples/react-native-expo/src/compatibility/static-evidence.json')
const report = await writeStaticEvidence(output)
const reportsDirectory = path.resolve(import.meta.dirname, 'reports')
await fs.mkdir(reportsDirectory, { recursive: true })
await fs.writeFile(path.resolve(reportsDirectory, 'web.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`React Native static evidence: ${output}`)
