package com.weapptailwindcss.lynxcompat;

final class GeometryBounds {
  private GeometryBounds() {}

  // 四角包含节点与祖先 View 矩阵、滚动及屏幕偏移；Canvas 绘制变换另用像素证据验证。
  static double[] fromCorners(float[][] corners, float density) {
    if (!Float.isFinite(density) || density <= 0 || corners == null || corners.length != 4) {
      return null;
    }
    double left = Double.POSITIVE_INFINITY;
    double top = Double.POSITIVE_INFINITY;
    double right = Double.NEGATIVE_INFINITY;
    double bottom = Double.NEGATIVE_INFINITY;
    for (float[] corner : corners) {
      if (corner == null || corner.length != 2 || !Float.isFinite(corner[0]) || !Float.isFinite(corner[1])) {
        return null;
      }
      left = Math.min(left, corner[0]);
      right = Math.max(right, corner[0]);
      top = Math.min(top, corner[1]);
      bottom = Math.max(bottom, corner[1]);
    }
    if (right <= left || bottom <= top) {
      return null;
    }
    return new double[] {
      left / density, top / density, right / density, bottom / density,
      (right - left) / density, (bottom - top) / density,
    };
  }
}
