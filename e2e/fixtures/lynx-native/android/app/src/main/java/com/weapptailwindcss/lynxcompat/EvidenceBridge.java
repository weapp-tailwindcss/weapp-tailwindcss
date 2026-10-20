package com.weapptailwindcss.lynxcompat;

import com.lynx.react.bridge.JavaOnlyArray;
import com.lynx.react.bridge.JavaOnlyMap;
import java.util.List;
import java.util.Map;
import java.util.Iterator;
import org.json.JSONObject;

/** 统一桥接原生已落盘的结果，不接收 JS 自报的取证字段。 */
final class EvidenceBridge {
  static JavaOnlyMap rect(double[] values) {
    if (values == null) return null;
    JavaOnlyMap result = new JavaOnlyMap();
    String[] fields = {"left", "top", "right", "bottom", "width", "height"};
    for (int index = 0; index < fields.length; index++) result.putDouble(fields[index], values[index]);
    return result;
  }

  static JavaOnlyMap receipt(EvidenceStore.Receipt receipt) {
    JavaOnlyMap result = new JavaOnlyMap();
    result.putString("runId", receipt.runId);
    result.putString("name", receipt.name);
    result.putString("sha256", receipt.sha256);
    result.putInt("byteLength", receipt.byteLength);
    return result;
  }

  static JavaOnlyArray artifacts(List<EvidenceStore.Receipt> receipts) {
    JavaOnlyArray result = new JavaOnlyArray();
    for (EvidenceStore.Receipt receipt : receipts) result.pushMap(receipt(receipt));
    return result;
  }

  static JavaOnlyMap jsonMap(JSONObject value) throws Exception {
    JavaOnlyMap result = new JavaOnlyMap();
    Iterator<String> keys = value.keys();
    while (keys.hasNext()) {
      String key = keys.next();
      Object item = value.get(key);
      if (item instanceof JSONObject) result.putMap(key, jsonMap((JSONObject) item));
      else if (item instanceof Number) result.putDouble(key, ((Number) item).doubleValue());
      else if (item instanceof String) result.putString(key, (String) item);
      else throw new IllegalArgumentException("Unsupported native SDK identity field");
    }
    return result;
  }

  static JavaOnlyMap mediaGate(EvidenceStore store, MediaGateEvidence.Capture capture) throws Exception {
    JavaOnlyMap mediaGate = new JavaOnlyMap();
    mediaGate.putString("limitationId", MediaGateEvidence.LIMITATION);
    mediaGate.putString("runId", store.runId);
    mediaGate.putString("bundleSha256", store.bundleSha256);
    mediaGate.putString("sdkVersion", capture.sdkVersion);
    mediaGate.putMap("sdkArtifact", jsonMap(new JSONObject(capture.sdkArtifact)));
    JavaOnlyArray probes = new JavaOnlyArray();
    for (Map.Entry<String, double[][]> entry : capture.probes.entrySet()) {
      JavaOnlyMap probe = new JavaOnlyMap();
      probe.putString("id", entry.getKey());
      probe.putMap("probe", rect(entry.getValue()[0]));
      probe.putMap("container", rect(entry.getValue()[1]));
      probes.pushMap(probe);
    }
    mediaGate.putArray("probes", probes);
    JavaOnlyMap result = new JavaOnlyMap();
    result.putMap("mediaGate", mediaGate);
    result.putArray("artifacts", artifacts(capture.artifacts));
    return result;
  }
}
