package com.weapptailwindcss.lynxcompat;

import java.util.HashSet;
import java.util.Set;
import java.util.function.Consumer;

/** 所有入口在主线程执行；队列回调通过调度器回主线程后再次核对请求身份。 */
final class ColorSchemeSession {
  interface Host {
    boolean valid();
    void update(String scheme);
    void barrier(Runnable callback);
    void flush();
  }

  interface Scheduler {
    void main(Runnable callback);
    void later(Runnable callback, long milliseconds);
    void cancel(Runnable callback);
  }

  static final class Receipt {
    final String runId;
    final String requestId;
    final String scheme;
    Receipt(String runId, String requestId, String scheme) {
      this.runId = runId;
      this.requestId = requestId;
      this.scheme = scheme;
    }
  }

  private final String runId;
  private final Host host;
  private final Scheduler scheduler;
  private final Set<String> seen = new HashSet<>();
  private Pending pending;
  private Receipt current;
  private boolean invalidated;

  private static final class Pending {
    final Receipt receipt;
    final Consumer<Receipt> callback;
    Runnable deadline;
    Pending(Receipt receipt, Consumer<Receipt> callback) {
      this.receipt = receipt;
      this.callback = callback;
    }
  }

  ColorSchemeSession(String runId, Host host, Scheduler scheduler) {
    this.runId = runId;
    this.host = host;
    this.scheduler = scheduler;
  }

  void set(String run, String requestId, String scheme, Consumer<Receipt> callback) {
    if (invalidated || !host.valid() || !runId.equals(run) || pending != null
        || requestId == null || requestId.isEmpty() || seen.contains(requestId)
        || !("light".equals(scheme) || "dark".equals(scheme))) {
      callback.accept(null);
      return;
    }
    seen.add(requestId);
    current = null;
    Pending request = new Pending(new Receipt(run, requestId, scheme), callback);
    pending = request;
    request.deadline = () -> finish(request, false);
    scheduler.later(request.deadline, 1200);
    try {
      host.update(scheme);
      host.barrier(() -> scheduler.main(() -> {
        if (pending != request) return;
        if (invalidated || !host.valid()) {
          finish(request, false);
          return;
        }
        try {
          host.flush();
          finish(request, true);
        } catch (RuntimeException error) {
          finish(request, false);
        }
      }));
    } catch (RuntimeException error) {
      finish(request, false);
    }
  }

  boolean isCurrent(String run, String requestId) {
    return !invalidated && host.valid() && pending == null && current != null
      && current.runId.equals(run) && current.requestId.equals(requestId);
  }

  void invalidate() {
    invalidated = true;
    current = null;
    if (pending != null) finish(pending, false);
  }

  private void finish(Pending request, boolean success) {
    if (pending != request) return;
    scheduler.cancel(request.deadline);
    pending = null;
    current = success ? request.receipt : null;
    request.callback.accept(current);
  }
}
