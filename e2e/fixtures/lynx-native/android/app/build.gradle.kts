plugins {
  id("com.android.application")
}

android {
  namespace = "com.weapptailwindcss.lynxcompat"
  compileSdk = providers.gradleProperty("lynxCompileSdk").orNull?.toInt() ?: 35
  buildToolsVersion = providers.gradleProperty("lynxBuildToolsVersion").orNull ?: "35.0.0"

  defaultConfig {
    applicationId = "com.weapptailwindcss.lynxcompat"
    minSdk = 24
    targetSdk = 35
    versionCode = 1
    versionName = "1.0"
  }

  packaging {
    jniLibs.pickFirsts += setOf("lib/*/libc++_shared.so")
  }
}

dependencies {
  implementation("androidx.core:core:1.15.0")
  implementation("org.lynxsdk.lynx:lynx:4.0.1")
}
