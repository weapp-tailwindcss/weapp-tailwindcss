import type { PngPixels } from './png'

type Point = readonly [number, number]

function fit(points: Point[]) {
  const mean = (index: 0 | 1) => points.reduce((sum, point) => sum + point[index], 0) / points.length
  const x = mean(0)
  const y = mean(1)
  const slope = points.reduce((sum, point) => sum + (point[0] - x) * (point[1] - y), 0)
    / points.reduce((sum, point) => sum + (point[0] - x) ** 2, 0)
  const residual = Math.sqrt(points.reduce((sum, point) => sum + (point[1] - y - slope * (point[0] - x)) ** 2, 0) / points.length)
  return { slope, middle: y, residual }
}

/** 只读取蓝色实心主体的轮廓，要求不透明画布和连续填充，拒绝空图、裁切、装饰物或孔洞。 */
function silhouette(image: PngPixels) {
  const scale = image.width / 160
  const rows: number[][] = Array.from({ length: image.height }, () => [])
  const columns: number[][] = Array.from({ length: image.width }, () => [])
  let count = 0
  let sumX = 0
  let sumY = 0
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const offset = (y * image.width + x) * 4
      if (image.data[offset + 3] !== 255) {
        throw new Error('skew 像素几何缺少不透明画布')
      }
      // 边缘允许前景与背景之间的抗锯齿混色；任何其它颜色均不属于这个最小夹具。
      const coverage = (247 - image.data[offset]!) / (247 - 14)
      if (coverage < -0.02 || coverage > 1.02
        || Math.abs(image.data[offset + 1]! - (250 + (165 - 250) * coverage)) > 4
        || Math.abs(image.data[offset + 2]! - (251 + (233 - 251) * coverage)) > 4) {
        throw new Error('skew 像素几何存在非夹具颜色')
      }
      if (coverage >= 0.5) {
        rows[y]!.push(x)
        columns[x]!.push(y)
        count++
        sumX += (x + 0.5) / scale
        sumY += (y + 0.5) / scale
      }
    }
  }
  if (count / scale ** 2 < 1000) {
    throw new Error('skew 像素几何缺少完整主体')
  }
  const boundary = (lines: number[][]) => {
    const first = lines.findIndex(line => line.length > 0)
    const last = lines.findLastIndex(line => line.length > 0)
    if (first < 4 * scale || last >= lines.length - 4 * scale) {
      throw new Error('skew 像素几何主体被裁切')
    }
    for (let index = first; index <= last; index++) {
      const line = lines[index]!
      if (!line.length || line.at(-1)! - line[0]! + 1 !== line.length) {
        throw new Error('skew 像素几何主体不连续或存在孔洞')
      }
    }
    const start: Point[] = []
    const end: Point[] = []
    // 取边的中间一半以避开角点，按逻辑坐标回归，允许最多一个物理像素的栅格误差。
    for (let index = Math.ceil(first + (last - first) / 4); index <= Math.floor(first + (last - first) * 3 / 4); index++) {
      const line = lines[index]!
      start.push([(index + 0.5) / scale, line[0]! / scale])
      end.push([(index + 0.5) / scale, (line.at(-1)! + 1) / scale])
    }
    const edges = [fit(start), fit(end)] as const
    return { edges }
  }
  const horizontal = boundary(columns)
  const vertical = boundary(rows)
  const edges = [...vertical.edges, ...horizontal.edges]
  return {
    slopes: edges.map(edge => edge.slope),
    residual: Math.max(...edges.map(edge => edge.residual)),
    center: [sumX / count, sumY / count],
    area: count / scale ** 2,
    width: vertical.edges[1].middle - vertical.edges[0].middle,
    height: horizontal.edges[1].middle - horizontal.edges[0].middle,
  }
}

/** 两组平行边必须分别符合 skewX(6deg) 与 skewY(3deg)，不能仅凭包围盒变化判为支持。 */
export function evaluateSkewGeometry(probe: PngPixels, control: PngPixels) {
  const reference = silhouette(control)
  const actual = silhouette(probe)
  const near = (value: number, expected: number, tolerance: number) => Math.abs(value - expected) <= tolerance
  const shape = (value: typeof actual) => near(value.width, 96, 1.25) && near(value.height, 80, 1.25)
    && value.center.every(coordinate => near(coordinate, 80, 1))
    && value.residual <= 0.7 * 160 / probe.width
  if (!shape(reference) || reference.slopes.some(slope => Math.abs(slope) > 0.005)
    || !near(reference.area, 96 * 80, 96 * 80 * 0.025)) {
    throw new Error('skew 像素几何 control 必须是居中的 96×80 实心矩形')
  }
  // CSS 顺序矩阵与 Android Canvas 同时 skew 的差异小于 0.6px；固定角度容差不随原生结果调整。
  const slopes = [6, 6, 3, 3].map(degrees => Math.tan(degrees * Math.PI / 180))
  const passed = shape(actual) && near(actual.area / reference.area, 1, 0.04)
    && actual.slopes.every((slope, index) => near(slope, slopes[index]!, 0.015))
  return {
    passed,
    actual: JSON.stringify(actual, (_key, value) => typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value),
    expected: '居中的 96×80 实心主体，左右边斜率 tan(6deg)、上下边斜率 tan(3deg)，斜率误差≤0.015、面积变化≤4%',
  }
}
