import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { instrumentSource } from './instrument.mjs'
import { refs } from './prepare.mjs'

for (const [role, ref] of Object.entries(refs)) {
  for (const relative of [
    'packages/weapp-tailwindcss/src/bundlers/webpack/BaseUnifiedPlugin/v5-assets.ts',
    'packages/weapp-tailwindcss/src/bundlers/webpack/BaseUnifiedPlugin/v5-assets/html-js-tasks.ts',
  ]) {
    test(`准确 ${role} ${relative} AST 锚点与语法`, () => {
      const source = execFileSync('git', ['show', `${ref}:${relative}`], { encoding: 'utf8' })
      const result = instrumentSource(source, relative)
      assert.notEqual(result.receipt.originalSha256, result.receipt.instrumentedSha256)
      assert.ok(result.receipt.edits.length >= 3)
      assert.throws(() => instrumentSource(result.source, relative), /拒绝重复插桩/)
      assert.throws(() => instrumentSource(source.replaceAll('compilerOptions.jsHandler', 'missingHandler').replaceAll('enqueueWebpackHtmlAndJsTasks', 'missingEnqueue'), relative), /锚点必须唯一/)
    })
  }
}
