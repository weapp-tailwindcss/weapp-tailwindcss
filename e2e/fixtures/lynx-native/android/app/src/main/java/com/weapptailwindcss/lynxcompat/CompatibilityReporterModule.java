package com.weapptailwindcss.lynxcompat;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
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
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.lang.ref.WeakReference;
import java.nio.charset.StandardCharsets;

public final class CompatibilityReporterModule extends LynxModule {
  private static final int ACTIVE_PSEUDO_STATE = 8;
  private static WeakReference<LynxView> lynxViewReference = new WeakReference<>(null);
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  public CompatibilityReporterModule(Context context) {
    super(context);
  }

  static void setLynxView(LynxView lynxView) {
    lynxViewReference = new WeakReference<>(lynxView);
  }

  @LynxMethod
  public void submit(String report) {
    writeReport(mContext, report);
  }

  @LynxMethod
  public void submitArtifact(String name, String data) {
    if (!name.matches("[a-z0-9-]+\\.png")) {
      throw new IllegalArgumentException("Invalid artifact name");
    }
    String payload = data.contains(",") ? data.substring(data.indexOf(',') + 1) : data;
    File directory = new File(mContext.getFilesDir(), "lynx-compat/artifacts");
    if (!directory.exists() && !directory.mkdirs()) {
      throw new IllegalStateException("Cannot create artifact directory");
    }
    writeBytes(new File(directory, name), Base64.decode(payload, Base64.DEFAULT));
  }

  @LynxMethod
  public void measure(String identifier, Callback callback) {
    mainHandler.post(() -> {
      LynxBaseUI ui = findUI(identifier);
      if (ui == null) {
        callback.invoke((Object) null);
        return;
      }
      Rect rect = ui.getRectToWindow();
      float density = mContext.getResources().getDisplayMetrics().density;
      JavaOnlyMap result = new JavaOnlyMap();
      result.putDouble("left", rect.left / density);
      result.putDouble("right", rect.right / density);
      result.putDouble("top", rect.top / density);
      result.putDouble("bottom", rect.bottom / density);
      result.putDouble("width", rect.width() / density);
      result.putDouble("height", rect.height() / density);
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

  static void writeFatal(Context context, Throwable error) {
    String message = error.getMessage() == null ? error.getClass().getName() : error.getMessage();
    writeReport(context, "{\"fatalError\":\"" + message.replace("\"", "'") + "\"}");
  }

  private static void writeReport(Context context, String report) {
    File directory = new File(context.getFilesDir(), "lynx-compat");
    if (!directory.exists() && !directory.mkdirs()) {
      throw new IllegalStateException("Cannot create report directory");
    }
    File output = new File(directory, "report.json");
    writeBytes(output, report.getBytes(StandardCharsets.UTF_8));
  }

  private static void writeBytes(File output, byte[] data) {
    File temporary = new File(output.getParentFile(), output.getName() + ".tmp");
    try (FileOutputStream stream = new FileOutputStream(temporary)) {
      stream.write(data);
    } catch (IOException error) {
      throw new IllegalStateException(error);
    }
    publish(temporary, output);
  }

  private static void publish(File temporary, File output) {
    if (output.exists() && !output.delete()) {
      throw new IllegalStateException("Cannot replace output");
    }
    if (!temporary.renameTo(output)) {
      throw new IllegalStateException("Cannot publish output");
    }
  }
}
