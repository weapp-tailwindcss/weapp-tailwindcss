package com.weapptailwindcss.lynxcompat;

import android.content.Context;
import android.os.Build;
import android.os.Process;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** release 版本来自 Gradle 实际解析的 AAR，APK 与 ABI 字节来自当前运行宿主自身。 */
final class AndroidSdkIdentity {
  static String capture(Context context, EvidenceStore store) throws Exception {
    byte[] asset;
    try (InputStream input = context.getAssets().open("lynx-sdk-identity.json"); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192];
      int length;
      while ((length = input.read(buffer)) != -1) {
        if (output.size() + length > 65536) throw new IOException("Oversized resolved SDK asset");
        output.write(buffer, 0, length);
      }
      asset = output.toByteArray();
    }
    JSONObject resolved = new JSONObject(new String(asset, StandardCharsets.UTF_8));
    if (resolved.getInt("version") != 1 || !resolved.getString("source").equals("lynx-gradle-resolved-sdk-v1")
        || !resolved.getString("runId").equals(store.runId) || !resolved.getString("bundleSha256").equals(store.bundleSha256)) {
      throw new IOException("Resolved SDK asset belongs to a different run or bundle");
    }
    String[] abis = Process.is64Bit() ? Build.SUPPORTED_64_BIT_ABIS : Build.SUPPORTED_32_BIT_ABIS;
    if (abis.length == 0) throw new IOException("Current process ABI is unresolved");
    String abi = abis[0];
    SdkArtifactIdentity.Identity actual = SdkArtifactIdentity.inspect(new File(context.getApplicationInfo().sourceDir), abi, resolved.getJSONObject("libraries").getString(abi));
    JSONObject run = new JSONObject(new String(actual.context, StandardCharsets.UTF_8));
    if (!java.util.Arrays.equals(asset, actual.resolved) || run.getInt("version") != 1 || !run.getString("runId").equals(store.runId)
        || !run.getString("bundleSha256").equals(store.bundleSha256) || !actual.bundleSha256.equals(store.bundleSha256)) {
      throw new IOException("Running APK identity differs from staged assets");
    }
    JSONObject artifact = new JSONObject();
    artifact.put("resolved", resolved);
    artifact.put("apkSha256", actual.apkSha256);
    artifact.put("abi", abi);
    artifact.put("librarySha256", actual.librarySha256);
    return artifact.toString();
  }
}
