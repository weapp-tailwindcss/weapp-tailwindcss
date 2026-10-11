import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import fg from 'fast-glob'

export function inspectNativeContents(contents) {
  assert.ok(contents.some(content => /\.registerComponent\(/.test(content) && content.includes('tw-matrix-native-app')), 'Native bundle must register the application and include its rendered page probe')
  return { coverage: 'native-build', javascript: true, applicationRegistration: true, pageProbe: true }
}

export async function inspectNative(outputDir) {
  const files = await fg(['**/*.js', '**/*.bundle'], { cwd: outputDir })
  assert.ok(files.length, 'Native build must emit JavaScript')
  return inspectNativeContents(await Promise.all(files.map(file => readFile(path.join(outputDir, file), 'utf8'))))
}
