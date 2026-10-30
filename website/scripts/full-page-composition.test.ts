import { expect, it } from 'vitest'
import { validCaptureWindow } from '../tests/helpers/full-page/monitor/model'
import { compositionFixture } from './full-page-composition/fixture'

it('相同的祖先计算属性不会把正常多帧窗口判为扰动', () => {
  const fixture = compositionFixture()
  fixture.tick()
  fixture.tick()
  expect(validCaptureWindow(fixture.finish())).toBe(true)
})

it('CSSOM 改变祖先绘制属性且最终恢复时，子链接状态相同也必须拒绝', () => {
  const fixture = compositionFixture()
  fixture.tick()
  fixture.ancestor.properties.set('filter', 'blur(2px)')
  fixture.tick()
  fixture.ancestor.properties.delete('filter')
  const evidence = fixture.finish()
  expect(validCaptureWindow(evidence)).toBe(false)
  expect(evidence.disturbances).toContain('捕获期间 TOC 祖先身份、合成属性或父关系改变')
})

it.each(['class', 'style', 'hidden'])('祖先 %s 在同一任务中改回也保留 mutation 历史', (attribute) => {
  const fixture = compositionFixture()
  fixture.tick()
  fixture.tick()
  fixture.attribute(attribute, null)
  fixture.attribute(attribute, 'changed')
  const evidence = fixture.finish()
  expect(validCaptureWindow(evidence)).toBe(false)
  expect(evidence.disturbances).toContain(attribute === 'class' ? '捕获期间 TOC 祖先 class 发生改变' : '捕获期间 TOC 祖先属性发生改变')
})

it('祖先未完成动画不能被链接自身无动画或恢复后的终态掩盖', () => {
  const fixture = compositionFixture()
  fixture.tick()
  fixture.ancestor.animations.push({ playState: 'running', pending: false })
  fixture.tick()
  fixture.ancestor.animations.length = 0
  const evidence = fixture.finish()
  expect(validCaptureWindow(evidence)).toBe(false)
  expect(evidence.disturbances).toContain('TOC 祖先捕获期间存在未完成动画')
})

it('同位置重新归属到另一祖先也不能沿用原合成链身份', () => {
  const fixture = compositionFixture()
  fixture.tick()
  fixture.tick()
  fixture.toc.parentElement = fixture.body
  expect(validCaptureWindow(fixture.finish())).toBe(false)
})

it('祖先计算样式不变但裁剪参考框被布局移动时也必须拒绝', () => {
  const fixture = compositionFixture()
  fixture.tick()
  fixture.ancestor.rect.y = 250
  fixture.tick()
  fixture.ancestor.rect.y = 200
  const evidence = fixture.finish()
  expect(validCaptureWindow(evidence)).toBe(false)
  expect(evidence.disturbances).toContain('捕获期间 TOC 祖先身份、合成属性或父关系改变')
})

it('同值属性通知且实际样式与几何均未变时不误判', () => {
  const fixture = compositionFixture()
  fixture.ancestor.attributes.set('style', 'opacity:.9')
  fixture.attribute('style', 'opacity:.9')
  fixture.tick()
  fixture.tick()
  expect(validCaptureWindow(fixture.finish())).toBe(true)
})

it('共享祖先每次采样只读一次完整属性，不按链接数重复读取', () => {
  const fixture = compositionFixture(32, 400)
  fixture.tick()
  fixture.tick()
  const evidence = fixture.finish()
  expect(validCaptureWindow(evidence)).toBe(true)
  for (const node of [fixture.toc, fixture.ancestor, fixture.body, fixture.html]) {
    expect(fixture.reads.get(node)).toBe(4)
  }
})
