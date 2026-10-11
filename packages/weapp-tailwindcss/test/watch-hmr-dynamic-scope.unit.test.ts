import { describe, expect, it } from 'vitest'
import { replaceWxml } from '../../../tools/weapp-tailwindcss-scripts/src/core/replace-wxml'
import { assertClassTokensInOutput, assertPreviousClassEvidenceRemoved } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class/evidence'

const utility = 'text-[23.000068px]'
const escaped = replaceWxml(utility)
const alias = 'wtu-11axwgi-29'
const globalStyle = `.${escaped}{font-size:23.000068px}.${alias}.${alias}.data-v-00a60067{font-size:23.000068px}`

function compiled(className = alias) {
  return `const common_vendor = require('../../common/vendor.js');
const _sfc_main = common_vendor.defineComponent({
  data() { return { __twWatchClass: '${className}', unrelated: 'wtu-other-0' }; }
});
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  'raw js';
  return { c: common_vendor.n($data.__twWatchClass), d: common_vendor.n($data.unrelated) };
}
const MiniProgramPage = common_vendor._export_sfc(_sfc_main, [['render', _sfc_render], ['__scopeId', 'data-v-00a60067']]);
wx.createPage(MiniProgramPage);`
}

function outputs(wxml = `<view class="{{['weapp-tw-border', 'data-v-00a60067', c]}}"/>`, js = compiled()) {
  return { wxml, js, globalStyle }
}

function verify(snapshot = outputs(), target: 'js' | 'wxml' = 'js') {
  return assertClassTokensInOutput(snapshot, [utility], [escaped], [target], 'dynamic')
}

