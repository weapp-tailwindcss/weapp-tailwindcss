import { describe, expect, it } from 'vitest'
import { validateAndroidCaptureImages } from './lynx/capture-image-evidence'

const assets = [{ name: 'static/image/avatar.123.jpg', sha256: 'actual-bytes' }]
const receipt = (image: Record<string, unknown>) => `10-19 00:53:46.356 11401 11401 I LynxCaptureImage: LYNX_CAPTURE_IMAGE ${JSON.stringify(image)}\n`
const image = { name: assets[0]!.name, width: 512, height: 512 }

describe('Android 原生本地图片录制证据', () => {
  it('接受本轮资产的真实位图尺寸与解码日志', () => {
    expect(validateAndroidCaptureImages(receipt(image), assets)).toEqual({ version: 1, images: [image] })
  })

  it('拒绝实际复现的缺失 image 组件错误及空白占位', () => {
    expect(() => validateAndroidCaptureImages('java.lang.RuntimeException: No BehaviorController defined for class image', assets)).toThrow('组件或本地图片加载失败')
    expect(() => validateAndroidCaptureImages('Successfully rendered other view nodes', assets)).toThrow('缺少本轮本地图片')
  })

  it('拒绝旧资产、空尺寸或图片加载失败', () => {
    expect(() => validateAndroidCaptureImages(receipt({ ...image, name: 'old-avatar.jpg' }), assets)).toThrow('不属于本轮')
    expect(() => validateAndroidCaptureImages(receipt({ ...image, width: 0 }), assets)).toThrow('不属于本轮')
    expect(() => validateAndroidCaptureImages(`${receipt(image)}Local capture image failed`, assets)).toThrow('图片加载失败')
  })
})
