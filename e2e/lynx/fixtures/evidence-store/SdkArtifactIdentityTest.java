package com.weapptailwindcss.lynxcompat;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public final class SdkArtifactIdentityTest {
  private static final byte[] LIBRARY = "synthetic native library".getBytes(StandardCharsets.UTF_8);
  private static final byte[] BUNDLE = "synthetic current bundle".getBytes(StandardCharsets.UTF_8);
  private static final byte[] RESOLVED = "{\"artifactVersion\":\"4.0.1\"}".getBytes(StandardCharsets.UTF_8);
  private static final byte[] CONTEXT = "{\"runId\":\"current\"}".getBytes(StandardCharsets.UTF_8);
  interface Operation { void run() throws Exception; }
  private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
  private static void fails(Operation operation) throws Exception {
    try { operation.run(); } catch (IOException expected) { return; }
    throw new AssertionError("Expected rejected native APK identity");
  }
  private static File apk(File root, String name, String missing, byte[] library) throws Exception {
    File file = new File(root, name + ".apk");
    String[] names = {"lib/x86_64/liblynx.so", "assets/main.lynx.bundle", "assets/lynx-sdk-identity.json", "assets/run-context.json"};
    byte[][] values = {library, BUNDLE, RESOLVED, CONTEXT};
    try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(file.toPath()))) {
      for (int index = 0; index < names.length; index++) {
        if (names[index].equals(missing)) continue;
        output.putNextEntry(new ZipEntry(names[index]));
        output.write(values[index]);
        output.closeEntry();
      }
    }
    return file;
  }
  public static void main(String[] arguments) throws Exception {
    File root = new File(arguments[0], "android-sdk");
    check(root.mkdirs(), "Create isolated APK fixture directory");
    File good = apk(root, "current", null, LIBRARY);
    SdkArtifactIdentity.Identity result = SdkArtifactIdentity.inspect(good, "x86_64", EvidenceStore.sha256(LIBRARY));
    check(result.apkSha256.equals(EvidenceStore.sha256(Files.readAllBytes(good.toPath()))), "Hash actual APK bytes");
    check(result.librarySha256.equals(EvidenceStore.sha256(LIBRARY)), "Hash exact current ABI library");
    check(result.bundleSha256.equals(EvidenceStore.sha256(BUNDLE)), "Hash embedded actual bundle");
    check(java.util.Arrays.equals(result.resolved, RESOLVED) && java.util.Arrays.equals(result.context, CONTEXT), "Return raw embedded identities");
    fails(() -> SdkArtifactIdentity.inspect(good, "../escape", EvidenceStore.sha256(LIBRARY)));
    fails(() -> SdkArtifactIdentity.inspect(good, "arm64-v8a", EvidenceStore.sha256(LIBRARY)));
    fails(() -> SdkArtifactIdentity.inspect(good, "x86_64", "not a digest"));
    File changed = apk(root, "changed-library", null, "different code".getBytes(StandardCharsets.UTF_8));
    fails(() -> SdkArtifactIdentity.inspect(changed, "x86_64", EvidenceStore.sha256(LIBRARY)));
    String[] missing = {"lib/x86_64/liblynx.so", "assets/main.lynx.bundle", "assets/lynx-sdk-identity.json", "assets/run-context.json"};
    for (int index = 0; index < missing.length; index++) {
      File absent = apk(root, "missing-" + index, missing[index], LIBRARY);
      fails(() -> SdkArtifactIdentity.inspect(absent, "x86_64", EvidenceStore.sha256(LIBRARY)));
    }
    File invalid = new File(root, "invalid.apk");
    Files.writeString(invalid.toPath(), "not a ZIP archive");
    fails(() -> SdkArtifactIdentity.inspect(invalid, "x86_64", EvidenceStore.sha256(LIBRARY)));
    System.out.println("Android SDK identity: actual APK, ABI library, embedded bundle and missing/tampered bytes passed");
  }
}
