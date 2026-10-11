package com.weapptailwindcss.lynxcompat;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.view.ViewGroup;
import com.lynx.tasm.LynxView;
import com.lynx.tasm.LynxViewBuilder;
import com.lynx.tasm.LynxColorScheme;
import com.lynx.tasm.ThreadStrategyForRendering;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.File;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import java.io.InputStream;
import java.util.HashMap;

public final class MainActivity extends Activity {
  private LynxView lynxView;
  private ReporterBinding binding;

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    try (InputStream input = getAssets().open("main.lynx.bundle")) {
      byte[] bundle = readAllBytes(input);
      try (InputStream contextInput = getAssets().open("run-context.json")) {
        JSONObject context = new JSONObject(new String(readAllBytes(contextInput), StandardCharsets.UTF_8));
        if (context.getInt("version") != 1) {
          throw new IOException("Unsupported evidence protocol");
        }
        binding = new ReporterBinding(new EvidenceStore(
          new File(getFilesDir(), "lynx-compat"), context.getString("runId"), bundle, context.getString("bundleSha256")));
      }
      LynxViewBuilder builder = new LynxViewBuilder()
        .setThreadStrategyForRendering(ThreadStrategyForRendering.ALL_ON_UI)
        .setColorScheme(LynxColorScheme.LIGHT);
      builder.registerModule("CompatibilityReporter", CompatibilityReporterModule.class, binding);
      lynxView = builder.build(this);
      binding.attach(lynxView);
      setContentView(lynxView, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
      lynxView.renderTemplateWithBaseUrl(bundle, new HashMap<>(), "assets://main.lynx.bundle");
    } catch (Exception error) {
      if (binding != null) { binding.invalidate(); binding.store.fail(); }
      Log.e("LynxEvidence", "Evidence initialization failed", error);
    }
  }

  private static byte[] readAllBytes(InputStream input) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    byte[] buffer = new byte[8192];
    int length;
    while ((length = input.read(buffer)) != -1) {
      output.write(buffer, 0, length);
    }
    return output.toByteArray();
  }

  @Override
  protected void onDestroy() {
    if (lynxView != null) {
      binding.invalidate();
      lynxView.destroy();
    }
    super.onDestroy();
  }
}
