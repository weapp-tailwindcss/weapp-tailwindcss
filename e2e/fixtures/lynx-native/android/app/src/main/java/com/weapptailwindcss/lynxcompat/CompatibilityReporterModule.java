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
import com.lynx.tasm.behavior.event.EventTarget;
import com.lynx.tasm.behavior.ui.LynxBaseUI;
import com.lynx.tasm.behavior.ui.LynxUI;
import java.io.ByteArrayOutputStream;
import java.lang.ref.WeakReference;

public final class CompatibilityReporterModule extends LynxModule {
  private static final int ACTIVE_PSEUDO_STATE = 8;
  private static EvidenceStore evidenceStore;

  static void setEvidenceStore(EvidenceStore store) {
    evidenceStore = store;
  }
  private static WeakReference<LynxView> lynxViewReference = new WeakReference<>(null);
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  public CompatibilityReporterModule(Context context) {
    super(context);
  }

  static void setLynxView(LynxView lynxView) {
    lynxViewReference = new WeakReference<>(lynxView);
  }

  @LynxMethod
  public void getEvidenceContext(Callback callback) {
    if (evidenceStore == null) {
      callback.invoke((Object) null);
      return;
    }
    JavaOnlyMap context = new JavaOnlyMap();
    context.putInt("version", 1);
    context.putString("runId", evidenceStore.runId);
    context.putString("bundleSha256", evidenceStore.bundleSha256);
    callback.invoke(context);
  }

  @LynxMethod
  public void submit(String runId, String report, Callback callback) {
    try {
      JSONObject value = new JSONObject(report);
      JSONObject evidence = new JSONObject();
      evidence.put("version", 1);
      evidence.put("runId", evidenceStore.runId);
      evidence.put("bundleSha256", evidenceStore.bundleSha256);
      JSONArray artifacts = new JSONArray();
      for (EvidenceStore.Receipt receipt : evidenceStore.receipts()) {
        JSONObject artifact = new JSONObject();
        artifact.put("runId", receipt.runId);
        artifact.put("name", receipt.name);
        artifact.put("sha256", receipt.sha256);
        artifact.put("byteLength", receipt.byteLength);
        artifacts.put(artifact);
      }
      evidence.put("artifacts", artifacts);
      value.put("evidence", evidence);
      evidenceStore.publish(runId, value.toString());
      callback.invoke(true);
    } catch (Exception error) {
      failEvidence(error);
      callback.invoke(false);
    }
  }

  @LynxMethod
  public void submitArtifact(String runId, String name, String data, Callback callback) {
    try {
      String payload = data.startsWith("data:image/png;base64,") ? data.substring(22) : data;
      EvidenceStore.Receipt receipt = evidenceStore.save(runId, name, Base64.decode(payload, Base64.DEFAULT));
      JavaOnlyMap result = new JavaOnlyMap();
      result.putString("runId", receipt.runId);
      result.putString("name", receipt.name);
      result.putString("sha256", receipt.sha256);
      result.putInt("byteLength", receipt.byteLength);
      callback.invoke(result);
    } catch (Exception error) {
      failEvidence(error);
      callback.invoke((Object) null);
    }
  }

  static void failEvidence(Throwable error) {
    if (evidenceStore != null) {
      evidenceStore.fail();
    }
    Log.e("LynxEvidence", "Evidence run failed", error);
  }

  @LynxMethod
  public void measure(String identifier, Callback callback) {
    mainHandler.post(() -> {
      LynxBaseUI ui = findUI(identifier);
      if (ui == null) {
        callback.invoke((Object) null);
        return;
      }
      LynxBaseUI.TransOffset corners = ui.getTransformValue(0, 0, 0, 0);
      double[] rect = GeometryBounds.fromCorners(new float[][] {
        corners.left_top, corners.right_top, corners.right_bottom, corners.left_bottom,
      }, ui.getLynxContext().getScreenMetrics().density);
      if (rect == null) {
        callback.invoke((Object) null);
        return;
      }
      JavaOnlyMap result = new JavaOnlyMap();
      result.putDouble("left", rect[0]);
      result.putDouble("top", rect[1]);
      result.putDouble("right", rect[2]);
      result.putDouble("bottom", rect[3]);
      result.putDouble("width", rect[4]);
      result.putDouble("height", rect[5]);
      callback.invoke(result);
    });
  }

  @LynxMethod
  public void capture(String identifier, Callback callback) {
    mainHandler.post(() -> {
      LynxBaseUI ui = findUI(identifier);
      if (!(ui instanceof LynxUI<?>)) {
        callback.invoke((Object) null);
        return;
      }
      View view = ((LynxUI<?>) ui).getView();
      if (view == null || view.getWidth() <= 0 || view.getHeight() <= 0) {
        callback.invoke((Object) null);
        return;
      }
      // JS 传入固定大小且非 flatten 的父容器，由 Android 合成子节点的可见性、透明度与变换。
      callback.invoke(captureView(view));
    });
  }

  @LynxMethod
  public void pointerEventsNone(String identifier, Callback callback) {
    mainHandler.post(() -> {
      LynxBaseUI ui = findUI(identifier);
      callback.invoke(ui == null ? null : ui.pointerEvents() == EventTarget.PointerEventsValue.None);
    });
  }

  @LynxMethod
  public void setPseudoActive(String identifier, boolean active, Callback callback) {
    mainHandler.post(() -> {
      LynxView lynxView = lynxViewReference.get();
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

  private static LynxBaseUI findUI(String identifier) {
    LynxView lynxView = lynxViewReference.get();
    return lynxView == null ? null : lynxView.findUIByIdSelector(identifier);
  }

  private static String captureView(View view) {
    Bitmap bitmap = Bitmap.createBitmap(view.getWidth(), view.getHeight(), Bitmap.Config.ARGB_8888);
    view.draw(new Canvas(bitmap));
    String data = encodeBitmap(bitmap);
    bitmap.recycle();
    return data;
  }

  private static String encodeBitmap(Bitmap bitmap) {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, output);
    return Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
  }

}
