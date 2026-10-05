package com.weapptailwindcss.lynxcompat;

import android.app.Activity;
import android.os.Bundle;
import android.view.ViewGroup;
import com.lynx.tasm.LynxView;
import com.lynx.tasm.LynxViewBuilder;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.File;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import java.io.InputStream;
import java.util.HashMap;

public final class MainActivity extends Activity {
  private LynxView lynxView;

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    lynxView = new LynxViewBuilder().build(this);
    CompatibilityReporterModule.setLynxView(lynxView);
    setContentView(lynxView, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    try (InputStream input = getAssets().open("main.lynx.bundle")) {
      byte[] bundle = readAllBytes(input);
      try (InputStream contextInput = getAssets().open("run-context.json")) {
        JSONObject context = new JSONObject(new String(readAllBytes(contextInput), StandardCharsets.UTF_8));
        if (context.getInt("version") != 1) {
          throw new IOException("Unsupported evidence protocol");
        }
        CompatibilityReporterModule.setEvidenceStore(new EvidenceStore(
          new File(getFilesDir(), "lynx-compat"), context.getString("runId"), bundle, context.getString("bundleSha256")));
      }
      lynxView.renderTemplateWithBaseUrl(bundle, new HashMap<>(), "assets://main.lynx.bundle");
    } catch (Exception error) {
      CompatibilityReporterModule.failEvidence(error);
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
      CompatibilityReporterModule.setLynxView(null);
      lynxView.destroy();
    }
    super.onDestroy();
  }
}
