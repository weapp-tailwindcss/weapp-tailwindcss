import type { CaptureRect, DevelopmentEvent, DevelopmentScreenshot, DevelopmentShot, DevelopmentVideoShot } from '../capture/manifest'

interface Scene { id: string, duration: number }

function finitePositive(value: number) {
  return Number.isFinite(value) && value > 0
}

function sameRect(a: CaptureRect, b: CaptureRect) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function requireRect(rect: CaptureRect, bounds: CaptureRect, label: string) {
  if (!rect || !Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !finitePositive(rect.width) || !finitePositive(rect.height)
    || rect.x < bounds.x || rect.y < bounds.y || rect.x + rect.width > bounds.x + bounds.width || rect.y + rect.height > bounds.y + bounds.height) {
    throw new Error(`${label} 裁切区域越界或尺寸无效。`)
  }
}

function requireVisual(visual: { media: { width: number, height: number }, crop: CaptureRect, outputWidth: number, cardRect?: CaptureRect }, label: string, minimumCardWidth?: number) {
  if (!finitePositive(visual.media.width) || !finitePositive(visual.media.height) || !finitePositive(visual.outputWidth) || visual.outputWidth > 1920) {
    throw new Error(`${label} 素材与展示尺寸无效。`)
  }
  requireRect(visual.crop, { x: 0, y: 0, width: visual.media.width, height: visual.media.height }, label)
  if (visual.cardRect) {
    requireRect(visual.cardRect, visual.crop, `${label} 卡片`)
  }
  if (minimumCardWidth && (!visual.cardRect || visual.cardRect.width / visual.crop.width * visual.outputWidth < minimumCardWidth)) {
    throw new Error(`${label} 原生卡片展示宽度至少需要 ${minimumCardWidth}px。`)
  }
}

function requireEvent(events: DevelopmentEvent[], stage: string, eventId: string) {
  if (!['initial', 'spacing', 'color'].includes(stage) || eventId !== stage || !events.some(event => event.id === eventId)) {
    throw new Error(`${stage} 镜头未绑定对应阶段的源码与 bundle 摘要。`)
  }
}

function verifyScreenshot(screenshot: DevelopmentScreenshot, events: DevelopmentEvent[], shots: DevelopmentShot[], minimumCardWidth?: number) {
  requireEvent(events, screenshot.stage, screenshot.eventId)
  requireVisual(screenshot, `${screenshot.stage} 截图`, minimumCardWidth)
  const source = screenshot.sourceVideo
  if (screenshot.media.width !== source.width || screenshot.media.height !== source.height
    || !Number.isFinite(screenshot.sourceSeconds) || screenshot.sourceSeconds < 0 || screenshot.sourceSeconds >= source.durationSeconds) {
    throw new Error(`${screenshot.stage} 截图来源时间或原始尺寸无效。`)
  }
  const nativeShot = shots.find(shot => shot.kind === 'video' && ['before', 'result'].includes(shot.view)
    && shot.stage === screenshot.stage && shot.media.path === source.path && shot.media.sha256 === source.sha256
    && shot.media.width === source.width && shot.media.height === source.height && shot.media.durationSeconds === source.durationSeconds
    && screenshot.sourceSeconds >= shot.startSeconds && screenshot.sourceSeconds <= shot.endSeconds)
  if (!nativeShot) {
    throw new Error(`${screenshot.stage} 截图未绑定实际展示的原生录像及来源时间。`)
  }
}

