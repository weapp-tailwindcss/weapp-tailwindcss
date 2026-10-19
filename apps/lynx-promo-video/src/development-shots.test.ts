import type { DevelopmentComparisonShot, DevelopmentVideoShot } from '../scripts/capture/manifest'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { developmentRenderMetadata, publicAssetPath } from '../scripts/capture/render-metadata'
import { verifyDevelopmentMedia } from '../scripts/media/development-media'
import { verifyDevelopmentMetadata, verifyDevelopmentShots } from '../scripts/media/timeline'
import { developmentFixture, developmentScenes } from './test-fixtures/development'

const verify = (fixture = developmentFixture()) => verifyDevelopmentShots(fixture.events, fixture.shots, developmentScenes, 30)

describe('原生更新分镜验收', () => {
  it('两个正常速度的修改轮次严格覆盖900帧，静帧可引用较早来源', () => {
    const fixture = developmentFixture()
    expect(() => verify(fixture)).not.toThrow()
    expect(fixture.shots.filter(shot => shot.sceneId === 'classname').reduce((sum, shot) => sum + shot.displayFrames, 0)).toBe(900)
  })

  it('拒绝以缩短静帧或延长结果镜头绕过指定停留时间', () => {
    const fixture = developmentFixture()
    const comparison = fixture.shots.find(shot => shot.id === '1-comparison')!
    const result = fixture.shots.find(shot => shot.id === '1-result')! as DevelopmentVideoShot
    comparison.displayFrames--
    result.displayFrames++
    result.endSeconds += 1 / 30
    expect(() => verify(fixture)).toThrow('1/4/3/4/3')
  })

  it.each(['replay', 'speed', 'frames', 'waiting'])('拒绝逆序视频、加速、空帧及未标注的等待跳切：%s', (failure) => {
    const fixture = developmentFixture()
    const shot = fixture.shots.find(shot => shot.id === '1-success')! as DevelopmentVideoShot
    if (failure === 'replay') {
      shot.startSeconds = 14
      shot.endSeconds = 15
    }
    if (failure === 'speed') {
      Object.assign(shot, { playbackRate: 2 })
    }
    if (failure === 'frames') {
      shot.displayFrames--
    }
    if (failure === 'waiting') {
      shot.waitTrimmed = false
    }
    expect(() => verify(fixture)).toThrow(failure === 'replay' ? '逆序' : failure === 'waiting' ? '已剪去构建等待' : '正常速度')
  })

  it.each(['outside', 'card', 'font', 'preview', 'anchor'])('拒绝裁切越界、过小卡片/代码、缺预览和不一致取景：%s', (failure) => {
    const fixture = developmentFixture()
    const result = fixture.shots.find(shot => shot.id === '1-result')! as DevelopmentVideoShot
    const editor = fixture.shots.find(shot => shot.id === '1-editor')! as DevelopmentVideoShot
    if (failure === 'outside') {
      result.crop.x = 1000
    }
    if (failure === 'card') {
      result.outputWidth = 720
    }
    if (failure === 'font') {
      editor.sourceCodeFontSize = 31
    }
    if (failure === 'preview') {
      editor.preview = undefined
    }
    if (failure === 'anchor') {
      result.crop.y++
    }
    expect(() => verify(fixture)).toThrow(failure === 'outside' ? '越界' : failure === 'card' ? '720px' : failure === 'font' ? '32px' : failure === 'preview' ? '预览' : '顶部锚点')
  })

  it.each(['source', 'timestamp', 'stage', 'scale', 'width'])('校验前后截图的录像来源、时间、阶段、比例及宽度：%s', (failure) => {
    const fixture = developmentFixture()
    const shot = fixture.shots.find(shot => shot.id === '1-comparison')! as DevelopmentComparisonShot
    if (failure === 'source') {
      shot.after.sourceVideo.sha256 = 'f'.repeat(64)
    }
    if (failure === 'timestamp') {
      shot.after.sourceSeconds = 15
    }
    if (failure === 'stage') {
      shot.after.eventId = 'color'
    }
    if (failure === 'scale') {
      shot.after.crop.y++
    }
    if (failure === 'width') {
      shot.after.outputWidth = 660
    }
    expect(() => verify(fixture)).toThrow(failure === 'stage' ? '摘要' : failure === 'scale' ? '顶部锚点' : failure === 'width' ? '660px' : '来源时间')
  })

  it('截图来源时间不能落在视频剪辑排除的结束边界', () => {
    const fixture = developmentFixture()
    const comparison = fixture.shots.find(shot => shot.id === '1-comparison')! as DevelopmentComparisonShot
    comparison.after.sourceSeconds = 6
    expect(() => verify(fixture)).toThrow('来源时间')
  })

  it('不能复制同一视频并改名来绕过禁止重复播放的限制', () => {
    const fixture = developmentFixture()
    const shot = fixture.shots.find(shot => shot.id === '1-success')! as DevelopmentVideoShot
    shot.media.path = 'same-recording-copy.mp4'
    shot.startSeconds = 14
    shot.endSeconds = 15
    expect(() => verify(fixture)).toThrow('逆序')
  })

  it.each(['editor-width', 'native-height', 'comparison-width', 'comparison-height', 'preview-height'])('拒绝单个面板合格但最终画布溢出的取景：%s', (failure) => {
    const fixture = developmentFixture()
    const editor = fixture.shots.find(shot => shot.id === '1-editor')! as DevelopmentVideoShot
    const result = fixture.shots.find(shot => shot.id === '1-result')! as DevelopmentVideoShot
    const comparison = fixture.shots.find(shot => shot.id === '1-comparison')! as DevelopmentComparisonShot
    if (failure === 'editor-width') {
      editor.outputWidth = 1200
      editor.preview!.outputWidth = 780
    }
    if (failure === 'native-height') {
      result.crop.height = 650
    }
    if (failure === 'comparison-width') {
      comparison.before.outputWidth = comparison.after.outputWidth = 900
    }
    if (failure === 'comparison-height') {
      comparison.before.crop.height = comparison.after.crop.height = 700
    }
    if (failure === 'preview-height') {
      editor.preview!.crop.height = 1300
    }
    expect(() => verify(fixture)).toThrow('展示画布预算')
  })

  it('要求初始、间距和颜色三个源码阶段且禁止轮次倒放', () => {
    const fixture = developmentFixture()
    fixture.events.shift()
    expect(() => verify(fixture)).toThrow('摘要')
    const reordered = developmentFixture()
    reordered.shots = [reordered.shots[0], ...reordered.shots.slice(8), ...reordered.shots.slice(1, 8)]
    expect(() => verify(reordered)).toThrow('逆序')
  })
})