describe('watch compiled dynamic class scopes', () => {
  it('links the actual emitted WXML array to its render and data string', () => {
    expect(verify()[0]?.actualClass).toBe(alias)
  })

  it('parses static tokens in a WXML expression without retaining quote punctuation', () => {
    expect(verify(outputs(`<view class="{{['${alias}', 'data-v-00a60067']}}"/>`), 'wxml')[0]?.actualClass).toBe(alias)
  })

  it('只将 reference 实际出现分支中共同的 scope 绑定到脚本消费', () => {
    expect(verify(outputs(`<view class="before {{enabled ? ['data-v-00a60067', c] : 'other'}} after"/>`))[0]?.actualClass).toBe(alias)
    expect(() => verify(outputs(`<view class="before {{enabled ? ['data-v-00a60067', c] : c}} after"/>`))).toThrow(utility)
    expect(() => verify(outputs(`<view class="{{enabled ? ['${alias}', 'data-v-00a60067', c] : '${alias}'}}"/>`), 'wxml')).toThrow(utility)
  })

  it('tracks the render data parameter by position rather than its spelling', () => {
    expect(verify(outputs(undefined, compiled().replaceAll('$data', 'state')))[0]?.actualClass).toBe(alias)
  })

  it.each(['wx:for-item', 'wx:for-index'])('rejects a %s binding on the consumer or an ancestor', (binding) => {
    const consumer = `<view class="{{['data-v-00a60067', c]}}"/>`
    expect(() => verify(outputs(`<view wx:for="{{items}}" ${binding}="c" class="{{['data-v-00a60067', c]}}"/>`))).toThrow(utility)
    expect(() => verify(outputs(`<view wx:for="{{items}}" ${binding}="c">${consumer}</view>`))).toThrow(utility)
  })

  it.each(['item', 'index'])('rejects the default loop binding %s', (binding) => {
    const js = compiled().replace('c: common_vendor.n', `${binding}: common_vendor.n`)
    expect(() => verify(outputs(`<view wx:for="{{items}}" class="{{['data-v-00a60067', ${binding}]}}"/>`, js))).toThrow(utility)
  })

  it('restores the outer binding after a loop ends', () => {
    const wxml = `<view wx:for="{{items}}" wx:for-item="c"><view class="{{c}}"/></view><view class="{{['data-v-00a60067', c]}}"/>`
    expect(verify(outputs(wxml))[0]?.actualClass).toBe(alias)
  })

  it('does not borrow a scope when only the loop-local consumer has it', () => {
    const wxml = `<view wx:for="{{items}}" wx:for-item="c"><view class="{{['data-v-00a60067', c]}}"/></view><view class="{{c}}"/>`
    expect(() => verify(outputs(wxml))).toThrow(utility)
  })

  it('does not treat named template data or a WXS module as render data', () => {
    const consumer = `<view class="{{['data-v-00a60067', c]}}"/>`
    expect(() => verify(outputs(`<template name="local">${consumer}</template>`))).toThrow(utility)
    expect(() => verify(outputs(`<wxs module="c" src="./local.wxs"/>${consumer}`))).toThrow(utility)
  })

  it('does not parse tag-like WXS source as template consumers', () => {
    const wxml = `<wxs module="local">/* <view class="{{['data-v-00a60067', c]}}"/> */</wxs>`
    expect(() => verify(outputs(wxml))).toThrow(utility)
    expect(() => verify(outputs(wxml.replace(', c]', `, '${alias}']`)), 'wxml')).toThrow(utility)
  })

  it('rejects an unbalanced template instead of guessing scope boundaries', () => {
    expect(() => verify(outputs(`<view wx:for="{{items}}" wx:for-item="c"></block><view class="{{['data-v-00a60067', c]}}"/>`))).toThrow(utility)
  })

  it.each([
    ['another dynamic consumer', `<view class="{{c}}"/><view class="{{['data-v-00a60067', d]}}"/>`],
    ['a conditional scope', `<view class="{{[enabled ? 'data-v-00a60067' : '', c]}}"/>`],
    ['malformed syntax', `<view class="{{['data-v-00a60067', c}}"/>`],
    ['a concatenated class', `<view class="prefix{{['data-v-00a60067', c]}}"/>`],
    ['a scope prefix', `<view class="{{['prefix-data-v-00a60067', c]}}"/>`],
    ['a scope suffix', `<view class="{{['data-v-00a60067-extra', c]}}"/>`],
    ['punctuation inside a scope string', `<view class="{{['data-v-00a60067,', c]}}"/>`],
    ['another attribute', `<view title="{{['data-v-00a60067', c]}}"/>`],
    ['a comment', `<!-- <view class="{{['data-v-00a60067', c]}}"/> -->`],
    ['a nearby render key', `<view class="{{['data-v-00a60067', cc]}}"/>`],
  ])('does not borrow evidence from %s', (_, wxml) => {
    expect(() => verify(outputs(wxml))).toThrow(utility)
  })

  it.each([`prefix-${alias}`, `${alias}-extra`, `${alias},`])('does not trim an almost matching class: %s', (className) => {
    expect(() => verify(outputs(undefined, compiled(className)))).toThrow(utility)
    expect(() => verify(outputs(`<view class="{{['${className}', 'data-v-00a60067']}}"/>`), 'wxml')).toThrow(utility)
  })

  it('does not connect another object with the same property name', () => {
    const js = `${compiled('wtu-other-0')}\nconst unrelated = { __twWatchClass: '${alias}' };`
    expect(() => verify(outputs(undefined, js))).toThrow(utility)
  })

  it.each([
    ['another render data parameter', '$data.__twWatchClass', '$setup.__twWatchClass'],
    ['another data property', '$data.__twWatchClass', '$data.__twWatchClassExtra'],
    ['another helper namespace', 'c: common_vendor.n', 'c: other_vendor.n'],
    ['a changed class value', 'common_vendor.n($data.__twWatchClass)', 'common_vendor.n($data.__twWatchClass + \'-extra\')'],
    ['an unattached render', '[\'render\', _sfc_render]', '[\'render\', another_render]'],
    ['a duplicate data property', 'unrelated: \'wtu-other-0\'', '__twWatchClass: \'wtu-other-0\''],
    ['a duplicate render key', 'd: common_vendor.n', 'c: common_vendor.n'],
    ['a spread data source', 'unrelated: \'wtu-other-0\'', '...unknown'],
    ['an asynchronous data method', 'data()', 'async data()'],
    ['a generator data method', 'data()', '*data()'],
    ['an optional normalizer', 'c: common_vendor.n(', 'c: common_vendor.n?.('],
    ['malformed script syntax', 'wx.createPage(MiniProgramPage);', 'wx.createPage(MiniProgramPage;'],
    ['a shadowed data parameter', '$data, $options', '$data, $data'],
    ['an unregistered component', 'wx.createPage(MiniProgramPage)', 'wx.createPage(otherPage)'],
    ['an ambiguous render attachment', '[\'__scopeId\', \'data-v-00a60067\']', '...otherAttachments'],
    ['an overwritten data option', '[\'__scopeId\', \'data-v-00a60067\']', '[\'data\', otherData]'],
  ])('rejects %s', (_, before, after) => {
    expect(() => verify(outputs(undefined, compiled().replace(before, after)))).toThrow(utility)
  })

  it('keeps distinct consumer scopes separate for a shared data property', () => {
    const wxml = `<view class="{{['data-v-00a60067', c]}}"/><view class="{{['data-v-b2', c]}}"/>`
    const snapshot = { ...outputs(wxml), globalStyle: `.${escaped}{font-size:23.000068px}.${alias}.data-v-00a60067.data-v-b2{font-size:23.000068px}` }
    expect(() => verify(snapshot)).toThrow(utility)
  })

  it('still detects a saved alias inside a WXML expression after CSS disappears', () => {
    const snapshot = outputs(`<view class="{{['${alias}', 'data-v-00a60067']}}"/>`)
    const previous = verify(snapshot, 'wxml')
    expect(() => assertPreviousClassEvidenceRemoved({ ...snapshot, globalStyle: '' }, previous, [], 'rollback')).toThrow(alias)
  })
})
