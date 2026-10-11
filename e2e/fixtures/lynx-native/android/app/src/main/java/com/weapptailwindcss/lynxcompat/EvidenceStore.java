package com.weapptailwindcss.lynxcompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** 每次启动独占目录，所有落盘失败均使本轮证据失效。 */
public final class EvidenceStore {
  public final String runId;
  public final String bundleSha256;
  private final File directory;
  private final List<Receipt> receipts = new ArrayList<>();
  private boolean failed;
  private boolean published;

  public static final class Receipt {
    public final String runId;
    public final String name;
    public final String sha256;
    public final int byteLength;

    Receipt(String runId, String name, byte[] data) {
      this.runId = runId;
      this.name = name;
      this.sha256 = sha256(data);
      this.byteLength = data.length;
    }
  }

  public EvidenceStore(File root, String runId, byte[] bundle, String expectedSha256) throws IOException {
    if (runId == null || !runId.matches("[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")) {
      throw new IOException("Invalid evidence run ID");
    }
    this.runId = runId;
    this.bundleSha256 = sha256(bundle);
    if (!this.bundleSha256.equals(expectedSha256)) {
      throw new IOException("Loaded bundle does not match evidence context");
    }
    this.directory = new File(root, runId);
    if ((!root.isDirectory() && !root.mkdirs()) || !directory.mkdir()
        || !new File(directory, "artifacts").mkdir()) {
      throw new IOException("Cannot create exclusive evidence directory");
    }
  }

  public synchronized List<Receipt> receipts() {
    return Collections.unmodifiableList(new ArrayList<>(receipts));
  }

  public synchronized Receipt save(String requestedRunId, String name, byte[] data) throws IOException {
    try {
      checkRun(requestedRunId);
      if (name == null || !name.matches("[a-z0-9-]+\\.png") || data == null || data.length == 0) {
        throw new IOException("Invalid artifact payload");
      }
      for (Receipt receipt : receipts) {
        if (receipt.name.equals(name)) {
          throw new IOException("Duplicate artifact receipt");
        }
      }
      write(new File(new File(directory, "artifacts"), name), data);
      Receipt receipt = new Receipt(runId, name, data);
      receipts.add(receipt);
      return receipt;
    } catch (IOException | RuntimeException error) {
      failed = true;
      throw error;
    }
  }

  public synchronized void publish(String requestedRunId, String report) throws IOException {
    try {
      checkRun(requestedRunId);
      write(new File(directory, "report.json"), report.getBytes(StandardCharsets.UTF_8));
      published = true;
    } catch (IOException | RuntimeException error) {
      failed = true;
      throw error;
    }
  }

  public synchronized void fail() {
    failed = true;
  }

  public synchronized void publishFailure(String requestedRunId, String message) throws IOException {
    if (published || !runId.equals(requestedRunId)) {
      throw new IOException("Evidence failure run ID mismatch");
    }
    try {
      String value = "{\"runId\":" + quoteJson(runId) + ",\"message\":"
          + quoteJson(message == null ? "unknown native evidence failure" : message) + "}";
      write(new File(directory, "failure.json"), value.getBytes(StandardCharsets.UTF_8));
    } catch (IOException error) {
      failed = true;
      throw new IOException("Cannot publish evidence failure", error);
    }
    failed = true;
  }

  private static String quoteJson(String value) {
    StringBuilder result = new StringBuilder(value.length() + 2);
    result.append('"');
    for (int index = 0; index < value.length(); index++) {
      char character = value.charAt(index);
      switch (character) {
        case '"': result.append("\\\""); break;
        case '\\': result.append("\\\\"); break;
        case '\b': result.append("\\b"); break;
        case '\f': result.append("\\f"); break;
        case '\n': result.append("\\n"); break;
        case '\r': result.append("\\r"); break;
        case '\t': result.append("\\t"); break;
        default:
          if (character < 0x20) {
            result.append("\\u00");
            result.append(HEX.charAt((character >>> 4) & 0x0f));
            result.append(HEX.charAt(character & 0x0f));
          } else {
            result.append(character);
          }
      }
    }
    return result.append('"').toString();
  }

  private static final String HEX = "0123456789abcdef";

  private void checkRun(String requestedRunId) throws IOException {
    if (failed || published || !runId.equals(requestedRunId)) {
      throw new IOException("Evidence run is failed, published, or mismatched");
    }
  }

  private static void write(File output, byte[] data) throws IOException {
    File temporary = new File(output.getParentFile(), output.getName() + ".tmp");
    if (output.exists() || !temporary.createNewFile()) {
      throw new IOException("Cannot reuse an evidence output");
    }
    try (FileOutputStream stream = new FileOutputStream(temporary)) {
      stream.write(data);
      stream.getFD().sync();
    }
    if (!temporary.renameTo(output)) {
      throw new IOException("Cannot publish evidence output");
    }
  }

  public static String sha256(byte[] data) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(data);
      StringBuilder result = new StringBuilder();
      for (byte value : digest) {
        result.append(String.format("%02x", value & 0xff));
      }
      return result.toString();
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException(error);
    }
  }
}
