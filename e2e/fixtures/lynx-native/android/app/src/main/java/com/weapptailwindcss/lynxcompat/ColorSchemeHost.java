package com.weapptailwindcss.lynxcompat;

import android.os.Handler;
import android.os.Looper;
import com.lynx.tasm.LynxColorScheme;
import com.lynx.tasm.LynxView;
import com.lynx.tasm.ThreadStrategyForRendering;
import java.lang.ref.WeakReference;

final class ColorSchemeHost implements ColorSchemeSession.Host, ColorSchemeSession.Scheduler {
  private final WeakReference<LynxView> view;
  private final Handler main = new Handler(Looper.getMainLooper());

  ColorSchemeHost(LynxView view) {
    this.view = new WeakReference<>(view);
  }

  public boolean valid() {
    LynxView target = view.get();
    return target != null && target.getThreadStrategyForRendering() == ThreadStrategyForRendering.ALL_ON_UI;
  }

  public void update(String scheme) {
    view.get().updateColorScheme("dark".equals(scheme) ? LynxColorScheme.DARK : LynxColorScheme.LIGHT);
  }

  public void barrier(Runnable callback) {
    view.get().runOnTasmThread(callback);
  }

  public void flush() {
    view.get().syncFlush();
  }

  public void main(Runnable callback) { main.post(callback); }
  public void later(Runnable callback, long milliseconds) { main.postDelayed(callback, milliseconds); }
  public void cancel(Runnable callback) { main.removeCallbacks(callback); }
}
