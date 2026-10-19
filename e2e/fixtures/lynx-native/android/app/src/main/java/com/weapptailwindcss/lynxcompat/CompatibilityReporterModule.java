package com.weapptailwindcss.lynxcompat;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;
import android.view.View;
import com.lynx.react.bridge.Callback;
import com.lynx.react.bridge.JavaOnlyMap;
import com.lynx.jsbridge.LynxMethod;
import com.lynx.jsbridge.LynxModule;
import com.lynx.tasm.LynxView;
import com.lynx.tasm.LynxEnv;
import com.lynx.tasm.behavior.event.EventTarget;
import com.lynx.tasm.behavior.ui.LynxBaseUI;
import com.lynx.tasm.behavior.ui.LynxUI;
import java.io.ByteArrayOutputStream;

public final class CompatibilityReporterModule extends LynxModule {
  private static final int ACTIVE_PSEUDO_STATE = 8;
  private final ReporterBinding binding;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  public CompatibilityReporterModule(Context context, Object parameter) {
    super(context, parameter);
    if (!(parameter instanceof ReporterBinding)) throw new IllegalArgumentException("Missing view binding");
    binding = (ReporterBinding) parameter;
  }

  @LynxMethod
  public void setColorScheme(String runId, String requestId, String scheme, Callback callback) {
    mainHandler.post(() -> {
      if (!requireView(callback)) return;
      if (binding.colorScheme == null) {
        callback.invoke((Object) null);
        return;
      }
      binding.colorScheme.set(runId, requestId, scheme, receipt -> {
        if (receipt == null) {
          failEvidence(new IllegalStateException("Color scheme update was not acknowledged"));
          callback.invoke((Object) null);
          return;
        }
        JavaOnlyMap result = new JavaOnlyMap();
        result.putString("runId", receipt.runId);
        result.putString("requestId", receipt.requestId);
        result.putString("scheme", receipt.scheme);
        callback.invoke(result);
      });
    });
  }

  @LynxMethod
  public void captureColorScheme(String runId, String requestId, String identifier, Callback callback) {
    mainHandler.post(() -> {
      if (!requireView(callback)) return;
      if (binding.colorScheme == null || !binding.colorScheme.isCurrent(runId, requestId)) {
        callback.invoke((Object) null);
        return;
      }
      captureNow(identifier, callback);
    });
  }

  @LynxMethod
  public void getEvidenceContext(Callback callback) {
    mainHandler.post(() -> {
      if (!requireView(callback)) return;
      JavaOnlyMap context = new JavaOnlyMap();
      context.putInt("version", 1);
      context.putString("runId", binding.store.runId);
      context.putString("bundleSha256", binding.store.bundleSha256);
      callback.invoke(context);
    });
  }

  @LynxMethod
  public void submit(String runId, String report, Callback callback) {
    mainHandler.post(() -> {
      if (!requireView(callback)) return;
      try {
        JSONObject value = new JSONObject(report);
        JSONObject evidence = new JSONObject();
        evidence.put("version", 1);
        evidence.put("runId", binding.store.runId);
        evidence.put("bundleSha256", binding.store.bundleSha256);
        JSONArray artifacts = new JSONArray();
        for (EvidenceStore.Receipt receipt : binding.store.receipts()) {
          JSONObject artifact = new JSONObject();
          artifact.put("runId", receipt.runId);
          artifact.put("name", receipt.name);
          artifact.put("sha256", receipt.sha256);
          artifact.put("byteLength", receipt.byteLength);
          artifacts.put(artifact);
        }
        evidence.put("artifacts", artifacts);
        value.put("evidence", evidence);
        binding.store.publish(runId, value.toString());
        callback.invoke(true);
      } catch (Exception error) {
        failEvidence(error);
        callback.invoke(false);
      }
    });
  }

  @LynxMethod
  public void fail(String runId, String message, Callback callback) {
    mainHandler.post(() -> {
      try {
        binding.store.publishFailure(runId, message);
        callback.invoke(true);
      } catch (Exception error) {
        Log.e("LynxEvidence", "Evidence failure could not be persisted", error);
        callback.invoke(false);
      }
    });
  }

  @LynxMethod
  public void submitArtifact(String runId, String name, String data, Callback callback) {
    mainHandler.post(() -> {
      if (!requireView(callback)) return;
      try {
        String payload = data.startsWith("data:image/png;base64,") ? data.substring(22) : data;
        EvidenceStore.Receipt receipt = binding.store.save(runId, name, Base64.decode(payload, Base64.DEFAULT));
        callback.invoke(EvidenceBridge.receipt(receipt));
      } catch (Exception error) {
        failEvidence(error);
        callback.invoke((Object) null);
      }
    });
  }

  private void failEvidence(Throwable error) {
    if (binding.store != null) {
      binding.store.fail();
    }
    Log.e("LynxEvidence", "Evidence run failed", error);
  }

  /** 视图失效与真实节点缺失分开回传；JS 尚未取得 runId 时仍由宿主保存失败。 */
  private boolean requireView(Callback callback) {
    if (binding.view() != null) return true;
    JavaOnlyMap failure = new JavaOnlyMap();
    failure.putInt("version", 1);
    failure.putString("source", "lynx-native-evidence");
    failure.putString("category", "environment");
    failure.putString("code", "view-expired");
    failure.putString("message", "View binding expired");
    try {
      binding.store.publishFailure(binding.store.runId,
          "{\"version\":1,\"source\":\"lynx-native-evidence\",\"category\":\"environment\",\"code\":\"view-expired\",\"message\":\"View binding expired\"}");
    } catch (Exception error) {
      Log.e("LynxEvidence", "Expired view failure could not be persisted", error);
    }
    JavaOnlyMap result = new JavaOnlyMap();
    result.putMap("error", failure);
    callback.invoke(result);
    return false;
  }

