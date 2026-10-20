package com.weapptailwindcss.lynxcompat;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

public final class MediaGateEvidenceTest {
  private static final byte[] BUNDLE = "media bundle".getBytes(StandardCharsets.UTF_8);
  private static final byte[] PNG = "native captured PNG".getBytes(StandardCharsets.UTF_8);
  private static final String[] IDS = {"base", "control", "unguarded", "min-width", "hover-hover", "hover-none"};
  private static String run(int number) { return String.format("00000000-0000-4000-8000-%012d", number); }
  private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
  private static EvidenceStore store(File root, int number) throws Exception {
    return new EvidenceStore(root, run(number), BUNDLE, EvidenceStore.sha256(BUNDLE));
  }
  interface Operation { void run() throws Exception; }
  private static void fails(Operation operation) throws Exception {
    try { operation.run(); } catch (IOException expected) { return; }
    throw new AssertionError("Expected rejected media evidence");
  }

  private static final class Host implements MediaGateEvidence.Host {
    final List<String> measured = new ArrayList<>(), captured = new ArrayList<>();
    String missingNode, missingImage, version = "4.0.1";
    double[] invalidRect;
    int versions;
    boolean main = true;
    public boolean isUiThread() { return main; }
    public String sdkVersion() { versions++; return version; }
    public String sdkArtifact() { return "{\"nativeFixture\":\"APK identity inspected by SdkArtifactIdentityTest\"}"; }
    public double[] measure(String id) {
      measured.add(id);
      if (id.equals(missingNode)) return null;
      if (invalidRect != null) return invalidRect;
      int width = id.startsWith("container-") ? 64 : id.endsWith("-unguarded") || id.endsWith("-min-width") ? 32 : 16;
      int height = id.startsWith("container-") ? 64 : 16;
      return new double[] {2, 3, 2 + width, 3 + height, width, height};
    }
    public byte[] capture(String id) { captured.add(id); return id.equals(missingImage) ? null : PNG; }
  }

  public static void main(String[] arguments) throws Exception {
    File root = new File(arguments[0], "android-media");
    EvidenceStore value = store(root, 1);
    Host host = new Host();
    MediaGateEvidence.Capture result = MediaGateEvidence.capture(value, run(1), host);
    check(host.versions == 1 && result.sdkVersion.equals("4.0.1"), "Read SDK once inside native capture");
    check(host.measured.size() == 12 && host.captured.size() == 6, "Independent native node capture");
    for (int index = 0; index < IDS.length; index++) {
      check(host.measured.contains("media-hover-v1-" + IDS[index]), "Fixed probe identity");
      check(host.captured.get(index).equals("container-media-hover-v1-" + IDS[index]), "Fixed composed container identity");
    }
    check(result.artifacts.size() == 7 && value.receipts().size() == 7, "Complete native receipts");
    File artifacts = new File(new File(root, run(1)), "artifacts");
    String json = Files.readString(new File(artifacts, "media-hover-v1.native.json").toPath());
    check(json.contains("\"source\":\"lynx-native-media-gate-v1\"") && json.contains("\"context\":{\"version\":1"), "Reserved native protocol");
    check(json.contains("\"sdkVersion\":\"4.0.1\"") && json.contains(run(1)) && json.contains(value.bundleSha256), "Native SDK and run identity");
    check(json.contains("\"sdkArtifact\":{\"nativeFixture\""), "Preserve independently collected APK identity in native sidecar");
    check(json.contains("\"id\":\"hover-none\"") && json.contains("\"width\":64.0"), "Actual complete probe payload");
    for (EvidenceStore.Receipt receipt : result.artifacts) {
      byte[] bytes = Files.readAllBytes(new File(artifacts, receipt.name).toPath());
      check(receipt.sha256.equals(EvidenceStore.sha256(bytes)) && receipt.byteLength == bytes.length, "Actual atomic artifact bytes");
    }
    value.publish(run(1), "{}");
    for (int index = 0; index < 18; index++) {
      final int number = 10 + index;
      EvidenceStore broken = store(root, number);
      Host fault = new Host();
      if (index < 12) fault.missingNode = (index % 2 == 0 ? "media-hover-v1-" : "container-media-hover-v1-") + IDS[index / 2];
      else fault.missingImage = "container-media-hover-v1-" + IDS[index - 12];
      fails(() -> MediaGateEvidence.capture(broken, run(number), fault));
      fails(() -> broken.publish(run(number), "{}"));
    }
    for (int index = 0; index < 4; index++) {
      final int number = 40 + index;
      EvidenceStore broken = store(root, number);
      Host fault = new Host();
      if (index == 0) fault.main = false;
      if (index == 1) fault.version = null;
      if (index == 2) fault.version = "forged\"version";
      if (index == 3) {
        File directory = new File(new File(root, run(number)), "artifacts");
        check(directory.delete() && directory.createNewFile(), "Inject media disk failure");
      }
      fails(() -> MediaGateEvidence.capture(broken, run(number), fault));
      fails(() -> broken.publish(run(number), "{}"));
    }
    EvidenceStore stale = store(root, 50);
    Host untouched = new Host();
    fails(() -> MediaGateEvidence.capture(stale, run(1), untouched));
    check(untouched.versions == 0 && untouched.measured.isEmpty(), "Reject old run before host access");
    EvidenceStore duplicate = store(root, 51);
    MediaGateEvidence.capture(duplicate, run(51), new Host());
    fails(() -> MediaGateEvidence.capture(duplicate, run(51), new Host()));
    fails(() -> duplicate.publish(run(51), "{}"));
    EvidenceStore js = store(root, 52);
    fails(() -> js.save(run(52), "media-hover-v1.native.json", PNG));
    fails(() -> js.publish(run(52), "{}"));
    double[][] invalidRects = {
      {0, 0, 16, 16, Double.NaN, 16}, {0, 0, 16, 16, Double.POSITIVE_INFINITY, 16},
      {0, 0, 16, 16, 0, 16}, {0, 0, 16, 16, 32, 16}, {0, 0, 16},
    };
    for (int index = 0; index < invalidRects.length; index++) {
      final int number = 60 + index;
      EvidenceStore broken = store(root, number);
      Host fault = new Host();
      fault.invalidRect = invalidRects[index];
      fails(() -> MediaGateEvidence.capture(broken, run(number), fault));
      fails(() -> broken.publish(run(number), "{}"));
    }
    EvidenceStore sidecarFailure = store(root, 70);
    File sidecar = new File(new File(new File(root, run(70)), "artifacts"), "media-hover-v1.native.json");
    Files.writeString(sidecar.toPath(), "do not replace prior evidence");
    fails(() -> MediaGateEvidence.capture(sidecarFailure, run(70), new Host()));
    fails(() -> sidecarFailure.publish(run(70), "{}"));
    check(Files.readString(sidecar.toPath()).equals("do not replace prior evidence"), "Do not overwrite existing native sidecar");
    EvidenceStore raw = store(root, 80);
    Host reported = new Host();
    reported.version = "0.0.1";
    MediaGateEvidence.Capture rawCapture = MediaGateEvidence.capture(raw, run(80), reported);
    check(rawCapture.sdkVersion.equals("0.0.1"), "Never replace raw SDK getter with Maven release version");
    System.out.println("Android media gate: native SDK, twelve node reads, seven receipts and fail-closed persistence passed");
  }
}
