package com.weapptailwindcss.lynxcompat;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

public final class GeometryEvidenceTest {
  private static final byte[] BUNDLE = "geometry bundle".getBytes(StandardCharsets.UTF_8);
  private static final byte[] PNG = "native captured PNG".getBytes(StandardCharsets.UTF_8);
  private static String run(int number) { return String.format("00000000-0000-4000-8000-%012d", number); }
  private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
  private static EvidenceStore store(File root, int number) throws Exception {
    return new EvidenceStore(root, run(number), BUNDLE, EvidenceStore.sha256(BUNDLE));
  }
  interface Operation { void run() throws Exception; }
  private static void fails(Operation operation) throws Exception {
    try { operation.run(); } catch (IOException expected) { return; }
    throw new AssertionError("Expected rejected native geometry");
  }

  private static final class Host implements GeometryEvidence.Host {
    final List<String> measured = new ArrayList<>();
    final List<String> captured = new ArrayList<>();
    double[] rect = {3, 5, 13, 25, 10, 20};
    boolean missing;
    double[] screen = {375, 812, 3};
    boolean changedScreen;
    public double[] measure(String id) { measured.add(id); return rect; }
    public byte[] capture(String id) { captured.add(id); if (changedScreen) screen[0]++; return missing ? null : PNG; }
    public double[] screenMetrics() { return screen; }
  }

  public static void main(String[] arguments) throws Exception {
    File root = new File(arguments[0], "android-geometry");
    EvidenceStore store = store(root, 1);
    Host host = new Host();
    GeometryEvidence.Capture result = GeometryEvidence.capture(store, run(1), "sizing-fixed", host);
    check(host.measured.size() == 6 && host.measured.get(5).equals("probe-child-control-sizing-fixed-a"), "Independent six-node lookup");
    check(host.captured.size() == 2 && host.captured.get(0).equals("probe-container-sizing-fixed"), "Capture composed containers");
    check(result.artifacts.size() == 3 && store.receipts().size() == 3, "Native artifact receipts");
    File artifacts = new File(new File(root, run(1)), "artifacts");
    String json = Files.readString(new File(artifacts, "sizing-fixed-geometry.json").toPath());
    check(json.contains("\"source\":\"lynx-native-host-geometry-v1\"") && json.contains("\"platform\":\"android\""), "Fixed native protocol");
    check(json.contains("\"runId\":\"" + run(1) + "\"") && json.contains(store.bundleSha256), "Native-owned identity");
    check(json.contains("\"probe\":{\"left\":3.0,\"top\":5.0,\"right\":13.0,\"bottom\":25.0,\"width\":10.0,\"height\":20.0}"), "Measured sidecar coordinates");
    check(json.contains("\"screenMetrics\":{\"version\":1,\"source\":\"lynx-native-screen-v1\",\"width\":375.0,\"height\":812.0,\"pixelRatio\":3.0}"), "Native-owned screen parameters");
    for (EvidenceStore.Receipt receipt : result.artifacts) {
      byte[] bytes = Files.readAllBytes(new File(artifacts, receipt.name).toPath());
      check(receipt.sha256.equals(EvidenceStore.sha256(bytes)) && receipt.byteLength == bytes.length, "Actual committed bytes");
    }
    host.rect[0] = 100;
    check(result.geometry.get("probe")[0] == 3, "Snapshot host values");
    store.publish(run(1), "{}");

    for (int index = 0; index < 6; index++) {
      final int number = index + 10;
      EvidenceStore invalid = store(root, number);
      Host broken = new Host();
      if (index == 0) broken.rect = null;
      if (index == 1) broken.rect = new double[] {0, 0, 1, 1, Double.NaN, 1};
      if (index == 2) broken.rect = new double[] {0, 0, 1, 1, 0, 1};
      if (index == 3) broken.rect = new double[] {0, 0, 1, 1, 20, 1};
      if (index == 4) broken.missing = true;
      if (index == 5) {
        File directory = new File(new File(root, run(number)), "artifacts");
        check(directory.delete() && directory.createNewFile(), "Inject disk failure");
      }
      fails(() -> GeometryEvidence.capture(invalid, run(number), "sizing-fixed", broken));
      fails(() -> invalid.publish(run(number), "{}"));
    }
    EvidenceStore stale = store(root, 20);
    Host untouched = new Host();
    fails(() -> GeometryEvidence.capture(stale, run(1), "sizing-fixed", untouched));
    check(untouched.measured.isEmpty(), "Reject identity before touching host");
    EvidenceStore traversal = store(root, 21);
    fails(() -> GeometryEvidence.capture(traversal, run(21), "../outside", untouched));
    EvidenceStore duplicate = store(root, 22);
    GeometryEvidence.capture(duplicate, run(22), "sizing-fixed", new Host());
    fails(() -> GeometryEvidence.capture(duplicate, run(22), "sizing-fixed", new Host()));
    fails(() -> duplicate.publish(run(22), "{}"));
    EvidenceStore js = store(root, 23);
    fails(() -> js.save(run(23), "sizing-fixed-geometry.json", PNG));
    for (int index = 0; index < 7; index++) {
      final int number = 30 + index;
      EvidenceStore invalid = store(root, number);
      Host broken = new Host();
      if (index == 0) broken.screen = null;
      if (index == 1) broken.screen = new double[] {375, 812};
      if (index == 2) broken.screen[0] = Double.NaN;
      if (index == 3) broken.screen[1] = Double.POSITIVE_INFINITY;
      if (index == 4) broken.screen[2] = 0;
      if (index == 5) broken.screen[2] = -1;
      if (index == 6) broken.changedScreen = true;
      fails(() -> GeometryEvidence.capture(invalid, run(number), "sizing-fixed", broken));
      fails(() -> invalid.publish(run(number), "{}"));
    }
    System.out.println("Android host geometry: independent reads, disk receipts and fail-closed publication passed");
  }
}
