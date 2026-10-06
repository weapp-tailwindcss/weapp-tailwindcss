import type { NativeGeometryEvidence, NativeRect } from './types'

type Box = readonly [left: number, top: number, width: number, height: number]

const contracts: Record<string, { probe: Box, control: Box, child: Box, controlChild: Box }> = {
  'grid-placement': { probe: [6, 6, 84, 52], control: [50, 34, 40, 24], child: [0, 0, 8, 8], controlChild: [0, 0, 8, 8] },
  'grid-auto': { probe: [6, 6, 140, 24], control: [6, 6, 140, 68], child: [72, 0, 40, 24], controlChild: [0, 36, 40, 24] },
  'grid-justify-self': { probe: [46, 6, 100, 44], control: [6, 6, 100, 44], child: [40, 0, 20, 12], controlChild: [0, 0, 20, 12] },
  'variant-supports': { probe: [6, 6, 100, 44], control: [6, 6, 100, 44], child: [44, 0, 20, 12], controlChild: [0, 16, 20, 12] },
}

function matches(rect: NativeRect, parent: NativeRect, expected: Box) {
  const actual = [rect.left - parent.left, rect.top - parent.top, rect.width, rect.height]
  return expected.every((value, index) => Math.abs(actual[index]! - value) <= 1.5)
}

/** 先验证固定 grid 对照，再逐项验证位置、跨度、自动轨道及内外对齐。 */
export function checkGridGeometry(id: string, geometry: NativeGeometryEvidence) {
  const contract = contracts[id]
  if (!contract) {
    return undefined
  }
  const { probe, control, probeContainer, controlContainer, probeChild, controlChild } = geometry
  return {
    control: [probeContainer, controlContainer].every(rect => Math.abs(rect.width - 160) <= 1.5 && Math.abs(rect.height - 140) <= 1.5)
      && matches(control, controlContainer, contract.control) && matches(controlChild, control, contract.controlChild),
    probe: matches(probe, probeContainer, contract.probe) && matches(probeChild, probe, contract.child),
  }
}