describe('剪辑媒体与生成数据身份', () => {
  it('核对真实媒体尺寸和时长，不接受只修改清单投影大小', async () => {
    const fixture = developmentFixture()
    const inspect = async (file: string) => {
      const source = file.endsWith('development.mp4') ? fixture.desktop : fixture.native
      return { streams: [{ codec_type: 'video', codec_name: 'h264', width: source.width, height: source.height }], format: { duration: String(source.durationSeconds) } }
    }
    await expect(verifyDevelopmentMedia(fixture.shots, '/public/captures/manifest.json', inspect)).resolves.toBeUndefined()
    await expect(verifyDevelopmentMedia(fixture.shots, '/public/captures/manifest.json', async file => ({ ...await inspect(file), streams: [{ codec_type: 'video', codec_name: 'h264', width: 1, height: 1 }] }))).rejects.toThrow('真实媒体尺寸')
    await expect(verifyDevelopmentMedia(fixture.shots, '/public/captures/manifest.json', async file => ({ ...await inspect(file), format: { duration: '1' } }))).rejects.toThrow('真实视频时长')
  })

  it('生成资源路径后仍逐项绑定裁切、静帧来源和阶段', () => {
    const fixture = developmentFixture()
    const metadata = developmentRenderMetadata({ video: '', rawVideo: '', clips: [], ...fixture }, '/public/captures/manifest.json', '/public')
    expect(metadata.shots![0].kind === 'video' && metadata.shots![0].media.path).toBe('captures/development.mp4')
    expect(fixture.shots[0].kind === 'video' && fixture.shots[0].media.path).toBe('development.mp4')
    expect(() => verifyDevelopmentMetadata(JSON.stringify(metadata), [], metadata.shots)).not.toThrow()
    const stale = structuredClone(metadata)
    ;(stale.shots![7] as DevelopmentComparisonShot).after.sourceSeconds++
    expect(() => verifyDevelopmentMetadata(JSON.stringify(stale), [], metadata.shots)).toThrow('素材清单不一致')
  })

  it.each([
    [path.posix, '/public/captures/manifest.json', 'stage/initial.png', '/public', 'captures/stage/initial.png'],
    [path.posix, '/manifest.json', 'stage/initial.png', '/', 'stage/initial.png'],
    [path.win32, 'C:\\public\\captures\\manifest.json', 'stage\\initial.png', 'C:\\public', 'captures/stage/initial.png'],
    [path.win32, 'C:\\manifest.json', 'stage\\initial.png', 'C:\\', 'stage/initial.png'],
  ])('在公开资源边界处理各平台路径', (paths, manifest, file, publicDir, expected) => {
    expect(publicAssetPath(manifest, file, publicDir, paths)).toBe(expected)
  })

  it('拒绝仓库外素材、Windows 其他盘符和父目录逃逸', () => {
    expect(() => publicAssetPath('/public/captures/manifest.json', '../../raw.mov', '/public', path.posix)).toThrow('public')
    expect(() => publicAssetPath('C:\\public\\manifest.json', 'D:\\raw.mov', 'C:\\public', path.win32)).toThrow('public')
  })
})
