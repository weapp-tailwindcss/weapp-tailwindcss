package com.weapptailwindcss.lynxcompat;

import java.util.HashSet;
import java.util.Set;
import java.util.function.Consumer;

/** 串行更新真实根 viewport；回执在引擎屏障、刷新及下一绘制帧后读取。 */
final class ResponsiveSession {
  interface Host {
    boolean valid();
    void remember();
    void resize(double width, double height);
    void restore();
    double[] viewport();
    double[] threshold();
    void barrier(Runnable callback);
    void flush();
    void frame(Runnable callback);
  }
  interface Scheduler {
    void main(Runnable callback);
    void later(Runnable callback, long milliseconds);
    void cancel(Runnable callback);
  }
  static final class Receipt {
    final String runId, requestId, phase;
    final double[] original, requested, viewport, threshold;
    Receipt(String runId, String requestId, String phase, double[] original, double[] requested, double[] viewport, double[] threshold) {
      this.runId = runId; this.requestId = requestId; this.phase = phase;
      this.original = original.clone(); this.requested = requested.clone();
      this.viewport = viewport.clone(); this.threshold = threshold.clone();
    }
  }
  private static final String[] PHASES = {"narrow", "wide", "narrowed"};
  private final String runId;
  private final Host host;
  private final Scheduler scheduler;
  private final Set<String> seen = new HashSet<>();
  private double[] original;
  private double threshold;
  private int next;
  private Pending pending;
  private boolean invalidated, restored;
  private static final class Pending {
    String requestId, phase;
    double[] requested;
    Consumer<Receipt> callback;
    Runnable deadline;
  }

  ResponsiveSession(String runId, Host host, Scheduler scheduler) {
    this.runId = runId; this.host = host; this.scheduler = scheduler;
  }

  void capture(String run, String requestId, String phase, Consumer<Receipt> callback) {
    boolean restore = "restored".equals(phase);
    if (invalidated || restored || !host.valid() || !runId.equals(run) || pending != null
        || requestId == null || !requestId.matches("responsive-[1-9][0-9]*") || seen.contains(requestId)
        || (restore ? original == null : next >= PHASES.length || !PHASES[next].equals(phase))) {
      callback.accept(null); return;
    }
    seen.add(requestId);
    Pending request = new Pending();
    request.requestId = requestId; request.phase = phase; request.callback = callback;
    pending = request;
    request.deadline = () -> finish(request, null);
    scheduler.later(request.deadline, 1600);
    try {
      if (original == null) {
        double[] viewport = host.viewport();
        double[] marker = host.threshold();
        validate(viewport, 5); validate(marker, 6);
        original = new double[] {viewport[0], viewport[1]};
        threshold = marker[4];
        host.remember();
      }
      request.requested = new double[] {restore ? original[0] : Math.ceil(threshold * ("wide".equals(phase) ? 1.25 : 0.5)), original[1]};
      if (restore) host.restore(); else host.resize(request.requested[0], request.requested[1]);
      host.barrier(() -> scheduler.main(() -> {
        if (pending != request) return;
        try {
          if (!host.valid() || invalidated) { finish(request, null); return; }
          host.flush();
          host.frame(() -> complete(request));
        } catch (RuntimeException error) { finish(request, null); }
      }));
    } catch (RuntimeException error) { finish(request, null); }
  }

  private void complete(Pending request) {
    if (pending != request) return;
    try {
      if (!host.valid() || invalidated) { finish(request, null); return; }
      double[] viewport = host.viewport(), marker = host.threshold();
      validate(viewport, 5); validate(marker, 6);
      double tolerance = 1.01 / viewport[4];
      if (Math.abs(viewport[0] - request.requested[0]) > tolerance || Math.abs(viewport[1] - request.requested[1]) > tolerance
          || Math.abs(viewport[2] - viewport[0]) > tolerance || Math.abs(viewport[3] - viewport[1]) > tolerance
          || Math.abs(marker[4] - threshold) > tolerance) {
        finish(request, null); return;
      }
      Receipt receipt = new Receipt(runId, request.requestId, request.phase, original, request.requested, viewport, marker);
      if ("restored".equals(request.phase)) restored = true; else next++;
      finish(request, receipt);
    } catch (RuntimeException error) { finish(request, null); }
  }

  void invalidate() {
    invalidated = true;
    if (original != null && !restored && host.valid()) {
      try { host.restore(); host.flush(); } catch (RuntimeException error) { System.err.println("Lynx viewport cleanup failed: " + error); }
    }
    if (pending != null) finish(pending, null);
  }

  private void finish(Pending request, Receipt receipt) {
    if (pending != request) return;
    scheduler.cancel(request.deadline);
    pending = null;
    request.callback.accept(receipt);
  }

  private static void validate(double[] values, int length) {
    if (values == null || values.length != length) throw new IllegalStateException("Missing native viewport measurement");
    for (double value : values) if (!Double.isFinite(value)) throw new IllegalStateException("Invalid native viewport measurement");
    if (length == 5 && (values[0] <= 0 || values[1] <= 0 || values[2] <= 0 || values[3] <= 0 || values[4] <= 0)
        || length == 6 && (values[4] <= 0 || values[5] <= 0)) throw new IllegalStateException("Empty native viewport measurement");
  }
}
