package com.weapptailwindcss.lynxcompat;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;

public final class EvidenceStoreTest {
  private static final byte[] BUNDLE = "actual bundle".getBytes(StandardCharsets.UTF_8);
  private static final byte[] IMAGE = "actual PNG bytes".getBytes(StandardCharsets.UTF_8);

  private static void check(boolean value, String message) {
    if (!value) throw new AssertionError(message);
  }

  interface Operation { void run() throws Exception; }

  private static void fails(Operation operation) throws Exception {
    try { operation.run(); } catch (java.io.IOException expected) { return; }
    throw new AssertionError("Expected an I/O failure");
  }

  private static String run(int number) {
    return String.format("00000000-0000-4000-8000-%012d", number);
  }

  private static EvidenceStore store(File root, int number) throws Exception {
    return new EvidenceStore(root, run(number), BUNDLE, EvidenceStore.sha256(BUNDLE));
  }

  public static void main(String[] arguments) throws Exception {
    File root = new File(arguments[0], "android");
    EvidenceStore successful = store(root, 1);
    EvidenceStore.Receipt receipt = successful.save(run(1), "case-probe.png", IMAGE);
    check(receipt.runId.equals(run(1)) && receipt.name.equals("case-probe.png"), "Receipt identity");
    check(receipt.byteLength == IMAGE.length && receipt.sha256.equals(EvidenceStore.sha256(IMAGE)), "Receipt bytes");
    check(Arrays.equals(Files.readAllBytes(new File(new File(new File(root, run(1)), "artifacts"), "case-probe.png").toPath()), IMAGE), "Actual disk write");
    successful.publish(run(1), "{}");
    check(new File(new File(root, run(1)), "report.json").isFile(), "Published report");
    fails(() -> successful.publish(run(1), "{}"));
    fails(() -> store(root, 1));
    fails(() -> new EvidenceStore(root, run(2), BUNDLE, EvidenceStore.sha256(IMAGE)));
    fails(() -> new EvidenceStore(root, "../outside", BUNDLE, EvidenceStore.sha256(BUNDLE)));

    EvidenceStore broken = store(root, 3);
    File artifacts = new File(new File(root, run(3)), "artifacts");
    check(artifacts.delete() && artifacts.createNewFile(), "Inject actual filesystem failure");
    fails(() -> broken.save(run(3), "case-probe.png", IMAGE));
    fails(() -> broken.publish(run(3), "{}"));
    check(!new File(new File(root, run(3)), "report.json").exists(), "Failed run must not publish");

    EvidenceStore stale = store(root, 4);
    fails(() -> stale.save(run(1), "case-probe.png", IMAGE));
    fails(() -> stale.publish(run(4), "{}"));
    EvidenceStore duplicate = store(root, 5);
    duplicate.save(run(5), "case-probe.png", IMAGE);
    fails(() -> duplicate.save(run(5), "case-probe.png", IMAGE));
    fails(() -> duplicate.publish(run(5), "{}"));
    EvidenceStore invalid = store(root, 6);
    fails(() -> invalid.save(run(6), "C:\\escape.png", IMAGE));
    fails(() -> invalid.publish(run(6), "{}"));
    EvidenceStore invalidData = store(root, 7);
    fails(() -> invalidData.save(run(7), "case-probe.png", null));
    fails(() -> invalidData.publish(run(7), "{}"));
    System.out.println("Android evidence storage: actual writes, failures, identity and publication passed");
  }
}
