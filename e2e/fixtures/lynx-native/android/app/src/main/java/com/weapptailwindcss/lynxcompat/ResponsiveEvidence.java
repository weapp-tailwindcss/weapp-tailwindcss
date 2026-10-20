package com.weapptailwindcss.lynxcompat;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/** 每阶段由宿主重新读取节点并写入独立侧车，JS 不能提交 viewport 或几何。 */
final class ResponsiveEvidence {
  static final class Capture {
    final JSONObject frame;
    final List<EvidenceStore.Receipt> artifacts;
    Capture(JSONObject frame, List<EvidenceStore.Receipt> artifacts) { this.frame = frame; this.artifacts = artifacts; }
  }
  private static final String[] RECT = {"left", "top", "right", "bottom", "width", "height"};
  static JSONObject rect(double[] rect) throws Exception {
    if (rect == null || rect.length != 6) throw new IllegalStateException("Missing responsive node");
    JSONObject value = new JSONObject();
    for (int index = 0; index < rect.length; index++) {
      if (!Double.isFinite(rect[index])) throw new IllegalStateException("Invalid responsive geometry");
      value.put(RECT[index], rect[index]);
    }
    if (rect[4] <= 0 || rect[5] <= 0 || Math.abs(rect[2] - rect[0] - rect[4]) > 0.01
        || Math.abs(rect[3] - rect[1] - rect[5]) > 0.01) throw new IllegalStateException("Empty responsive geometry");
    return value;
  }
  static Capture capture(EvidenceStore store, ResponsiveSession.Receipt receipt, GeometryEvidence.Host host) throws Exception {
    store.checkRun(receipt.runId);
    JSONObject frame = new JSONObject();
    frame.put("runId", receipt.runId).put("requestId", receipt.requestId).put("phase", receipt.phase);
    frame.put("original", size(receipt.original)).put("requested", size(receipt.requested));
    JSONObject viewport = size(receipt.viewport);
    viewport.put("measuredWidth", receipt.viewport[2]).put("measuredHeight", receipt.viewport[3]).put("pixelRatio", receipt.viewport[4]);
    frame.put("viewport", viewport).put("threshold", rect(receipt.threshold));
    JSONObject geometry = new JSONObject();
    String[] fields = {"probe", "control", "probeContainer", "controlContainer"};
    String[] nodes = {"probe-variant-responsive", "control-variant-responsive", "probe-container-variant-responsive", "control-container-variant-responsive"};
    for (int index = 0; index < fields.length; index++) geometry.put(fields[index], rect(host.measure(nodes[index])));
    frame.put("geometry", geometry);
    List<EvidenceStore.Receipt> artifacts = new ArrayList<>();
    String prefix = "variant-responsive-" + receipt.phase;
    artifacts.add(store.save(receipt.runId, prefix + "-probe.png", host.capture(nodes[2])));
    artifacts.add(store.save(receipt.runId, prefix + "-control.png", host.capture(nodes[3])));
    JSONObject sidecar = new JSONObject();
    sidecar.put("version", 1).put("source", "lynx-native-responsive-v1").put("platform", "android")
      .put("bundleSha256", store.bundleSha256).put("frame", frame);
    artifacts.add(store.saveResponsive(receipt.runId, receipt.phase, sidecar.toString().getBytes(StandardCharsets.UTF_8)));
    return new Capture(frame, artifacts);
  }
  private static JSONObject size(double[] values) throws Exception { return new JSONObject().put("width", values[0]).put("height", values[1]); }
}
