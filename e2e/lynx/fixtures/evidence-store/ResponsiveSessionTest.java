package com.weapptailwindcss.lynxcompat;

import java.util.ArrayList;
import java.util.List;

public final class ResponsiveSessionTest {
  private static final class Driver implements ResponsiveSession.Host, ResponsiveSession.Scheduler {
    boolean available = true, ignoreResize, failFlush;
    double width = 390, height = 800, threshold = 768;
    int restores, remembers, flushes;
    final List<Runnable> barriers = new ArrayList<>(), main = new ArrayList<>(), frames = new ArrayList<>(), deadlines = new ArrayList<>();
    public boolean valid() { return available; }
    public void remember() { remembers++; }
    public void resize(double w, double h) { if (!ignoreResize) { width = w; height = h; } }
    public void restore() { restores++; width = 390; height = 800; }
    public double[] viewport() { return new double[] {width, height, width, height, 2}; }
    public double[] threshold() { return new double[] {0, 0, threshold, 1, threshold, 1}; }
    public void barrier(Runnable callback) { barriers.add(callback); }
    public void flush() { if (failFlush) throw new IllegalStateException("flush"); flushes++; }
    public void frame(Runnable callback) { frames.add(callback); }
    public void main(Runnable callback) { main.add(callback); }
    public void later(Runnable callback, long milliseconds) { check(milliseconds < 2000, "native deadline"); deadlines.add(callback); }
    public void cancel(Runnable callback) { deadlines.remove(callback); }
    void complete() { barriers.remove(0).run(); main.remove(0).run(); if (!frames.isEmpty()) frames.remove(0).run(); }
  }
  private static void check(boolean condition, String reason) { if (!condition) throw new AssertionError(reason); }
  public static void main(String[] arguments) {
    Driver driver = new Driver();
    ResponsiveSession session = new ResponsiveSession("run", driver, driver);
    List<ResponsiveSession.Receipt> receipts = new ArrayList<>();
    session.capture("wrong", "responsive-1", "narrow", receipts::add);
    session.capture("run", "responsive-1", "wide", receipts::add);
    check(receipts.remove(0) == null && receipts.remove(0) == null && driver.remembers == 0, "identity and phase cannot mutate");
    session.capture("run", "responsive-1", "narrow", receipts::add);
    check(receipts.isEmpty() && driver.width == 384, "root resize before barrier");
    session.capture("run", "responsive-2", "wide", receipts::add);
    check(receipts.remove(0) == null, "single pending");
    driver.barriers.remove(0).run();
    check(receipts.isEmpty() && driver.flushes == 0, "return to main");
    driver.main.remove(0).run();
    check(receipts.isEmpty() && driver.flushes == 1, "await actual frame");
    driver.frames.remove(0).run();
    check(receipts.get(0).viewport[0] == 384 && receipts.get(0).threshold[4] == 768 && receipts.get(0).original[0] == 390, "actual root and marker receipt");
    session.capture("run", "responsive-1", "wide", receipts::add);
    check(receipts.remove(1) == null, "duplicate identity");
    session.capture("run", "responsive-2", "wide", receipts::add); driver.complete();
    session.capture("run", "responsive-3", "narrowed", receipts::add); driver.complete();
    session.capture("run", "responsive-4", "restored", receipts::add); driver.complete();
    check(receipts.size() == 4 && receipts.get(1).viewport[0] == 960 && receipts.get(2).viewport[0] == 384
      && receipts.get(3).viewport[0] == 390 && driver.restores == 1 && driver.remembers == 1, "wide narrow restore sequence");
    session.capture("run", "responsive-5", "narrow", receipts::add);
    check(receipts.get(4) == null, "completed session cannot restart");

    for (String fault : new String[] {"parent-only", "adaptive-rem", "timeout", "flush", "expired"}) {
      driver = new Driver(); session = new ResponsiveSession("run", driver, driver); receipts.clear();
      if (fault.equals("parent-only")) driver.ignoreResize = true;
      session.capture("run", "responsive-1", "narrow", receipts::add);
      if (fault.equals("adaptive-rem")) driver.threshold = 1000;
      if (fault.equals("timeout")) driver.deadlines.get(0).run();
      if (fault.equals("flush")) driver.failFlush = true;
      if (fault.equals("expired")) driver.available = false;
      driver.complete();
      check(receipts.size() == 1 && receipts.get(0) == null, "fault rejected once: " + fault);
      driver.available = true; driver.failFlush = false; driver.ignoreResize = false; driver.threshold = 768;
      session.capture("run", "responsive-2", "restored", receipts::add); driver.complete();
      check(receipts.size() == 2 && receipts.get(1) != null && driver.width == 390 && driver.restores == 1, "failure still restores: " + fault);
    }
    driver = new Driver(); session = new ResponsiveSession("run", driver, driver); receipts.clear();
    session.capture("run", "responsive-1", "narrow", receipts::add);
    session.invalidate(); driver.complete();
    check(receipts.size() == 1 && receipts.get(0) == null && driver.width == 390 && driver.restores == 1, "invalidated view restores and rejects late barrier");
    System.out.println("ResponsiveSession: real root, marker, barriers, frame, identity, deadlines and restore passed");
  }
}
