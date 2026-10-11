package com.weapptailwindcss.lynxcompat;

import android.app.Application;
import com.lynx.tasm.LynxEnv;

public final class CompatibilityApplication extends Application {
  @Override
  public void onCreate() {
    super.onCreate();
    LynxEnv.inst().init(this, null, null, null);
  }
}
