package com.weapptailwindcss.lynxcompat;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.lynx.tasm.LynxView;
import com.lynx.tasm.LynxViewBuilder;
import com.lynx.tasm.LynxColorScheme;
import com.lynx.tasm.ThreadStrategyForRendering;
import com.lynx.tasm.behavior.Behavior;
import com.lynx.tasm.behavior.LynxContext;
import com.lynx.tasm.behavior.ui.LynxUI;
import com.lynx.tasm.behavior.ui.image.UIImage;
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
      boolean captureOnly;
      boolean captureAssets;
      try (InputStream contextInput = getAssets().open("run-context.json")) {
        JSONObject context = new JSONObject(new String(readAllBytes(contextInput), StandardCharsets.UTF_8));
        if (context.getInt("version") != 1) {
          throw new IOException("Unsupported evidence protocol");
        }
        binding = new ReporterBinding(new EvidenceStore(
          new File(getFilesDir(), "lynx-compat"), context.getString("runId"), bundle, context.getString("bundleSha256")));
        captureOnly = context.optBoolean("captureOnly", false);
        captureAssets = context.optBoolean("captureAssets", false);
      }
      LynxViewBuilder builder = new LynxViewBuilder()
        .setThreadStrategyForRendering(ThreadStrategyForRendering.ALL_ON_UI)
        .setColorScheme(LynxColorScheme.LIGHT);
      if (captureAssets) {
        builder.setImageFetcher(new CaptureImageFetcher());
        builder.addBehavior(new Behavior("image", false) {
          @Override
          public LynxUI createUI(LynxContext context) {
            return new UIImage(context);
          }

          @Override
          public LynxUI createUIFiber(LynxContext context) {
            return new UIImage(context);
          }

          @Override
          public LynxUI createUIWithParams(LynxContext context, Object params) {
            return new UIImage(context, params);
          }
        });
      }
      builder.registerModule("CompatibilityReporter", CompatibilityReporterModule.class, binding);
      lynxView = builder.build(this);
      binding.attach(lynxView);
      if (captureOnly) {
        installCaptureContent();
      } else {
        setContentView(lynxView, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
      }
      lynxView.renderTemplateWithBaseUrl(bundle, new HashMap<>(), "assets://main.lynx.bundle");
    } catch (Exception error) {
      if (binding != null) { binding.invalidate(); binding.store.fail(); }
      Log.e("LynxEvidence", "Evidence initialization failed", error);
    }
  }

  private void installCaptureContent() {
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    FrameLayout content = new FrameLayout(this);
    content.setBackgroundColor(0xff0b1011);
    ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
      Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
      view.setPadding(insets.left, insets.top, insets.right, insets.bottom);
      return WindowInsetsCompat.CONSUMED;
    });
    content.addView(lynxView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    setContentView(content, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    ViewCompat.requestApplyInsets(content);
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
