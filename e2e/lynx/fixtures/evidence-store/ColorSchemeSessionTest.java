package com.weapptailwindcss.lynxcompat;

import java.util.ArrayList;
import java.util.List;

public final class ColorSchemeSessionTest {
  private static final class Driver implements ColorSchemeSession.Host, ColorSchemeSession.Scheduler {
    boolean valid = true;
    boolean failFlush;
    int updates;
    int flushes;
    final List<Runnable> barriers = new ArrayList<>();
    final List<Runnable> main = new ArrayList<>();
    final List<Runnable> deadlines = new ArrayList<>();
    public boolean valid() { return valid; }
    public void update(String scheme) { updates++; }
    public void barrier(Runnable task) { barriers.add(task); }
    public void flush() {
      if (failFlush) throw new IllegalStateException("flush failed");
      flushes++;
    }
    public void main(Runnable task) { main.add(task); }
    public void later(Runnable task, long milliseconds) {
      check(milliseconds < 2000, "native deadline must precede JS timeout");
      deadlines.add(task);
    }
    public void cancel(Runnable task) { deadlines.remove(task); }
    void complete(int index) { barriers.get(index).run(); main.remove(0).run(); }
  }

  private static void check(boolean condition, String reason) {
    if (!condition) throw new AssertionError(reason);
  }

  public static void main(String[] arguments) {
    Driver driver = new Driver();
    ColorSchemeSession session = new ColorSchemeSession("run", driver, driver);
    List<ColorSchemeSession.Receipt> receipts = new ArrayList<>();
    session.set("run", "one", "light", receipts::add);
    check(receipts.isEmpty() && !session.isCurrent("run", "one"), "must await engine");
    session.set("run", "busy", "dark", receipts::add);
    check(receipts.remove(0) == null && driver.updates == 1, "busy must not mutate scheme");
    driver.barriers.get(0).run();
    check(receipts.isEmpty() && driver.flushes == 0, "engine barrier must return to main");
    driver.main.remove(0).run();
    check(receipts.get(0).requestId.equals("one") && receipts.get(0).scheme.equals("light"), "receipt identity");
    check(session.isCurrent("run", "one") && !session.isCurrent("other", "one"), "capture binding");
    check(driver.flushes == 1 && driver.deadlines.isEmpty(), "flush before acknowledgement and cancel deadline");
    session.set("run", "same", "light", receipts::add);
    check(receipts.size() == 1 && !session.isCurrent("run", "one"), "same scheme still needs barrier");
    driver.complete(1);
    check(receipts.size() == 2 && driver.flushes == 2, "same scheme acknowledged");
    session.set("run", "late", "dark", receipts::add);
    Runnable timeout = driver.deadlines.get(0);
    timeout.run();
    check(receipts.size() == 3 && receipts.get(2) == null, "deadline must reject");
    session.set("run", "restore", "light", receipts::add);
    driver.complete(2);
    check(driver.flushes == 2 && receipts.size() == 3, "late callback must not flush or acknowledge next request");
    driver.complete(3);
    timeout.run();
    check(receipts.size() == 4 && session.isCurrent("run", "restore"), "restore survives late deadline");
    int count = driver.updates;
    session.set("other", "foreign", "dark", receipts::add);
    session.set("run", "restore", "dark", receipts::add);
    session.set("run", "invalid", "system", receipts::add);
    check(driver.updates == count && receipts.subList(4, 7).stream().allMatch(value -> value == null), "invalid identities cannot mutate");
    session.set("run", "destroy", "dark", receipts::add);
    session.invalidate();
    driver.complete(4);
    check(receipts.size() == 8 && receipts.get(7) == null && !session.isCurrent("run", "restore"), "destroy rejects pending and late callback");
    ColorSchemeSession replacement = new ColorSchemeSession("new", driver, driver);
    replacement.set("new", "replaced", "light", receipts::add);
    driver.valid = false;
    driver.complete(5);
    check(receipts.size() == 9 && receipts.get(8) == null, "view replacement rejects before flush");
    driver.valid = true;
    driver.failFlush = true;
    replacement.set("new", "flush-error", "dark", receipts::add);
    driver.complete(6);
    check(receipts.size() == 10 && receipts.get(9) == null, "flush failure is missing evidence");
    System.out.println("ColorSchemeSession: barriers, deadlines, restore, identity and view lifecycle passed");
  }
}