/** 分开核验视频顺序和静帧停留，禁止用重复视频填满开发段。 */
export function verifyDevelopmentShots(events: DevelopmentEvent[], shots: DevelopmentShot[], scenes: readonly Scene[], fps: number) {
  if (fps !== 30 || scenes.find(scene => scene.id === 'classname')?.duration !== 900) {
    throw new Error('原生更新开发段必须严格覆盖 30 FPS 的 900 帧。')
  }
  if (new Set(events.map(event => event.id)).size !== events.length) {
    throw new Error('开发操作必须具有独立 id。')
  }
  for (const stage of ['initial', 'spacing', 'color']) {
    requireEvent(events, stage, stage)
  }
  const ids = new Set<string>()
  const previousEnd = new Map<string, number>()
  const mediaIdentity = new Map<string, string>()
  let anchor: DevelopmentVideoShot | undefined
  for (const shot of shots) {
    if (!shot.id || ids.has(shot.id) || !['config', 'classname'].includes(shot.sceneId) || !Number.isInteger(shot.displayFrames) || shot.displayFrames < 1) {
      throw new Error('开发镜头必须具有独立 id 和正整数展示帧数。')
    }
    ids.add(shot.id)
    if (shot.kind === 'comparison') {
      verifyScreenshot(shot.before, events, shots, 660)
      verifyScreenshot(shot.after, events, shots, 660)
      if (!sameRect(shot.before.crop, shot.after.crop) || shot.before.outputWidth !== shot.after.outputWidth) {
        throw new Error('前后截图必须使用相同裁切位置、比例和顶部锚点。')
      }
      if (shot.before.media.path === shot.after.media.path || shot.before.media.sha256 === shot.after.media.sha256) {
        throw new Error('前后对比必须绑定不同阶段的真实截图。')
      }
      continue
    }
    requireEvent(events, shot.stage, shot.eventId)
    requireVisual(shot, shot.id, ['before', 'result'].includes(shot.view) ? 720 : undefined)
    if (!Number.isFinite(shot.startSeconds) || !Number.isFinite(shot.endSeconds) || shot.startSeconds < 0 || shot.endSeconds <= shot.startSeconds
      || !finitePositive(shot.media.durationSeconds) || shot.endSeconds > shot.media.durationSeconds + 0.001) {
      throw new Error(`${shot.id} 视频时间区间无效。`)
    }
    if ((shot.playbackRate ?? 1) !== 1 || Math.abs((shot.endSeconds - shot.startSeconds) * fps - shot.displayFrames) > 0.01) {
      throw new Error(`${shot.id} 必须按正常速度播放并精确匹配展示帧数。`)
    }
    const identity = JSON.stringify([shot.media.sha256, shot.media.width, shot.media.height, shot.media.durationSeconds])
    if (mediaIdentity.has(shot.media.path) && mediaIdentity.get(shot.media.path) !== identity) {
      throw new Error(`${shot.id} 同一视频素材的摘要或尺寸不一致。`)
    }
    mediaIdentity.set(shot.media.path, identity)
    if (shot.startSeconds < (previousEnd.get(shot.media.path) ?? 0) - 0.001) {
      throw new Error(`${shot.id} 视频片段重复或逆序。`)
    }
    previousEnd.set(shot.media.path, shot.endSeconds)
    if (shot.view === 'editor' || shot.view === 'config') {
      if (!shot.sourceCodeFontSize || shot.sourceCodeFontSize * shot.outputWidth / shot.crop.width < 32) {
        throw new Error(`${shot.id} 关键代码展示字号至少需要 32px。`)
      }
    }
    if (shot.view === 'editor' && !shot.preview) {
      throw new Error(`${shot.id} 编辑镜头必须保留真实原生预览。`)
    }
    if (shot.preview) {
      verifyScreenshot(shot.preview, events, shots)
    }
    if (['before', 'result'].includes(shot.view)) {
      if (anchor && (!sameRect(anchor.crop, shot.crop) || anchor.outputWidth !== shot.outputWidth)) {
        throw new Error('原生修改前后镜头必须使用相同裁切位置、比例和顶部锚点。')
      }
      anchor ??= shot
    }
  }
  const config = shots.filter(shot => shot.sceneId === 'config')
  const configScene = scenes.find(scene => scene.id === 'config')
  if (!configScene || !config.length || config.some(shot => shot.kind !== 'video' || shot.view !== 'config')
    || config.reduce((sum, shot) => sum + shot.displayFrames, 0) !== configScene.duration) {
    throw new Error('config 镜头时长或类型与场景不一致。')
  }
  const development = shots.filter(shot => shot.sceneId === 'classname')
  const expected = [['before', 30], ['editor', 120], ['terminal', 90], ['result', 120], ['comparison', 90]] as const
  for (const round of [1, 2] as const) {
    const selected = development.filter(shot => shot.round === round)
    const groups: Array<{ view: string, frames: number }> = []
    const beforeStage = round === 1 ? 'initial' : 'spacing'
    const afterStage = round === 1 ? 'spacing' : 'color'
    for (const shot of selected) {
      const view = shot.kind === 'comparison' ? 'comparison' : shot.view
      const previous = groups.at(-1)
      if (previous?.view === view) {
        previous.frames += shot.displayFrames
      }
      else {
        groups.push({ view, frames: shot.displayFrames })
      }
      if (shot.kind === 'comparison' ? shot.before.stage !== beforeStage || shot.after.stage !== afterStage
        : shot.stage !== (view === 'before' ? beforeStage : afterStage) || (view === 'editor' && shot.preview?.stage !== beforeStage)) {
        throw new Error(`第 ${round} 轮镜头与修改阶段不一致。`)
      }
    }
    if (groups.length !== expected.length || groups.some((group, index) => group.view !== expected[index][0] || group.frames !== expected[index][1])) {
      throw new Error(`第 ${round} 轮镜头必须按 1/4/3/4/3 秒节奏覆盖 450 帧。`)
    }
  }
  if (development.length !== development.filter(shot => shot.round === 1 || shot.round === 2).length
    || development.reduce((sum, shot) => sum + shot.displayFrames, 0) !== 900
    || development.some((shot, index) => index > 0 && shot.round! < development[index - 1].round!)) {
    throw new Error('原生更新开发段必须按顺序严格覆盖两轮 900 帧。')
  }
  for (const shot of development) {
    if (shot.kind !== 'video' || shot.view !== 'terminal') {
      continue
    }
    const preceding = shots[shots.indexOf(shot) - 1]
    if (preceding?.kind === 'video' && preceding.media.path === shot.media.path && shot.startSeconds > preceding.endSeconds + 1 / fps && !shot.waitTrimmed) {
      throw new Error(`${shot.id} 跳切必须明确标注已剪去构建等待。`)
    }
  }
}
