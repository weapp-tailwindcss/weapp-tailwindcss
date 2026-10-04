import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'

export const ORIGINAL_TEXT = 'Web target is the default. Use build:weapp to compare mini-program CSS output.'
export const TEXT_MARKER = 'Oxc text HMR verified.'
export const PROBE_MARKER = 'oxc class HMR verified'
export const PROBE_SELECTOR = '[data-oxc-vite-probe="ready"]'

export function makeVariants(original: string) {
  assert.equal(original.split(ORIGINAL_TEXT).length, 2, 'App.vue 文本锚点发生变化，拒绝猜测修改位置。')
  assert.equal(original.split('</section>').length, 2, 'App.vue section 锚点发生变化。')
  assert(!original.includes('data-oxc-vite-probe') && !original.includes(TEXT_MARKER), 'App.vue 存在未恢复的 benchmark marker。')
  for (const candidate of ['w-[137px]', 'h-[29px]', 'bg-[#13579b]']) {
    assert(!original.includes(candidate), `新类场景的候选已存在：${candidate}`)
  }
  const text = original.replace(ORIGINAL_TEXT, `${ORIGINAL_TEXT} ${TEXT_MARKER}`)
  const probe = `<div data-oxc-vite-probe="ready" class="w-[137px] h-[29px] bg-[#13579b]">${PROBE_MARKER}</div>`
  return { text, add: text.replace('</section>', `${probe}\n    </section>`), remove: text, restore: original }
}

/** 只恢复已知的本任务内容；遇到外部编辑立即报错，不能覆盖。 */
export async function restoreOwnedSource(file: string, original: string, owned: Iterable<string>) {
  const current = await readFile(file, 'utf8')
  if (current === original) {
    return
  }
  assert(new Set(owned).has(current), `App.vue 已被外部修改，保留现场：${file}`)
  await writeFile(file, original)
}