  @LynxMethod
  public void captureMediaGate(String runId, Callback callback) {
    mainHandler.post(() -> {
      if (!requireView(callback)) return;
      try {
        MediaGateEvidence.Capture capture = MediaGateEvidence.capture(binding.store, runId, new MediaGateEvidence.Host() {
          public boolean isUiThread() { return Looper.myLooper() == Looper.getMainLooper(); }
          public String sdkVersion() { return LynxEnv.inst().getLynxVersion(); }
          public String sdkArtifact() throws Exception { return AndroidSdkIdentity.capture(binding.view().getContext(), binding.store); }
          public double[] measure(String id) { return measureNow(id); }
          public byte[] capture(String id) { return captureBytes(id); }
        });
        callback.invoke(EvidenceBridge.mediaGate(binding.store, capture));
      } catch (Exception error) {
        failEvidence(error);
        callback.invoke((Object) null);
      }
    });
  }

  @LynxMethod
  public void captureGeometry(String runId, String identifier, Callback callback) {
    mainHandler.post(() -> {
      if (!requireView(callback)) return;
      try {
        GeometryEvidence.Capture capture = GeometryEvidence.capture(binding.store, runId, identifier, new GeometryEvidence.Host() {
          public double[] measure(String id) { return measureNow(id); }
          public byte[] capture(String id) { return captureBytes(id); }
        });
        JavaOnlyMap geometry = new JavaOnlyMap();
        for (java.util.Map.Entry<String, double[]> entry : capture.geometry.entrySet()) {
          geometry.putMap(entry.getKey(), EvidenceBridge.rect(entry.getValue()));
        }
        JavaOnlyMap result = new JavaOnlyMap();
        result.putMap("geometry", geometry);
        result.putArray("artifacts", EvidenceBridge.artifacts(capture.artifacts));
        callback.invoke(result);
      } catch (Exception error) {
        failEvidence(error);
        callback.invoke((Object) null);
      }
    });
  }

  @LynxMethod
  public void measure(String identifier, Callback callback) {
    mainHandler.post(() -> {
      if (!requireView(callback)) return;
      callback.invoke(EvidenceBridge.rect(measureNow(identifier)));
    });
  }

  private double[] measureNow(String identifier) {
    LynxBaseUI ui = findUI(identifier);
    if (ui == null) return null;
    LynxBaseUI.TransOffset corners = ui.getTransformValue(0, 0, 0, 0);
    return GeometryBounds.fromCorners(new float[][] {
      corners.left_top, corners.right_top, corners.right_bottom, corners.left_bottom,
    }, ui.getLynxContext().getScreenMetrics().density);
  }

  @LynxMethod
  public void capture(String identifier, Callback callback) {
    mainHandler.post(() -> captureNow(identifier, callback));
  }

  private void captureNow(String identifier, Callback callback) {
    if (!requireView(callback)) return;
    byte[] data = captureBytes(identifier);
    callback.invoke(data == null ? null : Base64.encodeToString(data, Base64.NO_WRAP));
  }

  private byte[] captureBytes(String identifier) {
    LynxBaseUI ui = findUI(identifier);
    if (!(ui instanceof LynxUI<?>)) {
      return null;
    }
    View view = ((LynxUI<?>) ui).getView();
    if (view == null || view.getWidth() <= 0 || view.getHeight() <= 0) {
      return null;
    }
    // JS 传入固定大小且非 flatten 的父容器，由 Android 合成子节点的可见性、透明度与变换。
    return captureView(view);
  }

  @LynxMethod
  public void pointerEventsNone(String identifier, Callback callback) {
    mainHandler.post(() -> {
      if (!requireView(callback)) return;
      LynxBaseUI ui = findUI(identifier);
      callback.invoke(ui == null ? null : ui.pointerEvents() == EventTarget.PointerEventsValue.None);
    });
  }

  @LynxMethod
  public void setPseudoActive(String identifier, boolean active, Callback callback) {
    mainHandler.post(() -> {
      if (!requireView(callback)) return;
      LynxView lynxView = binding.view();
      LynxBaseUI ui = findUI(identifier);
      if (lynxView == null || ui == null) {
        callback.invoke(false);
        return;
      }
      int previous = ui.getPseudoStatus();
      int current = active ? previous | ACTIVE_PSEUDO_STATE : previous & ~ACTIVE_PSEUDO_STATE;
      lynxView.getLynxContext().getEventEmitter().onPseudoStatusChanged(ui.getSign(), previous, current);
      ui.onPseudoStatusChanged(previous, current);
      callback.invoke(true);
    });
  }

  private LynxBaseUI findUI(String identifier) {
    LynxView lynxView = binding.view();
    return lynxView == null ? null : lynxView.findUIByIdSelector(identifier);
  }

  private static byte[] captureView(View view) {
    Bitmap bitmap = Bitmap.createBitmap(view.getWidth(), view.getHeight(), Bitmap.Config.ARGB_8888);
    view.draw(new Canvas(bitmap));
    try {
      ByteArrayOutputStream output = new ByteArrayOutputStream();
      if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) return null;
      return output.toByteArray();
    } finally {
      bitmap.recycle();
    }
  }

}
