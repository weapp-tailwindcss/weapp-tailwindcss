package com.weapptailwindcss.lynxcompat;

import com.lynx.tasm.LynxView;
import java.lang.ref.WeakReference;

/** 通过模块参数注入，每个视图独占一次绑定；旧模块永远不能转向新视图或新存储。 */
final class ReporterBinding {
  final EvidenceStore store;
  private WeakReference<LynxView> view = new WeakReference<>(null);
  private volatile boolean closed;
  ColorSchemeSession colorScheme;
  ResponsiveSession responsive;

  ReporterBinding(EvidenceStore store) { this.store = store; }

  void attach(LynxView target) {
    if (closed || colorScheme != null || target == null) throw new IllegalStateException("Binding is single use");
    view = new WeakReference<>(target);
    ColorSchemeHost host = new ColorSchemeHost(target);
    colorScheme = new ColorSchemeSession(store.runId, host, host);
    ResponsiveHost viewportHost = new ResponsiveHost(target);
    responsive = new ResponsiveSession(store.runId, viewportHost, viewportHost);
  }

  LynxView view() { return closed ? null : view.get(); }

  void invalidate() {
    closed = true;
    if (colorScheme != null) colorScheme.invalidate();
    if (responsive != null) responsive.invalidate();
    view.clear();
  }
}
