package com.weapptailwindcss.lynxcompat;

import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import com.lynx.tasm.LynxView;
import com.lynx.tasm.ThreadStrategyForRendering;
import com.lynx.tasm.behavior.ui.LynxBaseUI;
import java.lang.ref.WeakReference;

final class ResponsiveHost implements ResponsiveSession.Host, ResponsiveSession.Scheduler {
  private final WeakReference<LynxView> view;
  private final Handler main = new Handler(Looper.getMainLooper());
  private int originalWidth, originalHeight, left, top, width, height;
  private boolean remembered;
  ResponsiveHost(LynxView view) { this.view = new WeakReference<>(view); }
  public boolean valid() {
    LynxView target = view.get();
    return target != null && target.getThreadStrategyForRendering() == ThreadStrategyForRendering.ALL_ON_UI;
  }
  private float scale() { return view.get().getLynxContext().getScreenMetrics().density; }
  public void remember() {
    if (remembered) throw new IllegalStateException("Viewport already remembered");
    LynxView target = view.get();
    ViewGroup.LayoutParams params = target.getLayoutParams();
    originalWidth = params.width; originalHeight = params.height;
    left = target.getLeft(); top = target.getTop(); width = target.getWidth(); height = target.getHeight();
    remembered = true;
  }
  public void resize(double width, double height) {
    apply((int) Math.round(width * scale()), (int) Math.round(height * scale()), false);
  }
  public void restore() { apply(width, height, true); }
  private void apply(int width, int height, boolean restore) {
    LynxView target = view.get();
    ViewGroup.LayoutParams params = target.getLayoutParams();
    params.width = restore ? originalWidth : width;
    params.height = restore ? originalHeight : height;
    target.setLayoutParams(params);
    int w = View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY);
    int h = View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY);
    target.measure(w, h);
    target.layout(left, top, left + width, top + height);
    // 同时更新实际根尺寸和引擎的 definite viewport；screenMetrics 不替代该调用。
    target.updateViewport(w, h, true);
  }
  public double[] viewport() {
    LynxView target = view.get();
    double scale = scale();
    return new double[] {target.getWidth() / scale, target.getHeight() / scale,
      target.getMeasuredWidth() / scale, target.getMeasuredHeight() / scale, scale};
  }
  public double[] threshold() {
    LynxBaseUI ui = view.get().findUIByIdSelector("responsive-threshold");
    if (ui == null) return null;
    LynxBaseUI.TransOffset corners = ui.getTransformValue(0, 0, 0, 0);
    return GeometryBounds.fromCorners(new float[][] {corners.left_top, corners.right_top, corners.right_bottom, corners.left_bottom}, scale());
  }
  public void barrier(Runnable callback) { view.get().runOnTasmThread(callback); }
  public void flush() { view.get().syncFlush(); }
  public void frame(Runnable callback) { view.get().postOnAnimation(callback); }
  public void main(Runnable callback) { main.post(callback); }
  public void later(Runnable callback, long milliseconds) { main.postDelayed(callback, milliseconds); }
  public void cancel(Runnable callback) { main.removeCallbacks(callback); }
}
