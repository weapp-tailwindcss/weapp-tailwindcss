package com.weapptailwindcss.lynxcompat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 独立读取宿主节点并保存几何与像素；不接受 JS 报告中的坐标。 */
public final class GeometryEvidence {
  public interface Host {
    double[] measure(String identifier) throws Exception;
    byte[] capture(String identifier) throws Exception;
    default double[] screenMetrics() throws Exception { return null; }
  }

  public static final class Capture {
    public final Map<String, double[]> geometry;
    public final List<EvidenceStore.Receipt> artifacts;
    public final double[] screenMetrics;

    Capture(Map<String, double[]> geometry, List<EvidenceStore.Receipt> artifacts, double[] screenMetrics) {
      this.geometry = geometry;
      this.artifacts = artifacts;
      this.screenMetrics = screenMetrics == null ? null : screenMetrics.clone();
    }
  }

  private static final String[] FIELDS = {
    "probe", "control", "probeContainer", "controlContainer", "probeChild", "controlChild",
  };
  private static final String[] RECT_FIELDS = {"left", "top", "right", "bottom", "width", "height"};

  public static Capture capture(EvidenceStore store, String runId, String id, Host host) throws Exception {
    try {
      store.checkRun(runId);
      if (id == null || !id.matches("[a-z0-9]+(?:-[a-z0-9]+)*")) {
        throw new IOException("Invalid geometry case ID");
      }
      double[] measuredScreen = host.screenMetrics();
      double[] screen = measuredScreen == null ? null : measuredScreen.clone();
      if (screen != null || "sizing-fixed".equals(id)) validateScreen(screen);
      String[] identifiers = {
        "probe-" + id, "control-" + id, "probe-container-" + id, "control-container-" + id,
        "probe-child-" + id + "-a", "probe-child-control-" + id + "-a",
      };
      Map<String, double[]> geometry = new LinkedHashMap<>();
      for (int index = 0; index < FIELDS.length; index++) {
        double[] rect = host.measure(identifiers[index]);
        validate(rect);
        geometry.put(FIELDS[index], rect.clone());
      }
      byte[] probe = host.capture(identifiers[2]);
      byte[] control = host.capture(identifiers[3]);
      if (!java.util.Arrays.equals(screen, host.screenMetrics())) throw new IOException("Native screen changed during geometry capture");
      List<EvidenceStore.Receipt> artifacts = new ArrayList<>();
      artifacts.add(store.save(runId, id + "-geometry-probe.png", probe));
      artifacts.add(store.save(runId, id + "-geometry-control.png", control));
      String json = "{\"version\":1,\"source\":\"lynx-native-host-geometry-v1\",\"id\":\"" + id
          + "\",\"platform\":\"android\",\"runId\":\"" + store.runId + "\",\"bundleSha256\":\""
          + store.bundleSha256 + "\",\"geometry\":" + jsonGeometry(geometry)
          + (screen == null ? "" : ",\"screenMetrics\":" + jsonScreen(screen)) + "}";
      artifacts.add(store.saveGeometry(runId, id, json.getBytes(StandardCharsets.UTF_8)));
      return new Capture(geometry, artifacts, screen);
    } catch (Exception error) {
      store.fail();
      throw error;
    }
  }

  private static void validateScreen(double[] screen) throws IOException {
    if (screen == null || screen.length != 3) throw new IOException("Missing native screen metrics");
    for (double value : screen) {
      if (!Double.isFinite(value) || value <= 0) throw new IOException("Invalid native screen metrics");
    }
  }

  private static String jsonScreen(double[] screen) {
    return "{\"version\":1,\"source\":\"lynx-native-screen-v1\",\"width\":" + screen[0]
        + ",\"height\":" + screen[1] + ",\"pixelRatio\":" + screen[2] + "}";
  }

  private static void validate(double[] rect) throws IOException {
    if (rect == null || rect.length != 6) throw new IOException("Missing native geometry");
    for (double value : rect) {
      if (!Double.isFinite(value)) throw new IOException("Non-finite native geometry");
    }
    if (rect[4] <= 0 || rect[5] <= 0 || Math.abs(rect[2] - rect[0] - rect[4]) > 0.01
        || Math.abs(rect[3] - rect[1] - rect[5]) > 0.01) {
      throw new IOException("Empty or inconsistent native geometry");
    }
  }

  private static String jsonGeometry(Map<String, double[]> geometry) {
    StringBuilder json = new StringBuilder("{");
    for (String field : FIELDS) {
      if (json.length() > 1) json.append(',');
      json.append('"').append(field).append("\":{");
      double[] rect = geometry.get(field);
      for (int index = 0; index < RECT_FIELDS.length; index++) {
        if (index > 0) json.append(',');
        json.append('"').append(RECT_FIELDS[index]).append("\":").append(rect[index]);
      }
      json.append('}');
    }
    return json.append('}').toString();
  }
}
