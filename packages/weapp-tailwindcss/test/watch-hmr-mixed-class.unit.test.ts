import { describe, expect, it } from 'vitest'
import { replaceWxml } from '../../../tools/weapp-tailwindcss-scripts/src/core/replace-wxml'
import { assertClassTokensInOutput, assertPreviousClassEvidenceRemoved } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class/evidence'
import { assertIconifyConsumer } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/iconify/evidence'

const utility = 'bg-[#000]'
const escaped = replaceWxml(utility)
const alias = 'wtu-test-1'
const scope = 'data-v-a1'
const globalStyle = `.${escaped}{background-color:#000}.${alias}.${scope}{background-color:#000}`
const snapshot = (value: string) => ({ wxml: `<view class="${value}"/>`, js: '', globalStyle })
const verify = (value: string) => assertClassTokensInOutput(snapshot(value), [utility], [escaped], ['wxml'], 'mixed')

describe('混合模板 class 的完整消费证据', () => {
  it.each([
    `${escaped} {{unknown()}}`,
    `{{unknown()}} ${escaped}`,
    `before ${escaped} {{unknown()}} after`,
    `${escaped} {{true?'h-_b30px_B':'h-_b45px_B'}}`,
    `before {{'${escaped}'}} after`,
    `before {{enabled?'${escaped}':'other'}} after`,
    `before {{enabled?(nested?'${escaped}':'other'):'third'}} after`,
    `${escaped} {{fn('quoted }} text')}} tail`,
    `${escaped} {{fn({ nested: {} })}} tail`,
    `${escaped} {{{foo:1}}}`,
    `${escaped} {{{outer:{nested:{}}}}}`,
    `${escaped} {{ /}}/.test(value) }} tail`,
    `${escaped} {{fn(/* }} */ value)}} tail`,
    `fragment{{unknown}} ${escaped}`,
  ])('保留有完整边界的静态或表达式 token: %s', (value) => {
    expect(verify(value)[0]?.actualClass).toBe(escaped)
  })

  it.each([
    '',
    '   ',
    `{{''}}`,
    `{{false?'${escaped}':'other'}}`,
    `${escaped}{{suffix}}`,
    `{{prefix}}${escaped}`,
    `prefix{{'${escaped}'}}`,
    `{{'${escaped}'}}suffix`,
    `{{'${escaped}'}}{{' '}}`,
    `{{unknown('${escaped}')}}`,
    `{{'${escaped}' === flag ? 'other' : 'third'}}`,
    `${escaped} {{invalid(}}`,
    `${escaped} {{'unterminated}}`,
    `${escaped} }} {{unknown}}`,
  ])('不从碎片、条件、调用参数或异常语法借用 token: %s', (value) => {
    expect(() => verify(value)).toThrow(utility)
  })

  it.each([
    `before {{enabled?'${alias} ${scope}':'other'}} after`,
    `before {{enabled?'${alias} ${scope}':'${alias} ${scope} other'}} after`,
    `${scope} {{enabled?'${alias}':'other'}}`,
    `${alias} {{unknown()}} ${scope}`,
  ])('仅使用别名实际出现分支中共同的 scope: %s', (value) => {
    expect(verify(value)[0]?.actualClass).toBe(alias)
  })

  it.each([
    `{{[enabled?'${scope}':'', '${alias}']}}`,
    `{{enabled?'${alias}':'${scope}'}}`,
    `{{enabled?'${alias} ${scope}':'${alias}'}}`,
    `{{'${alias}'}}{{' ${scope}'}}`,
    `${alias} {{enabled?'${scope}':''}}`,
  ])('拒绝跨分支或拼接片段提供的 scope: %s', (value) => {
    expect(() => verify(value)).toThrow(utility)
  })

  it('仍要求真实 CSS，并在 CSS 已删除时通过先前消费证据识别残留 token', () => {
    const value = `before {{enabled?'${alias} ${scope}':'other'}} after`
    const previous = verify(value)
    const missingCss = { ...snapshot(value), globalStyle: '' }
    expect(() => assertClassTokensInOutput(missingCss, [utility], [escaped], ['wxml'], 'missing-css')).toThrow(utility)
    expect(() => assertPreviousClassEvidenceRemoved(missingCss, previous, [], 'rollback')).toThrow('stale class')
    expect(() => assertPreviousClassEvidenceRemoved(snapshot('other'), previous, [], 'rollback')).not.toThrow()
  })
})

it('Iconify 的阶段 marker 与类名不能跨三目分支拼接，scope 也不能通过投影回流', () => {
  const marker = 'current-stage'
  for (const value of [
    `{{enabled?'${marker}':'${escaped}'}}`,
    `{{enabled?'${marker} ${alias} ${scope}':'${alias}'}}`,
  ]) {
    expect(() => assertIconifyConsumer(snapshot(value), ['wxml'], marker, [utility], [escaped], 'iconify-mixed')).toThrow('missing current phase class consumer')
  }
  expect(() => assertIconifyConsumer(snapshot(`before {{enabled?'${marker} ${alias} ${scope}':'other'}} after`), ['wxml'], marker, [utility], [escaped], 'iconify-mixed')).not.toThrow()
})

it('Iconify 无关条件别名不影响本轮目标别名的定向 scope 证明', () => {
  const marker = 'current-stage'
  const value = `{{enabled?'${marker} ${alias} ${scope} wtu-other-1':'wtu-other-1'}}`
  expect(() => assertIconifyConsumer(snapshot(value), ['wxml'], marker, [utility], [escaped], 'iconify-unrelated')).not.toThrow()
})
