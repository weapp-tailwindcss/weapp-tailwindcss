/* eslint-disable antfu/no-top-level-await, no-console */

import path from 'node:path'
import { writeStaticEvidence } from './static-evidence'

const output = path.resolve(import.meta.dirname, '../../examples/react-native-expo/src/compatibility/static-evidence.json')
const report = await writeStaticEvidence(output)
console.log(`React Native static evidence: ${output}; ${report.results.filter(result => result.status === 'unverified').length} runtime cases still require fresh evidence`)
