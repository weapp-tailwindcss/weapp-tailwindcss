package com.weapptailwindcss.lynxcompat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 只从原生 SDK 和节点采集无伪状态的媒体帧，不接受 JS 的版本或坐标。 */
public final class MediaGateEvidence {
  public interface Host {
    boolean isUiThread();
    String sdkVersion();
    double[] measure(String identifier) throws Exception;
    byte[] capture(String identifier) throws Exception;
  }

  public static final class Capture {
    public final String sdkVersion;
    public final Map<String, double[][]> probes;
    public final List<EvidenceStore.Receipt> artifacts;

    Capture(String sdkVersion, Map<String, double[][]> probes, List<EvidenceStore.Receipt> artifacts) {
      this.sdkVersion = sdkVersion;
      this.probes = probes;
      this.artifacts = artifacts;
    }
  }

  public static final String LIMITATION = "lynx4.0.1-media-hover-unknown-v1";
  private static final String[] IDS = {"base", "control", "unguarded", "min-width", "hover-hover", "hover-none"};
  private static final String[] FIELDS = {"left", "top", "right", "bottom", "width", "height"};

  public static Capture capture(EvidenceStore store, String runId, Host host) throws Exception {
    try {
      store.checkRun(runId);
      if (host == null || !host.isUiThread()) throw new IOException("Native media capture requires UI thread");
      String sdkVersion = host.sdkVersion();
      if (sdkVersion == null || !sdkVersion.matches("[0-9]+\\.[0-9]+\\.[0-9]+")) {
        throw new IOException("Native Lynx SDK did not provide a valid version");
      }
      Map<String, double[][]> probes = new LinkedHashMap<>();
      for (String id : IDS) {
        double[] probe = host.measure("media-hover-v1-" + id);
        double[] container = host.measure("container-media-hover-v1-" + id);
        validate(probe);
        validate(container);
        probes.put(id, new double[][] {probe.clone(), container.clone()});
      }
      List<EvidenceStore.Receipt> artifacts = new ArrayList<>();
      for (String id : IDS) {
        byte[] image = host.capture("container-media-hover-v1-" + id);
        artifacts.add(store.save(runId, "media-hover-v1-" + id + ".png", image));
      }
      String mediaGate = "{\"limitationId\":\"" + LIMITATION + "\",\"runId\":\"" + store.runId
          + "\",\"bundleSha256\":\"" + store.bundleSha256 + "\",\"sdkVersion\":\"" + sdkVersion
          + "\",\"probes\":" + jsonProbes(probes) + "}";
      String sidecar = "{\"version\":1,\"source\":\"lynx-native-media-gate-v1\",\"context\":{\"version\":1,\"runId\":\""
          + store.runId + "\",\"bundleSha256\":\"" + store.bundleSha256 + "\"},\"mediaGate\":" + mediaGate + "}";
      artifacts.add(store.saveMediaGate(runId, sidecar.getBytes(StandardCharsets.UTF_8)));
      return new Capture(sdkVersion, probes, artifacts);
    } catch (Exception error) {
      store.fail();
      throw error;
    }
  }

  private static void validate(double[] rect) throws IOException {
    if (rect == null || rect.length != 6) throw new IOException("Missing native media geometry");
    for (double value : rect) if (!Double.isFinite(value)) throw new IOException("Non-finite media geometry");
    if (rect[4] <= 0 || rect[5] <= 0 || Math.abs(rect[2] - rect[0] - rect[4]) > 0.01
        || Math.abs(rect[3] - rect[1] - rect[5]) > 0.01) throw new IOException("Empty or inconsistent media geometry");
  }

  private static String jsonProbes(Map<String, double[][]> probes) {
    StringBuilder result = new StringBuilder("[");
    for (String id : IDS) {
      if (result.length() > 1) result.append(',');
      double[][] pair = probes.get(id);
      result.append("{\"id\":\"").append(id).append("\",\"probe\":").append(jsonRect(pair[0]))
          .append(",\"container\":").append(jsonRect(pair[1])).append('}');
    }
    return result.append(']').toString();
  }

  private static String jsonRect(double[] rect) {
    StringBuilder result = new StringBuilder("{");
    for (int index = 0; index < FIELDS.length; index++) {
      if (index > 0) result.append(',');
      result.append('"').append(FIELDS[index]).append("\":").append(rect[index]);
    }
    return result.append('}').toString();
  }
}
