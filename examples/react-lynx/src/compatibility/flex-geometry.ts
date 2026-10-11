import type { NativeGeometryEvidence, NativeRect } from './types'

type Box = readonly [left: number, top: number, width: number, height: number]

const contracts: Record<string, { probe: Box, control: Box, child: Box, controlChild: Box }> = {
  'flex-grow': { probe: [6, 6, 91, 24], control: [6, 6, 24, 24], child: [0, 0, 8, 8], controlChild: [0, 0, 8, 8] },
  'flex-wrap-order': { probe: [30, 6, 64, 52], control: [6, 6, 64, 24], child: [0, 28, 40, 24], controlChild: [44, 0, 40, 24] },
  'flex-shorthand-shrink': { probe: [6, 6, 108, 24], control: [6, 6, 24, 24], child: [0, 0, 80, 24], controlChild: [0, 0, 12, 24] },
}

function matches(rect: NativeRect, parent: NativeRect, expected: Box) {
  const actual = [rect.left - parent.left, rect.top - parent.top, rect.width, rect.height]
  return expected.every((value, index) => Math.abs(actual[index]! - value) <= 1.5)
}

/** 对照必须具备空间竞争；宽度、换行和排序逐项符合预期才算支持。 */
export function checkFlexGeometry(id: string, geometry: NativeGeometryEvidence) {
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
