import type { ResponsivePhase } from '../../../examples/react-lynx/src/compatibility/responsive-contract'
import type { ResponsiveFrames, ResponsiveImages } from '../responsive'
import { responsiveContract } from '../../../examples/react-lynx/src/compatibility/responsive-contract'
import { PNG } from '../png'

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height, width, height })

/** 合成数据只验证协议和变异拒绝，不作为原生能力证据。 */
export function responsiveFixture(runId = '00000000-0000-4000-8000-000000000001', scale = 1, originalWidth = 390) {
  const frames = {} as ResponsiveFrames
  const images = {} as ResponsiveImages
  for (const [index, phase] of responsiveContract.phases.entries()) {
    const width = phase === 'wide' ? 960 : phase === 'restored' ? originalWidth : 384
    const probeWidth = width < 768 ? 200 : 80
    frames[phase] = {
      runId, requestId: `responsive-${index + 1}`, phase,
      original: { width: originalWidth, height: 800 }, requested: { width, height: 800 },
      viewport: { width, height: 800, measuredWidth: width, measuredHeight: 800, pixelRatio: scale },
      threshold: rect(0, 0, 768, 1),
      geometry: { probe: rect(16, 16, probeWidth, 40), control: rect(16, 116, 80, 40),
        probeContainer: rect(0, 0, 240, 80), controlContainer: rect(0, 100, 240, 80) },
    }
    images[phase] = { probe: responsiveImage(probeWidth, scale), control: responsiveImage(80, scale) }
  }
  return { frames, images }
}

export function responsiveImage(width: number, scale = 1) {
  const image = new PNG({ width: 240 * scale, height: 80 * scale })
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const inside = x >= 16 * scale && x < (16 + width) * scale && y >= 16 * scale && y < 56 * scale
      image.data.set(inside ? [14, 165, 233, 255] : [247, 250, 251, 255], (y * image.width + x) * 4)
    }
  }
  return image
}

export function responsiveCapture(runId: string, requestId: string, phase: ResponsivePhase) {
  return { frame: { ...responsiveFixture(runId).frames[phase], requestId },
    artifacts: [`variant-responsive-${phase}-probe.png`, `variant-responsive-${phase}-control.png`, `variant-responsive-${phase}.native.json`]
      .map(name => ({ runId, name, sha256: 'b'.repeat(64), byteLength: 100 })) }
}
