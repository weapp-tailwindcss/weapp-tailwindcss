package com.weapptailwindcss.lynxcompat;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** 流式读取当前宿主 APK 和指定 ABI 原始库，不接收 JS 提交的版本、摘要或路径。 */
public final class SdkArtifactIdentity {
  public static final class Identity {
    public final String apkSha256, librarySha256, bundleSha256;
    public final byte[] resolved, context;
    Identity(String apkSha256, String librarySha256, String bundleSha256, byte[] resolved, byte[] context) {
      this.apkSha256 = apkSha256;
      this.librarySha256 = librarySha256;
      this.bundleSha256 = bundleSha256;
      this.resolved = resolved;
      this.context = context;
    }
  }

  public static Identity inspect(File apk, String abi, String expectedLibrary) throws Exception {
    if (abi == null || !abi.matches("arm64-v8a|armeabi-v7a|x86|x86_64") || expectedLibrary == null || !expectedLibrary.matches("[a-f0-9]{64}")) {
      throw new IOException("Invalid native SDK ABI identity");
    }
    String apkHash;
    try (InputStream input = new FileInputStream(apk)) { apkHash = sha256(input); }
    try (ZipFile zip = new ZipFile(apk)) {
      String library;
      try (InputStream input = open(zip, "lib/" + abi + "/liblynx.so")) { library = sha256(input); }
      if (!library.equals(expectedLibrary)) throw new IOException("APK native library differs from resolved AAR");
      String bundle;
      try (InputStream input = open(zip, "assets/main.lynx.bundle")) { bundle = sha256(input); }
      return new Identity(apkHash, library, bundle, read(zip, "assets/lynx-sdk-identity.json"), read(zip, "assets/run-context.json"));
    }
  }

  private static InputStream open(ZipFile zip, String name) throws IOException {
    ZipEntry found = null;
    Enumeration<? extends ZipEntry> entries = zip.entries();
    while (entries.hasMoreElements()) {
      ZipEntry entry = entries.nextElement();
      if (entry.getName().equals(name)) {
        if (found != null || entry.isDirectory()) throw new IOException("Duplicate SDK ZIP identity");
        found = entry;
      }
    }
    if (found == null) throw new IOException("Missing SDK ZIP identity: " + name);
    return zip.getInputStream(found);
  }

  private static byte[] read(ZipFile zip, String name) throws IOException {
    try (InputStream input = open(zip, name); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192];
      int length;
      while ((length = input.read(buffer)) != -1) {
        if (output.size() + length > 65536) throw new IOException("Oversized SDK identity asset");
        output.write(buffer, 0, length);
      }
      return output.toByteArray();
    }
  }

  private static String sha256(InputStream input) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    byte[] buffer = new byte[8192];
    int length;
    while ((length = input.read(buffer)) != -1) digest.update(buffer, 0, length);
    StringBuilder result = new StringBuilder();
    for (byte value : digest.digest()) result.append(String.format("%02x", value & 255));
    return result.toString();
  }
}
