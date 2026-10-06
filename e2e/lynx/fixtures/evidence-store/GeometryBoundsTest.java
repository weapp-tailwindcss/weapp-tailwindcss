package com.weapptailwindcss.lynxcompat;

public final class GeometryBoundsTest {
  private static void check(float[][] corners, float density, double... expected) {
    double[] actual = GeometryBounds.fromCorners(corners, density);
    if (actual == null || actual.length != expected.length) throw new AssertionError("Missing rectangle");
    for (int index = 0; index < actual.length; index++) {
      if (Math.abs(actual[index] - expected[index]) > 0.00001) {
        throw new AssertionError("Coordinate " + index + ": " + actual[index] + " != " + expected[index]);
      }
    }
  }

  private static void rejects(float[][] corners, float density) {
    if (GeometryBounds.fromCorners(corners, density) != null) throw new AssertionError("Accepted invalid geometry");
  }

  public static void main(String[] arguments) {
    // 90 度旋转和负缩放不能沿用布局宽高，也不能假定左上/右下角就是边界。
    check(new float[][] {{60, 90}, {60, 170}, {20, 170}, {20, 90}}, 1, 20, 90, 60, 170, 40, 80);
    check(new float[][] {{100, 50}, {20, 50}, {20, 90}, {100, 90}}, 1, 20, 50, 100, 90, 80, 40);
    // 旋转 45 度时，边界来自四个不同顶点，只取一条对角线会丢失高度。
    check(new float[][] {{0, 10}, {10, 0}, {20, 10}, {10, 20}}, 1, 0, 0, 20, 20, 20, 20);
    // 屏幕上的小数坐标不能先写入整数 Rect，非整数 density 也不能截断。
    float[][] fractional = {{3.9375f, 5.90625f}, {108.9375f, 5.90625f}, {108.9375f, 215.90625f}, {3.9375f, 215.90625f}};
    check(fractional, 2.625f, 1.5, 2.25, 41.5, 82.25, 40, 80);
    check(new float[][] {{-20, -30}, {60, -30}, {60, 10}, {-20, 10}}, 2, -10, -15, 30, 5, 40, 20);
    rejects(fractional, 0);
    rejects(fractional, -1);
    rejects(fractional, Float.NaN);
    rejects(fractional, Float.POSITIVE_INFINITY);
    rejects(null, 1);
    rejects(new float[][] {{0, 0}}, 1);
    rejects(new float[][] {{0, 0}, null, {1, 1}, {0, 1}}, 1);
    rejects(new float[][] {{0, 0}, {1}, {1, 1}, {0, 1}}, 1);
    rejects(new float[][] {{0, 0}, {Float.NaN, 0}, {1, 1}, {0, 1}}, 1);
    rejects(new float[][] {{0, 0}, {Float.POSITIVE_INFINITY, 0}, {1, 1}, {0, 1}}, 1);
    rejects(new float[][] {{0, 0}, {0, 0}, {0, 1}, {0, 1}}, 1);
    System.out.println("GeometryBounds: 5 valid transformations and 11 invalid inputs passed");
  }
}
