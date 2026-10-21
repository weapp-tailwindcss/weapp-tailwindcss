import { PNG } from 'pngjs'
import { expect, it } from 'vitest'
import { digest } from './tailwind-capabilities/identity'
import { assertionPassed } from './tailwind-capabilities/report'
import { historyAssertions } from './tailwind-capabilities/web-history/contract'
import { historyIdentity, historyToken } from './tailwind-capabilities/web-history/fixtures'
import { syntheticHistory } from './tailwind-capabilities/web-history/test-fixture'

it.each(['initial', 'visited', 'restored'] as const)('缺少 %s 阶段仍返回全量失败断言，不因部分轨迹解引用丢失诊断', (name) => {
  const fixture = syntheticHistory()
  fixture.raw.states = fixture.raw.states.filter(state => state.name !== name)
  const assertions = historyAssertions(fixture.raw, fixture.screenshots, fixture.cssHash, fixture.engine, fixture.runId)
  expect(assertions.find(item => item.name === `${name}/fixture/id`)?.actual).toBeNull()
  expect(assertions.every(assertionPassed)).toBe(false)
})

function passed(fixture: ReturnType<typeof syntheticHistory>) {
  try {
    return historyAssertions(fixture.raw, fixture.screenshots, fixture.cssHash, fixture.engine, fixture.runId).every(assertionPassed)
  }
  catch { return false }
}
it.each(['chromium', 'firefox', 'webkit'] as const)('%s 合同不以掩蔽的computed和matches决定历史绘制', (engine) => {
  const fixture = syntheticHistory('unit-history', engine)
  expect(passed(fixture)).toBe(true)
  expect(fixture.raw.states.every(state => Object.values(state.links).every(link => !link.matchesVisited && link.computed === 'rgb(1, 2, 3)'))).toBe(true)
})

const mutations = {
  '缺真实点击': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.navigation.shift()
  },
  '非可信点击': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.navigation[0]!.trusted = false
  },
  '子frame导航': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.navigation[0]!.mainFrame = false
  },
  '错误响应': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.navigation[0]!.status = 404
  },
  '访问对照URL': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.requests[1]!.path = new URL(f.raw.states[0]!.links['control']!.href).pathname
  },
  '未知HTTP路径': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.requests[1]!.path = '/unknown'
  },
  '访问发生在初始截图之前': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.states[0]!.sequence = 6
  },
  '截图次序错误': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.states.reverse()
  },
  '缺恢复': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.states.pop()
  },
  '重复阶段': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.states.push(f.raw.states[0]!)
  },
  '重复profile目录': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.profiles[1]!.directory = f.raw.profiles[0]!.directory
  },
  '相对profile目录': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.profiles[1]!.directory = 'profile/fresh'
  },
  '借用非persistent上下文': (f: ReturnType<typeof syntheticHistory>) => { Object.assign(f.raw.profiles[0]!, { persistent: false }) },
  '使用headless shell': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.profiles[0]!.channel = 'default'
  },
  '恢复复用原实例': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.states[2]!.profileId = f.raw.states[0]!.profileId
  },
  'profile先删后关': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.lifecycle.reverse()
  },
  '未清理profile': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.profiles[0]!.removed = false
  },
  'HTTP未关闭': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.cleanup.serverClosed = false
  },
  '缺PNG': (f: ReturnType<typeof syntheticHistory>) => {
    f.screenshots.delete(f.raw.states[1]!.screenshot)
  },
  '旧run PNG': (f: ReturnType<typeof syntheticHistory>) => {
    f.screenshots = syntheticHistory('old-run').screenshots
  },
  '跨引擎PNG': (f: ReturnType<typeof syntheticHistory>) => {
    f.screenshots = syntheticHistory(f.runId, 'firefox').screenshots
  },
  '非同源顶层': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.states[1]!.topOrigin = 'https://other.example'
  },
  '边框宽度丢失': (f: ReturnType<typeof syntheticHistory>) => {
    f.raw.states[1]!.links['probe']!.borderWidth = '0px'
  },
}
for (const [name, mutate] of Object.entries(mutations)) {
  it(`拒绝${name}`, () => {
    const fixture = syntheticHistory()
    mutate(fixture)
    expect(passed(fixture)).toBe(false)
  })
}

it.each(['top', 'right', 'bottom', 'left'] as const)('任一边%s丢失，即使节点可见和computed伪装正确仍拒绝', (edge) => {
  const fixture = syntheticHistory()
  const png = PNG.sync.read(fixture.screenshots.get(fixture.raw.states[1]!.screenshot)!)
  const [x, y] = { top: [104, 28], right: [180, 44], bottom: [104, 60], left: [28, 44] }[edge]
  png.data.set([1, 2, 3, 255], (y! * png.width + x!) * 4)
  fixture.screenshots.set(fixture.raw.states[1]!.screenshot, PNG.sync.write(png))
  fixture.raw.states[1]!.links['probe']!.computed = 'rgb(18, 52, 86)'
  expect(passed(fixture)).toBe(false)
})

it.each(['initial', 'visited', 'restored'] as const)('%s 的对照污染、缺触发或未恢复不能用整图差异冒充', (name) => {
  const fixture = syntheticHistory()
  const state = fixture.raw.states.find(state => state.name === name)!
  const png = PNG.sync.read(fixture.screenshots.get(state.screenshot)!)
  const y = name === 'visited' ? 68 : 28
  png.data.set([18, 52, 86, 255], (y * png.width + 104) * 4)
  fixture.screenshots.set(state.screenshot, PNG.sync.write(png))
  expect(passed(fixture)).toBe(false)
})

it.each([['/owned/history', '/owned/fresh'], ['C:\\owned\\history', 'C:\\owned\\fresh'], ['\\owned\\history', '\\owned\\fresh']])('独占profile身份接受本机POSIX和Windows绝对根路径 %s', (history, fresh) => {
  const fixture = syntheticHistory()
  fixture.raw.profiles.forEach((profile, index) => {
    const previous = profile.id
    profile.directory = [history, fresh][index]!
    profile.id = digest({ runId: fixture.runId, engine: fixture.engine, directory: profile.directory })
    fixture.raw.states.filter(state => state.profileId === previous).forEach((state) => {
      state.profileId = profile.id
      state.observation?.samples.forEach((sample) => {
        sample.profileId = profile.id
      })
      const png = PNG.sync.read(fixture.screenshots.get(state.screenshot)!)
      historyIdentity(fixture.runId, historyToken(state.name, 1), fixture.cssHash, fixture.engine, profile.id)
        .forEach((color, i) => png.data.set([...color, 255], (162 * png.width + 24 + i * 4 + 2) * 4))
      fixture.screenshots.set(state.screenshot, PNG.sync.write(png))
    })
    fixture.raw.navigation.filter(event => event.profileId === previous).forEach((event) => {
      event.profileId = profile.id
    })
  })
  expect(passed(fixture)).toBe(true)
})
