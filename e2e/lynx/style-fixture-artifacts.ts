import fs from 'node:fs/promises'
import path from 'node:path'
import { decodeLynxBundle } from './decoder'
import { assertImportantPriorityRules } from './important-static'
import { parseDecodedRules, parseGeneratedRules } from './static-evidence'
import { assertSupportsGuards } from './supports-guard'

/** 每次报告验收均重读本轮样式与真实 bundle，不能由报告开关或 serializer 输入跳过竞争及条件证据。 */
export async function validateStyleFixtureArtifacts(directory: string) {
  const [css, bundle] = await Promise.all([
    fs.readFile(path.join(directory, 'main.css'), 'utf8'),
    fs.readFile(path.join(directory, 'main.lynx.bundle')),
  ])
  const generated = parseGeneratedRules(css)
  const bundled = parseDecodedRules((await decodeLynxBundle(bundle)).css.text)
  assertImportantPriorityRules(generated, 'generation')
  assertImportantPriorityRules(bundled, 'encoding')
  assertSupportsGuards(generated, bundled)
}
